import { Type } from 'class-transformer';
import {
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
