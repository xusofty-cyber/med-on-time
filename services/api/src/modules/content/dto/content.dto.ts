import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AppLocale, ConsentDocType } from '@med-on-time/shared';

export const LOCALE_VALUES = [AppLocale.ZhCN, AppLocale.ZhTW, AppLocale.En] as const;
export const ARTICLE_STATUS_VALUES = ['draft', 'published', 'offline'] as const;
export const CONSENT_DOC_TYPE_VALUES = [
  ConsentDocType.UserAgreement,
  ConsentDocType.PrivacyPolicy,
  ConsentDocType.AiDataUse,
  ConsentDocType.HealthDataProcessing,
] as const;
export const CONSENT_STATUS_VALUES = ['draft', 'effective', 'superseded'] as const;

export class ListArticlesQueryDto {
  @IsOptional()
  @IsIn(LOCALE_VALUES)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class AdminListArticlesQueryDto extends ListArticlesQueryDto {
  @IsOptional()
  @IsIn(ARTICLE_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @IsString()
  contentGroupId?: string;
}

export class CreateArticleDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(64)
  category!: string;

  /** 富文本 HTML（入库前做基础 XSS 清洗） */
  @IsString()
  body!: string;

  @IsIn(LOCALE_VALUES)
  locale!: string;

  /** 多语言内容组：不传则新建组；传已有组 ID 即为该组补一个语言版本 */
  @IsOptional()
  @IsString()
  contentGroupId?: string;

  @IsOptional()
  @IsIn(ARTICLE_STATUS_VALUES)
  status?: string;
}

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsIn(ARTICLE_STATUS_VALUES)
  status?: string;
}

export class ListConsentsQueryDto {
  @IsOptional()
  @IsIn(CONSENT_DOC_TYPE_VALUES)
  docType?: string;

  @IsOptional()
  @IsIn(LOCALE_VALUES)
  locale?: string;

  @IsOptional()
  @IsIn(CONSENT_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

/** 同意文档新版本（consent versioning：修订一律新建版本行，已生效版本内容不可改） */
export class CreateConsentDto {
  @IsIn(CONSENT_DOC_TYPE_VALUES)
  docType!: string;

  @IsString()
  @MaxLength(32)
  docVersion!: string;

  @IsIn(LOCALE_VALUES)
  locale!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  /** 正文引用（对象存储键或内容 ID，正文不入本表，见 DB 7.4） */
  @IsString()
  @MaxLength(512)
  contentRef!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentSha256?: string;

  @IsISO8601()
  effectiveDate!: string;

  @IsOptional()
  @IsBoolean()
  isMaterialChange?: boolean;
}

export class UpdateConsentDto {
  // 仅 draft 状态可改以下字段（服务层校验）
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  contentRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentSha256?: string;

  @IsOptional()
  @IsISO8601()
  effectiveDate?: string;

  @IsOptional()
  @IsBoolean()
  isMaterialChange?: boolean;

  /** 状态流转：draft -> effective（同类型+语言的旧生效版自动置 superseded） */
  @IsOptional()
  @IsIn(CONSENT_STATUS_VALUES)
  status?: string;
}
