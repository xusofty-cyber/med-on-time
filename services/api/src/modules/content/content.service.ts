import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppLocale } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCode, BusinessException } from '../../common/exceptions/business.exception';
import { uuidv7 } from '../../common/utils/uuidv7';
import type {
  AdminListArticlesQueryDto,
  CreateArticleDto,
  CreateConsentDto,
  ListArticlesQueryDto,
  ListConsentsQueryDto,
  UpdateArticleDto,
  UpdateConsentDto,
} from './dto/content.dto';

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code', 'span', 'div', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'sub', 'sup',
]);

const DANGEROUS_BLOCKS =
  /<(script|style|iframe|object|embed|svg|video|audio|form|template|applet|details|dialog|marquee)[\s\S]*?<\/\1>/gi;
const DANGEROUS_TAGS =
  /<(script|style|iframe|object|embed|svg|video|audio|form|link|meta|template|applet|base|details|dialog|marquee|input|button|select|textarea|body|head|html)[^>]*>/gi;

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);?/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function cleanHref(rawHref: string): string {
  const decoded = decodeHtmlEntities(rawHref).trim().replace(/[\x00-\x1f\x7f\s]+/g, '');
  if (/^(?:javascript|data|vbscript):/i.test(decoded)) {
    return '#';
  }
  if (/^(?:https?:\/\/|\/|mailto:)/i.test(decoded)) {
    return rawHref;
  }
  return '#';
}

function cleanSrc(rawSrc: string): string {
  const decoded = decodeHtmlEntities(rawSrc).trim().replace(/[\x00-\x1f\x7f\s]+/g, '');
  if (/^(?:javascript|data|vbscript):/i.test(decoded)) {
    return '';
  }
  if (/^(?:https?:\/\/|\/)/i.test(decoded)) {
    return rawSrc;
  }
  return '';
}

