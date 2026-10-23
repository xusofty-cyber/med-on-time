import { Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';

/**
 * 字段级加密工具（需求口径：病历正文等敏感字段加密存储）。
 * 算法 AES-256-GCM；密文格式 `enc:v1:<base64(iv|authTag|ciphertext)>`，可自识别，
 * 解密时无前缀的历史明文原样返回（兼容开发期降级写入的数据）。
 *
 * 密钥来自环境变量 EHR_ENC_KEY（32 字节，hex 64 字符或 base64）。
 * 未配置时（仅限开发环境口径）：降级为明文存储并在首次使用时打印启动警告；
 * 生产环境必须配置，见部署文档。
 */
const PREFIX = 'enc:v1:';

export function resolveFieldEncKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  } catch {
    /* 落到下方返回 null */
  }
  return null;
}

export class FieldCrypto {
  private readonly logger = new Logger(FieldCrypto.name);
  private warned = false;

  constructor(private readonly key: Buffer | null) {}

  get enabled(): boolean {
    return this.key !== null;
  }

  encrypt(plain: string): string {
    if (!this.key) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          'EHR_ENC_KEY 未配置：敏感字段降级为明文存储（仅允许开发环境，生产必须配置）',
        );
      }
      return plain;
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    if (!value.startsWith(PREFIX)) return value;
    if (!this.key) {
      throw new Error('encrypted field present but EHR_ENC_KEY is not configured');
    }
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}

/** 电话哈希（供 emergency_contact.phone_hash 等精确匹配列）：有密钥走 HMAC，否则 SHA-256。 */
export function hashPhone(phone: string, key: Buffer | null): string {
  return key
    ? createHmac('sha256', key).update(phone, 'utf8').digest('hex')
    : createHash('sha256').update(phone, 'utf8').digest('hex');
}
