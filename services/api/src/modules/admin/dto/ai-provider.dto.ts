import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** 后台大模型配置（2026-10-24）：名称/模型/请求 URL/API key 可配；key 只写不回显。 */
export class CreateAiProviderDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(100)
  modelName!: string;

  @IsString()
  @MaxLength(500)
  @IsUrl({ require_tld: false })
  baseUrl!: string;

  @IsString()
  @MaxLength(500)
  apiKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  capability?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAiProviderDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  /** 缺省 = 不改密钥；传新值才轮换 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  capability?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
