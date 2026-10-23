import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  COURSE_TYPES,
  FREQUENCY_TYPES,
  MEAL_RELATIONS,
  PLAN_TYPES,
} from './create-plan.dto';

/**
 * PATCH 明细：带 id = 更新既有明细（字段缺省 = 不改）；不带 id = 新增明细；
 * 既有明细未出现在数组中 = 移除（软删除）。字段口径同 CreatePlan 的 PlanItemInputDto。
 */
export class PlanItemPatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  drugId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  doseAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  doseUnit?: string;

  @ApiPropertyOptional({ enum: FREQUENCY_TYPES })
  @IsOptional()
  @IsIn(FREQUENCY_TYPES)
  frequencyType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  frequencyRule?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: MEAL_RELATIONS })
  @IsOptional()
  @IsIn(MEAL_RELATIONS)
  mealRelation?: string;

  @ApiPropertyOptional({ enum: COURSE_TYPES })
  @IsOptional()
  @IsIn(COURSE_TYPES)
  courseType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  courseDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * PATCH 阶段：以 (planItemId, stageNo) 为自然键做全量对齐（缺失即软删除）；
 * planItemId=null 表示全计划阶段。字段口径同 CreatePlan 的 PlanPhaseInputDto。
 */
export class PlanPhasePatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planItemId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stageNo!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dailyDoseAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  dailyDoseUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFinalStop?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string | null;
}

/**
 * PATCH /plans/:planId：部分更新。标量字段缺省 = 不改，显式 null = 清空（可空字段）；
 * items / phases 缺省 = 不动，出现 = 全量对齐。version 提供时做乐观锁校验（不符 409）。
 * 状态不走 PATCH（pause/resume/DELETE 各有专口）。
 */
export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: PLAN_TYPES })
  @IsOptional()
  @IsIn(PLAN_TYPES)
  planType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'null = 清空结束日期' })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  storageLocation?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalNote?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  prescriptionSourceText?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  prnMinIntervalMinutes?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  prnMaxPerDay?: number | null;

  @ApiPropertyOptional({ description: '乐观锁版本（与 DB §2.2 口径一致，不符返回 409）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;


  @ApiPropertyOptional({
    description:
      '计划级 cycle 覆盖：预设名字符串，或 { preset, windowMinutes, intervalMinutes } 对象；显式 null = 清除覆盖回落成员设置',
  })
  @IsOptional()
  cycleOverride?: string | Record<string, unknown> | null;

  @ApiPropertyOptional({
    enum: ['standard', 'gentle', 'strict'],
    description: '计划级 cycle 覆盖（扁平口径，与 cycleOverride 二选一，后者优先；仅给扁平字段时与既有覆盖合并）',
  })
  @IsOptional()
  @ValidateIf((o: UpdatePlanDto) => o.cyclePreset !== null)
  @IsIn(['standard', 'gentle', 'strict'])
  cyclePreset?: string | null;

  @ApiPropertyOptional({ description: '计划级 cycle 覆盖：重复提醒窗口（分钟，扁平口径）' })
  @IsOptional()
  @ValidateIf((o: UpdatePlanDto) => o.cycleWindowMinutes !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  cycleWindowMinutes?: number | null;

  @ApiPropertyOptional({ description: '计划级 cycle 覆盖：重复提醒间隔（分钟，扁平口径）' })
  @IsOptional()
  @ValidateIf((o: UpdatePlanDto) => o.cycleIntervalMinutes !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  cycleIntervalMinutes?: number | null;

  @ApiPropertyOptional({ type: [PlanItemPatchDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanItemPatchDto)
  items?: PlanItemPatchDto[];

  @ApiPropertyOptional({ type: [PlanPhasePatchDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanPhasePatchDto)
  phases?: PlanPhasePatchDto[];
}
