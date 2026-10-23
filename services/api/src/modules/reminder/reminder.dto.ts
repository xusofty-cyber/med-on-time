import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SnoozeDto {
  /** 顺延分钟数；缺省按成员 cycle 的 interval（标准 15 分钟） */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  minutes?: number;
}

export class SkipDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  /** 客户端幂等键；缺省由服务端以 skip:<instanceId> 兜底 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientRequestId?: string;
}

export class DateQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;
}
