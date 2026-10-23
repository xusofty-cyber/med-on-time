import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 过敏严重程度（member_allergy.severity / intake_adverse_record.severity） */
export const SEVERITY_VALUES = ['mild', 'moderate', 'severe'] as const;

export class AllergyItemDto {
  @IsString()
  @MaxLength(200)
  allergen!: string;

  @IsOptional()
  @IsIn(SEVERITY_VALUES)
  severity?: string;

  @IsOptional()
  @IsString()
  reaction?: string;

  @IsOptional()
  @IsString()
  note?: string;

  /** allergen_type：drug_category / drug / other（缺省 other） */
  @IsOptional()
  @IsIn(['drug_category', 'drug', 'other'])
  allergenType?: string;

  @IsOptional()
  @IsString()
  drugCategoryId?: string;

  @IsOptional()
  @IsString()
  drugId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  allergenCode?: string;
}

/** PUT 过敏档案：全量替换语义 */
export class PutAllergiesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllergyItemDto)
  items!: AllergyItemDto[];
}

export class CreateAdverseRecordDto {
  // intake_record_id / reminder_instance_id / prn_intake_id 至少其一（服务层校验）
  @IsOptional()
  @IsString()
  intakeRecordId?: string;

  @IsOptional()
  @IsString()
  reminderInstanceId?: string;

  @IsOptional()
  @IsString()
  prnIntakeId?: string;

  @IsOptional()
  @IsString()
  planItemId?: string;

  /** 症状标签（字典见 DB 注释：dizzy/nausea/rash/palpitation/stomachache/sleepiness/other） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptomTags?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(SEVERITY_VALUES)
  severity?: string;

  @IsISO8601()
  occurredAt!: string;
}

export class CreateEmergencyContactDto {
  @IsString()
  @MaxLength(100)
  contactName!: string;

  @IsString()
  @MaxLength(32)
  phone!: string;

  @IsString()
  @MaxLength(64)
  relationship!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class UpdateEmergencyContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  relationship?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

/** 病历（member_medical_record）写入：summary 为正文，加密落 summary_enc */
export class UpsertMedicalRecordDto {
  @IsOptional()
  @IsIn(['A', 'B', 'AB', 'O', 'unknown'])
  bloodType?: string;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(300)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  weightKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  primaryHospital?: string;

  /** 病历正文（病情摘要），服务端 AES-256-GCM 加密存储 */
  @IsOptional()
  @IsString()
  summary?: string;
}

export class PageQueryDto {
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
