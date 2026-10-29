import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CheckinDto {
  /** 客户端幂等键（必填）：同一键重复提交只落一条打卡并返回既有记录 */
  @IsString()
  @MaxLength(128)
  clientRequestId!: string;

  /** 实际服药时刻（ISO 8601）；缺省 = 打卡当下（补记场景由前端回填） */
  @IsOptional()
  @IsISO8601()
  takenAt?: string;

  /** 确认方式：MVP 仅 tap；photo/voice 为预留值，提交即按附录 B 纪律拒绝 */
  @IsOptional()
  @IsString()
  confirmationMethod?: string;
}

export class CheckinListQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

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

/** PRN（按需）服药记录：无提醒实例，凭计划+明细直接记账（安全校验见服务层） */
export class PrnIntakeDto {
  /** 客户端幂等键（必填）：同一键重复提交只落一条记录 */
  @IsString()
  @MaxLength(128)
  clientRequestId!: string;

  /** 计划明细 ID（须属于该 PRN 计划） */
  @IsString()
  @MaxLength(64)
  planItemId!: string;

  /** 实际服药时刻（ISO 8601）；缺省 = 记录当下（安全校验以此为准） */
  @IsOptional()
  @IsISO8601()
  takenAt?: string;

  /** 服药原因备注（如「头痛」），可选 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;

  /**
   * 命中最小间隔/单日上限警告后、用户知情确认继续：
   * 首次提交命中警告返回 409，带 confirmWarning=true 重提才落库，
   * 记录 limitCheckResult=warned_confirmed。
   */
  @IsOptional()
  @IsBoolean()
  confirmWarning?: boolean;
}