/**
 * 富文本安全清洗（DB 8.3 口径：入库前 XSS 清洗）。
 * 白名单过滤标签与属性，剔除任何 on* 事件与 javascript:/data: 协议注入。
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  let out = html.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(DANGEROUS_BLOCKS, '');
  out = out.replace(DANGEROUS_TAGS, '');

  out = out.replace(
    /<\s*(\/?)\s*([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)\s*(\/?)>/g,
    (_match, slash: string, rawTagName: string, rawAttrs: string, selfClose: string) => {
      const tagName = rawTagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tagName)) {
        return '';
      }
      if (slash === '/') {
        return `</${tagName}>`;
      }

      const attrRegex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      const keptAttrs: string[] = [];
      let attrMatch: RegExpExecArray | null;

      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = attrMatch[1];
        if (!attrName) continue;
        const lowerName = attrName.toLowerCase();
        if (lowerName.startsWith('on')) continue;

        const rawVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

        if (tagName === 'a') {
          if (lowerName === 'href') {
            const safeHref = cleanHref(rawVal);
            keptAttrs.push(`href="${safeHref.replace(/"/g, '&quot;')}"`);
          } else if (lowerName === 'title') {
            keptAttrs.push(`title="${rawVal.replace(/"/g, '&quot;')}"`);
          } else if (lowerName === 'target' && (rawVal === '_blank' || rawVal === '_self')) {
            keptAttrs.push(`target="${rawVal}"`);
            if (rawVal === '_blank') keptAttrs.push('rel="noopener noreferrer"');
          }
        } else if (tagName === 'img') {
          if (lowerName === 'src') {
            const safeSrc = cleanSrc(rawVal);
            if (safeSrc) keptAttrs.push(`src="${safeSrc.replace(/"/g, '&quot;')}"`);
          } else if (lowerName === 'alt' || lowerName === 'title') {
            keptAttrs.push(`${lowerName}="${rawVal.replace(/"/g, '&quot;')}"`);
          } else if ((lowerName === 'width' || lowerName === 'height') && /^\d+%?$/.test(rawVal)) {
            keptAttrs.push(`${lowerName}="${rawVal}"`);
          }
        } else {
          if (lowerName === 'class' && /^[a-zA-Z0-9_\-\s]+$/.test(rawVal)) {
            keptAttrs.push(`class="${rawVal.replace(/"/g, '&quot;')}"`);
          } else if (lowerName === 'title') {
            keptAttrs.push(`title="${rawVal.replace(/"/g, '&quot;')}"`);
          }
        }
      }

      const attrsString = keptAttrs.length > 0 ? ' ' + keptAttrs.join(' ') : '';
      const close = selfClose || tagName === 'br' || tagName === 'hr' || tagName === 'img' ? ' /' : '';
      return `<${tagName}${attrsString}${close}>`;
    },
  );

  return out;
}

/**
 * 内容域服务：用户端文章（仅 published、按 locale 内容组取文）+ 后台文章 CRUD
 * + 协议/同意文档版本管理（consent_document：版本行不可变、状态流转带顶替）。
 */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------- 用户端文章

  async listPublishedArticles(query: ListArticlesQueryDto) {
    const where = {
      status: 'published',
      deletedAt: null,
      locale: query.locale ?? AppLocale.ZhCN,
      ...(query.category ? { category: query.category } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contentArticle.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          title: true,
          category: true,
          locale: true,
          contentGroupId: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.contentArticle.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getPublishedArticle(id: string) {
    const article = await this.prisma.contentArticle.findFirst({
      where: { id, status: 'published', deletedAt: null },
    });
    if (!article) {
      throw new BusinessException(BusinessCode.NotFound, 'article not found', HttpStatus.NOT_FOUND);
    }
    return article;
  }

  // ---------------------------------------------------------- 后台文章 CRUD

  async listArticlesAdmin(query: AdminListArticlesQueryDto) {
    const where = {
      deletedAt: null,
      ...(query.locale ? { locale: query.locale } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.contentGroupId ? { contentGroupId: query.contentGroupId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.contentArticle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contentArticle.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private async writeAudit(
    adminId: string,
    action: string,
    targetType: string,
    targetId?: string,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: uuidv7(),
          actorType: 'admin',
          actorId: adminId,
          action,
          targetType,
          targetId: targetId ?? null,
          detail: detail ? (detail as Prisma.InputJsonValue) : undefined,
          result: 'success',
        },
      });
    } catch {
      // 审计日志异常不阻断主流程
    }
  }

  async createArticle(authorAdminId: string, dto: CreateArticleDto) {
    const status = dto.status ?? 'draft';
    const created = await this.prisma.contentArticle.create({
      data: {
        id: uuidv7(),
        title: dto.title,
        category: dto.category,
        body: sanitizeHtml(dto.body),
        locale: dto.locale,
        contentGroupId: dto.contentGroupId ?? uuidv7(),
        status,
        publishedAt: status === 'published' ? new Date() : null,
        authorAdminId,
      },
    });
    await this.writeAudit(authorAdminId, 'admin:content:article:create', 'content_article', created.id, {
      title: dto.title,
      category: dto.category,
      status,
    });
    return created;
  }

  async updateArticle(id: string, adminId: string, dto: UpdateArticleDto) {
    const existing = await this.prisma.contentArticle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'article not found', HttpStatus.NOT_FOUND);
    }
    const data: Prisma.ContentArticleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.body !== undefined) data.body = sanitizeHtml(dto.body);
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'published' && !existing.publishedAt) data.publishedAt = new Date();
      if (dto.status === 'draft') data.publishedAt = null;
    }
    const updated = await this.prisma.contentArticle.update({ where: { id }, data });
    await this.writeAudit(adminId, 'admin:content:article:update', 'content_article', id, {
      title: dto.title,
      status: dto.status,
    });
    return updated;
  }

  async deleteArticle(id: string, adminId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.contentArticle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'article not found', HttpStatus.NOT_FOUND);
    }
    await this.prisma.contentArticle.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.writeAudit(adminId, 'admin:content:article:delete', 'content_article', id);
    return { deleted: true };
  }

  // ------------------------------------------------------ 同意文档版本管理

  async listConsents(query: ListConsentsQueryDto) {
    const where = {
      deletedAt: null,
      ...(query.docType ? { docType: query.docType } : {}),
      ...(query.locale ? { locale: query.locale } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.consentDocument.findMany({
        where,
        orderBy: [{ docType: 'asc' }, { locale: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.consentDocument.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createConsent(adminId: string, dto: CreateConsentDto) {
    const clash = await this.prisma.consentDocument.findFirst({
      where: { docType: dto.docType, locale: dto.locale, docVersion: dto.docVersion, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `consent version already exists: ${dto.docType}/${dto.locale}/${dto.docVersion}`,
        HttpStatus.CONFLICT,
      );
    }
    try {
      const created = await this.prisma.consentDocument.create({
        data: {
          id: uuidv7(),
          docType: dto.docType,
          docVersion: dto.docVersion,
          locale: dto.locale,
          title: dto.title,
          contentRef: dto.contentRef,
          contentSha256: dto.contentSha256 ?? null,
          effectiveDate: new Date(dto.effectiveDate),
          isMaterialChange: dto.isMaterialChange ?? false,
          status: 'draft',
        },
      });
      await this.writeAudit(adminId, 'admin:content:consent:create', 'consent_document', created.id, {
        docType: dto.docType,
        locale: dto.locale,
        docVersion: dto.docVersion,
      });
      return created;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BusinessException(
          BusinessCode.Conflict,
          `consent version already exists: ${dto.docType}/${dto.locale}/${dto.docVersion}`,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  /**
   * 更新同意文档：内容字段仅 draft 可改（已生效版本禁止改内容，DB 7.4）；
   * 置 effective 时，同 docType+locale 的其他生效版本在同事务内顶替为 superseded。
   */
  async updateConsent(id: string, adminId: string, dto: UpdateConsentDto) {
    const existing = await this.prisma.consentDocument.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'consent document not found', HttpStatus.NOT_FOUND);
    }
    const hasContentEdit =
      dto.title !== undefined ||
      dto.contentRef !== undefined ||
      dto.contentSha256 !== undefined ||
      dto.effectiveDate !== undefined ||
      dto.isMaterialChange !== undefined;
    if (hasContentEdit && existing.status !== 'draft') {
      throw new BusinessException(
        BusinessCode.Conflict,
        'effective/superseded consent versions are immutable; create a new version instead',
        HttpStatus.CONFLICT,
      );
    }
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (dto.status === 'effective' && existing.status !== 'effective') {
          await tx.consentDocument.updateMany({
            where: {
              docType: existing.docType,
              locale: existing.locale,
              status: 'effective',
              deletedAt: null,
              id: { not: id },
            },
            data: { status: 'superseded' },
          });
        }
        const data: Prisma.ConsentDocumentUpdateInput = {};
        if (dto.title !== undefined) data.title = dto.title;
        if (dto.contentRef !== undefined) data.contentRef = dto.contentRef;
        if (dto.contentSha256 !== undefined) data.contentSha256 = dto.contentSha256;
        if (dto.effectiveDate !== undefined) data.effectiveDate = new Date(dto.effectiveDate);
        if (dto.isMaterialChange !== undefined) data.isMaterialChange = dto.isMaterialChange;
        if (dto.status !== undefined) {
          data.status = dto.status;
          if (dto.status === 'effective') data.publisher = { connect: { id: adminId } };
        }
        return tx.consentDocument.update({ where: { id }, data });
      });
      await this.writeAudit(adminId, 'admin:content:consent:update', 'consent_document', id, {
        status: dto.status,
        docVersion: existing.docVersion,
      });
      return updated;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BusinessException(
          BusinessCode.Conflict,
          'consent version conflict',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  async deleteConsent(id: string, adminId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.consentDocument.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'consent document not found', HttpStatus.NOT_FOUND);
    }
    if (existing.status !== 'draft') {
      throw new BusinessException(
        BusinessCode.Conflict,
        'only draft consent versions can be deleted',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.consentDocument.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.writeAudit(adminId, 'admin:content:consent:delete', 'consent_document', id);
    return { deleted: true };
  }
}
