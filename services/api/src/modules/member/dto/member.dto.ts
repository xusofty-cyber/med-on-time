import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 成员关系（schema member.relationship 注释口径） */
export const MEMBER_RELATIONSHIPS = [
  'self',
  'father',
  'mother',
  'spouse',
  'child',
  'grandparent',
  'other_family',
  'employer',
  'other',
] as const;

export const MEMBER_GENDERS = ['male', 'female', 'unknown'] as const;

/** 提醒 cycle 预设（需求定版口径：标准 90/15、温和 120/30、严格 60/10） */
export const CYCLE_PRESETS = ['standard', 'gentle', 'strict'] as const;
export type CyclePreset = (typeof CYCLE_PRESETS)[number];

export class CreateMemberDto {
  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsIn(MEMBER_RELATIONSHIPS)
  relationship!: string;

  @IsOptional()
  @IsIn(MEMBER_GENDERS)
  gender?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDate 格式 YYYY-MM-DD' })
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsIn(MEMBER_RELATIONSHIPS)
  relationship?: string;

  @IsOptional()
  @IsIn(MEMBER_GENDERS)
  gender?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDate 格式 YYYY-MM-DD' })
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

/**
 * 关怀/提醒偏好（PUT 全量或部分更新，缺省字段保持现值）。
 * cycle 预设三档为定版口径；显式数值（cycleWindowMinutes/cycleIntervalMinutes）
 * 与所选预设的定版值相等时按「跟随预设」存储，不等时作显式覆盖存储
 * （存储形状与 reminder 引擎读取侧 NotificationPrefsService.CareSettings 定版一致）。
 * 锁屏显示药品详情默认 OFF（隐私口径）。
 * 按计划覆盖 cycle 在 plan 模块处理，不在本设置内。
 */
export class CareSettingsDto {
  @IsOptional()
  @IsBoolean()
  careMode?: boolean;

  @IsOptional()
  @IsIn(CYCLE_PRESETS)
  cyclePreset?: CyclePreset;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  cycleWindowMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  cycleIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  lockScreenShowDrugDetail?: boolean;

  /** 强提醒方式（原生/桌面端）：none 无 / alarm 闹钟 / voice 语音，互斥单选 */
  @IsOptional()
  @IsIn(['none', 'alarm', 'voice'])
  strongAlertMode?: 'none' | 'alarm' | 'voice';
}
