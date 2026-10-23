import { IsIn, IsString, Matches } from 'class-validator';

export class AdherenceSummaryQueryDto {
  @IsIn(['week', 'month'])
  range!: 'week' | 'month';
}

export class AdherenceCalendarQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be YYYY-MM' })
  month!: string;
}
