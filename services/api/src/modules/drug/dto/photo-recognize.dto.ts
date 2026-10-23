import { IsIn, IsString, MaxLength } from 'class-validator';

/**
 * 拍照录入（2026-10-24）：端侧把药盒照片以 base64 JSON 直传（不落盘、不留存），
 * 服务端转交视觉模型只提取药名候选，再回药品库检索命中项供用户点选确认。
 */
export class PhotoRecognizeDto {
  /** base64（不带 data: 前缀），约 5MB 原图对应 ≤ 7,000,000 字符 */
  @IsString()
  @MaxLength(7_000_000)
  imageBase64!: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType!: string;
}
