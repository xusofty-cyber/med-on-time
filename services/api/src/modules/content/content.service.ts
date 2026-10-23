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

/**
 * 富文本基础清洗（DB 8.3 口径：入库前 XSS 清洗）。
 * 移除 script/iframe/object 等危险标签、on* 事件属性与 javascript: 链接；
 * 生产环境建议再接 DOMPurify 级清洗库（当前依赖集未含，属已知缺口）。
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|form|link|meta|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|form|link|meta|style)[^>]*\/?\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '$1="#"');
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

  async createArticle(authorAdminId: string, dto: CreateArticleDto) {
    const status = dto.status ?? 'draft';
    return this.prisma.contentArticle.create({
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
  }

  async updateArticle(id: string, dto: UpdateArticleDto) {
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
    return this.prisma.contentArticle.update({ where: { id }, data });
  }

  async deleteArticle(id: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.contentArticle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'article not found', HttpStatus.NOT_FOUND);
    }
    await this.prisma.contentArticle.update({ where: { id }, data: { deletedAt: new Date() } });
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

  async createConsent(dto: CreateConsentDto) {
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
    return this.prisma.consentDocument.create({
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
    return this.prisma.$transaction(async (tx) => {
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
  }

  async deleteConsent(id: string): Promise<{ deleted: true }> {
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
    return { deleted: true };
  }
}
