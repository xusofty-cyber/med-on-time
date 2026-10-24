import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OaArticle } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';

/**
 * 公众号文章业务码段（50313/50213/40313）。
 * 背景（2026-10-24 实测，账号为个人订阅号·未认证）：
 * - 草稿箱与素材接口有权限（draft/batchget、material/add_material、draft/add 全链路实证）；
 * - 发布接口 freepublish 与模板消息均 48001 无权限 → 发布动作保留在公众号侧人工完成。
 */
export const OaBusinessCode = {
  NotConfigured: 50313,
  UpstreamError: 50213,
  ApiUnauthorized: 40313,
} as const;

export interface OaArticleView {
  id: string;
  title: string;
  author: string | null;
  digest: string | null;
  contentSource: string;
  coverMediaId: string | null;
  coverUrl: string | null;
  wxDraftMediaId: string | null;
  /** local=未同步 / synced=已同步且无本地修改 / dirty=已同步但本地有修改 */
  syncState: 'local' | 'synced' | 'dirty';
  lastSyncedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 纯文本源稿 → 微信图文 HTML：转义后按空行分段，段内换行转 <br/>。导出以便单测/复用。 */
export function sourceToHtml(source: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  return source
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

interface WxErrorBody {
  errcode?: number;
  errmsg?: string;
  [k: string]: unknown;
}

@Injectable()
export class WechatOaService {
  private readonly logger = new Logger(WechatOaService.name);
  private tokenCache: { token: string; expiresAt: number } | null = null;
  private tokenPromise: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /* ---------------- 文章 CRUD（本地） ---------------- */

  async list(): Promise<OaArticleView[]> {
    const rows = await this.prisma.oaArticle.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  async get(id: string): Promise<OaArticleView> {
    return this.toView(await this.mustFind(id));
  }

  async create(
    input: { title: string; author?: string; digest?: string; contentSource: string },
    createdBy: string | null,
  ): Promise<OaArticleView> {
    const row = await this.prisma.oaArticle.create({
      data: {
        id: uuidv7(),
        title: input.title,
        author: input.author ?? null,
        digest: input.digest ?? null,
        contentSource: input.contentSource,
        createdBy,
      },
    });
    return this.toView(row);
  }

  async update(
    id: string,
    input: { title?: string; author?: string; digest?: string; contentSource?: string },
  ): Promise<OaArticleView> {
    const row = await this.mustFind(id);
    const updated = await this.prisma.oaArticle.update({
      where: { id: row.id },
      data: {
        title: input.title ?? undefined,
        author: input.author ?? undefined,
        digest: input.digest ?? undefined,
        contentSource: input.contentSource ?? undefined,
        version: { increment: 1 },
      },
    });
    return this.toView(updated);
  }

  /** 删除本地文章；若已同步到草稿箱，先删微信侧草稿（失败则整单失败，避免孤儿草稿）。 */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const row = await this.mustFind(id);
    if (row.wxDraftMediaId) {
      await this.wxPost('/cgi-bin/draft/delete', { media_id: row.wxDraftMediaId });
    }
    await this.prisma.oaArticle.update({
      where: { id: row.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    return { deleted: true };
  }

  /* ---------------- 封面与同步 ---------------- */

  /** 上传封面到微信永久素材库并绑定到文章。图片只进微信素材库，本地不落盘。 */
  async uploadCover(
    id: string,
    imageBase64: string,
    mimeType: string,
  ): Promise<OaArticleView> {
    const row = await this.mustFind(id);
    const allowed: Record<string, string> = {
      'image/png': 'cover.png',
      'image/jpeg': 'cover.jpg',
      'image/gif': 'cover.gif',
    };
    const filename = allowed[mimeType];
    if (!filename) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        '封面仅支持 PNG / JPEG / GIF',
        HttpStatus.BAD_REQUEST,
      );
    }
    const buf = Buffer.from(imageBase64, 'base64');
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        '封面图片大小需在 5MB 以内',
        HttpStatus.BAD_REQUEST,
      );
    }
    const token = await this.getAccessToken();
    const form = new FormData();
    form.append('media', new Blob([new Uint8Array(buf)], { type: mimeType }), filename);
    const res = (await this.wxFetch(
      `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${token}&type=image`,
      { method: 'POST', body: form },
    )) as WxErrorBody & { media_id?: string; url?: string };
    if (!res.media_id) this.throwWx(res, '上传封面到微信素材库失败');
    const updated = await this.prisma.oaArticle.update({
      where: { id: row.id },
      data: { coverMediaId: res.media_id, coverUrl: res.url ?? null, version: { increment: 1 } },
    });
    return this.toView(updated);
  }

  /** 同步到公众号草稿箱：未同步过走 draft/add，已同步走 draft/update（整篇替换 index 0）。 */
  async sync(id: string): Promise<OaArticleView> {
    const row = await this.mustFind(id);
    if (!row.coverMediaId) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        '请先上传封面图（微信图文必须有封面）',
        HttpStatus.BAD_REQUEST,
      );
    }
    const html = sourceToHtml(row.contentSource);
    const article = {
      title: row.title,
      author: row.author ?? undefined,
      digest: row.digest ?? undefined,
      content: html,
      thumb_media_id: row.coverMediaId,
      need_open_comment: 0,
      only_fans_can_comment: 0,
    };
    let draftId = row.wxDraftMediaId;
    if (draftId) {
      await this.wxPost('/cgi-bin/draft/update', {
        media_id: draftId,
        index: 0,
        articles: article,
      });
    } else {
      const res = (await this.wxPost('/cgi-bin/draft/add', {
        articles: [article],
      })) as WxErrorBody & { media_id?: string };
      if (!res.media_id) this.throwWx(res, '同步到草稿箱失败');
      draftId = res.media_id;
    }
    const updateRes = await this.prisma.oaArticle.updateMany({
      where: { id: row.id, version: row.version, deletedAt: null },
      data: {
        wxDraftMediaId: draftId,
        contentHtml: html,
        lastSyncedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updateRes.count === 0) {
      throw new BusinessException(
        BusinessCode.Conflict,
        '文章在同步期间已被修改，请刷新后重试',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.mustFind(row.id);
    return this.toView(updated);
  }

  /** 撤回同步：删除微信侧草稿，本地文章保留。 */
  async unsync(id: string): Promise<OaArticleView> {
    const row = await this.mustFind(id);
    if (row.wxDraftMediaId) {
      await this.wxPost('/cgi-bin/draft/delete', { media_id: row.wxDraftMediaId });
    }
    const updateRes = await this.prisma.oaArticle.updateMany({
      where: { id: row.id, version: row.version, deletedAt: null },
      data: { wxDraftMediaId: null, lastSyncedAt: null, version: { increment: 1 } },
    });
    if (updateRes.count === 0) {
      throw new BusinessException(
        BusinessCode.Conflict,
        '文章在撤回期间已被修改，请刷新后重试',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.mustFind(row.id);
    return this.toView(updated);
  }

  /* ---------------- 微信接口 plumbing ---------------- */

  private credentials(): { appid: string; secret: string } {
    const appid = this.config.get<string>('WECHAT_OA_APPID');
    const secret = this.config.get<string>('WECHAT_OA_SECRET');
    if (!appid || !secret) {
      throw new BusinessException(
        OaBusinessCode.NotConfigured,
        '服务器未配置公众号凭证（WECHAT_OA_APPID / WECHAT_OA_SECRET）',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { appid, secret };
  }

  private async getAccessToken(force = false): Promise<string> {
    if (!force && this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }
    if (this.tokenPromise) {
      return this.tokenPromise;
    }
    this.tokenPromise = (async () => {
      try {
        const { appid, secret } = this.credentials();
        const res = (await this.wxFetch(
          `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`,
          { method: 'GET' },
        )) as WxErrorBody & { access_token?: string; expires_in?: number };
        if (!res.access_token) this.throwWx(res, '获取公众号 access_token失败');
        this.tokenCache = {
          token: res.access_token,
          expiresAt: Date.now() + (res.expires_in ?? 7200) * 1000,
        };
        return res.access_token;
      } finally {
        this.tokenPromise = null;
      }
    })();
    return this.tokenPromise;
  }

  /** 带 token 的 JSON POST；token 失效（40001/42001/40014）自动刷新重试一次。 */
  private async wxPost(path: string, body: unknown, retried = false): Promise<WxErrorBody> {
    const token = await this.getAccessToken();
    const res = (await this.wxFetch(`https://api.weixin.qq.com${path}?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })) as WxErrorBody;
    const code = res.errcode ?? 0;
    if ([40001, 42001, 40014].includes(code) && !retried) {
      this.tokenCache = null;
      return this.wxPost(path, body, true);
    }
    if (code !== 0) this.throwWx(res, `微信接口调用失败（${path}）`);
    return res;
  }

  private maskUrl(url: string): string {
    return url.replace(/([?&](?:secret|access_token)=)[^&]+/gi, '$1***');
  }

  private async wxFetch(url: string, init: RequestInit): Promise<unknown> {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) {
        throw new Error(`HTTP ${r.status} ${r.statusText}`);
      }
      return await r.json();
    } catch (err) {
      this.logger.error(`wechat oa fetch failed: ${this.maskUrl(url)}: ${String(err)}`);
      throw new BusinessException(
        OaBusinessCode.UpstreamError,
        '微信接口网络异常，请稍后重试',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private throwWx(res: WxErrorBody, prefix: string): never {
    const code = res.errcode ?? -1;
    if (code === 48001) {
      throw new BusinessException(
        OaBusinessCode.ApiUnauthorized,
        `${prefix}：公众号接口无权限（48001，未认证账号限制）`,
        HttpStatus.FORBIDDEN,
      );
    }
    throw new BusinessException(
      OaBusinessCode.UpstreamError,
      `${prefix}：微信返回 ${code} ${res.errmsg ?? ''}`.trim(),
      HttpStatus.BAD_GATEWAY,
    );
  }

  /* ---------------- helpers ---------------- */

  private async mustFind(id: string): Promise<OaArticle> {
    const row = await this.prisma.oaArticle.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '文章不存在',
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }

  private toView(r: OaArticle): OaArticleView {
    const syncState: OaArticleView['syncState'] = !r.wxDraftMediaId
      ? 'local'
      : r.lastSyncedAt && r.updatedAt.getTime() > r.lastSyncedAt.getTime() + 1000
        ? 'dirty'
        : 'synced';
    return {
      id: r.id,
      title: r.title,
      author: r.author,
      digest: r.digest,
      contentSource: r.contentSource,
      coverMediaId: r.coverMediaId,
      coverUrl: r.coverUrl,
      wxDraftMediaId: r.wxDraftMediaId,
      syncState,
      lastSyncedAt: r.lastSyncedAt,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
