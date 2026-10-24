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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 与 schema medication_plan_item.frequency_type 注释逐字对齐。 */
export const FREQUENCY_TYPES = [
  'daily',
  'times_per_day',
  'weekly',
  'interval_days',
  'on_demand',
  'course_cycle',
] as const;

/** 与 schema meal_relation 注释逐字对齐。 */
export const MEAL_RELATIONS = [
  'before_meal',
  'with_meal',
  'after_meal',
  'before_sleep',
  'none',
] as const;

/** 与 schema course_type 注释逐字对齐。 */
export const COURSE_TYPES = ['long_term', 'fixed_days', 'until_finished'] as const;

/** 与 shared PlanType 对齐（scheduled / prn）。 */
export const PLAN_TYPES = ['scheduled', 'prn'] as const;

/**
 * frequencyRule 定版形状（JsonB，服务层按 frequencyType 校验，reminder 生成器
 * 同口径解析；2026-10-23 集成收口定版，全文见 docs/dev/API_CONTRACT.md）：
 * - daily:          { times: ["08:00", "20:00"] }
 * - times_per_day:  { times: [...] }（timesPerDay 仅展示计数，不单独构成排程）
 * - weekly:         { weekdays: [1..7], times: [...] }（1=周一 … 7=周日）
 * - interval_days:  { intervalDays: n, anchorDate?: "YYYY-MM-DD", times: [...] }
 *                   （anchorDate 缺省 = 计划 startDate）
 * - course_cycle:   { onDays: n, offDays?: n, anchorDate?: "YYYY-MM-DD", times: [...] }
 *                   （服 onDays 天停 offDays 天；cycleDays 为旧口径兼容字段，
 *                    须与 onDays 并存且满足 cycleDays = onDays + offDays）
 * - on_demand:      {}
 */
export class PlanItemInputDto {
  @ApiProperty()
  @IsUUID()
  drugId!: string;

  @ApiProperty({ description: '单次剂量（数值）' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(1000000)
  doseAmount!: number;

  @ApiProperty({ description: '单次剂量单位，如 片 / 粒 / ml / mg' })
  @IsString()
  @MaxLength(32)
  doseUnit!: string;

  @ApiProperty({ enum: FREQUENCY_TYPES })
  @IsIn(FREQUENCY_TYPES)
  frequencyType!: string;

  @ApiProperty({ description: '频次规则 JSON，形状见类注释' })
  @IsObject()
  frequencyRule!: Record<string, unknown>;

  @ApiPropertyOptional({ enum: MEAL_RELATIONS, default: 'none' })
  @IsOptional()
  @IsIn(MEAL_RELATIONS)
  mealRelation?: string;

  @ApiPropertyOptional({ enum: COURSE_TYPES, default: 'long_term' })
  @IsOptional()
  @IsIn(COURSE_TYPES)
  courseType?: string;

  @ApiPropertyOptional({ description: 'courseType=fixed_days 时必填' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  courseDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

/**
 * 剂量阶段（course+dose phases）：阶段只改每日总剂量、不改服用时刻。
 * 创建时以 planItemIndex 指向 items 数组下标（null/缺省 = 作用于全计划）；
 * 阶段起止由计划 startDate + 各阶段 durationDays 累进推算（schema 口径，不存日期）。
 */
export class PlanPhaseInputDto {
  @ApiPropertyOptional({ description: '目标明细在 items 中的下标；缺省 = 全计划阶段' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  planItemIndex?: number;

  @ApiProperty({ description: '阶段序号（同一目标内唯一，从 1 起）' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stageNo!: number;

  @ApiProperty({ description: '阶段时长（天，>0）' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  durationDays!: number;

  @ApiProperty({ description: '本阶段每日总剂量' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  dailyDoseAmount!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(32)
  dailyDoseUnit!: string;

  @ApiPropertyOptional({ description: '是否为减量停药收尾阶段（同目标至多一个且须为最大 stageNo）' })
  @IsOptional()
  @IsBoolean()
  isFinalStop?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class CreatePlanDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ enum: PLAN_TYPES, default: 'scheduled' })
  @IsOptional()
  @IsIn(PLAN_TYPES)
  planType?: string;

  @ApiProperty({ description: '开始日期 YYYY-MM-DD（疗程起日复用本字段）' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ description: '结束日期 YYYY-MM-DD（疗程止日复用本字段）' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'R-1 存放位置（计划级，优先于成员药品级）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  storageLocation?: string;

  @ApiPropertyOptional({ description: 'R-1 附加备注（详细提醒中展示）' })
  @IsOptional()
  @IsString()
  additionalNote?: string;

  @ApiPropertyOptional({ description: '处方来源文本（占位字段）' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  prescriptionSourceText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sourceTemplateId?: string;

  @ApiPropertyOptional({ description: 'planType=prn 必填：两次服用最小间隔（分钟）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  prnMinIntervalMinutes?: number;

  @ApiPropertyOptional({ description: 'planType=prn 必填：单日最多服用次数' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  prnMaxPerDay?: number;


  @ApiPropertyOptional({
    description:
      '计划级 cycle 覆盖：预设名字符串，或 { preset, windowMinutes, intervalMinutes } 对象；缺省/null = 跟随成员设置（定版口径见 API_CONTRACT）',
  })
  @IsOptional()
  cycleOverride?: string | Record<string, unknown> | null;

  @ApiPropertyOptional({
    enum: ['standard', 'gentle', 'strict'],
    description: '计划级 cycle 覆盖（扁平口径，与 cycleOverride 二选一，后者优先）',
  })
  @IsOptional()
  @ValidateIf((o: CreatePlanDto) => o.cyclePreset !== null)
  @IsIn(['standard', 'gentle', 'strict'])
  cyclePreset?: string | null;

  @ApiPropertyOptional({ description: '计划级 cycle 覆盖：重复提醒窗口（分钟，扁平口径）' })
  @IsOptional()
  @ValidateIf((o: CreatePlanDto) => o.cycleWindowMinutes !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  cycleWindowMinutes?: number | null;

  @ApiPropertyOptional({ description: '计划级 cycle 覆盖：重复提醒间隔（分钟，扁平口径）' })
  @IsOptional()
  @ValidateIf((o: CreatePlanDto) => o.cycleIntervalMinutes !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  cycleIntervalMinutes?: number | null;

  @ApiPropertyOptional({
    enum: ['none', 'alarm', 'voice'],
    nullable: true,
    description: '计划级强提醒方式覆盖（原生/桌面端呈现）：none 无 / alarm 闹钟 / voice 语音；null = 跟随成员关怀设置',
  })
  @IsOptional()
  @ValidateIf((o: CreatePlanDto) => o.strongAlertMode !== null)
  @IsIn(['none', 'alarm', 'voice'])
  strongAlertMode?: string | null;

  @ApiProperty({ type: [PlanItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanItemInputDto)
  items!: PlanItemInputDto[];

  @ApiPropertyOptional({ type: [PlanPhaseInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanPhaseInputDto)
  phases?: PlanPhaseInputDto[];
}
