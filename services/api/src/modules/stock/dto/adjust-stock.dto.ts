import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * POST /members/:memberId/stock/adjust 请求体。
 * change_type 口径（schema medication_stock_ledger）：intake_deduct 为打卡
 * 系统自动扣减专用，手动接口禁止提交，故此处仅开放其余三类。
 * changeAmount 为带符号增量：restock 必须 >0；expiry_writeoff 必须 <0；
 * manual_adjust 任意非零（正=盘盈补记，负=盘亏扣减）。
 */
export class AdjustStockDto {
  @ApiProperty()
  @IsUUID()
  drugId!: string;

  @ApiProperty({ enum: ['manual_adjust', 'restock', 'expiry_writeoff'] })
  @IsIn(['manual_adjust', 'restock', 'expiry_writeoff'])
  changeType!: string;

  @ApiProperty({ description: '带符号变动量（以 stockUnit / 药品单位计）' })
  @Type(() => Number)
  @IsNumber()
  @Min(-1000000)
  @Max(1000000)
  changeAmount!: number;

  @ApiPropertyOptional({
    description: 'manual_adjust / expiry_writeoff 必填（schema 口径）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @ApiPropertyOptional({
    description: '补货时可同时更新当前批次到期日 YYYY-MM-DD',
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: '同时更新成员药品级存放位置（R-1）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  storageLocation?: string;

  @ApiPropertyOptional({
    description: '库存单位；新建库存行时使用（缺省取药品 unit）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  stockUnit?: string;
}
