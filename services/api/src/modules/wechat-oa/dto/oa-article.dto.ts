import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOaArticleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  digest?: string;

  @IsString()
  @MinLength(1)
  contentSource!: string;
}

export class UpdateOaArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  digest?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  contentSource?: string;
}

export class UploadOaCoverDto {
  /** 图片 base64（不含 data: 前缀），≤5MB 解码后大小 */
  @IsString()
  @MinLength(16)
  imageBase64!: string;

  @IsString()
  @MaxLength(32)
  mimeType!: string; // image/png / image/jpeg / image/gif
}
