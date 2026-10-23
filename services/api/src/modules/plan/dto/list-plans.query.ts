import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** 计划列表 / 变更史通用分页查询。 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class ListPlansQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'paused', 'finished', 'stopped'] })
  @IsOptional()
  @IsIn(['active', 'paused', 'finished', 'stopped'])
  status?: string;
}
