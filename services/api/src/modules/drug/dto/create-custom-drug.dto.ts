import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 剂型枚举与 schema drug.dosage_form 注释逐字对齐（禁止自创取值）。 */
export const DOSAGE_FORMS = [
  'tablet',
  'capsule',
  'granule',
  'oral_liquid',
  'injection',
  'external',
  'other',
] as const;

/**
 * POST /members/:memberId/drugs/custom 请求体：成员自建药品。
 * 落 drug 表 source_type=user_custom，说明书字段均可选填（用户手头有什么填什么）。
 */
export class CreateCustomDrugDto {
  @ApiProperty({ description: '通用名' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  genericName!: string;

  @ApiPropertyOptional({ description: '商品名' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  brandName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  manufacturer?: string;

  @ApiPropertyOptional({ description: '批准文号（全库唯一，重复提交返回 409）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  approvalNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ enum: DOSAGE_FORMS })
  @IsIn(DOSAGE_FORMS)
  dosageForm!: string;

  @ApiProperty({ description: '规格，如 5mg*30片/盒 中的强度部分或完整规格文本' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  specification!: string;

  @ApiPropertyOptional({ description: '包装说明' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  packageDesc?: string;

  @ApiProperty({ description: '最小计量单位：片 / 粒 / ml / 支 / 贴 等' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  unit!: string;

  @ApiPropertyOptional({ description: '适应症（说明书原文）' })
  @IsOptional()
  @IsString()
  efficacy?: string;

  @ApiPropertyOptional({ description: '用法用量（说明书原文，存入 usage_default.text）' })
  @IsOptional()
  @IsString()
  usageText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contraindications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adverseReactions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  interactions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  storageCondition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOtc?: boolean;
}
