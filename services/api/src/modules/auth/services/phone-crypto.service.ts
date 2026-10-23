import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

/**
 * 手机号加解密（DB 设计：user_account.phone 存密文、phone_hash 存 HMAC-SHA256 供精确查询）。
 * - 加密：AES-256-GCM，密文格式 base64(iv | authTag | ciphertext)。
 * - 哈希：HMAC-SHA256(phone)，与 emergency_contact 等表的 phone_hash 同口径。
 * 密钥经环境变量注入（PHONE_ENCRYPTION_KEY = 32 字节 hex/base64；PHONE_HMAC_KEY 任意长字符串）。
 * TODO(生产): 密钥应由 KMS/保险库托管并支持轮换；当前未配置时使用开发默认值并打警告日志。
 */
@Injectable()
export class PhoneCryptoService {
  private readonly logger = new Logger(PhoneCryptoService.name);
  private readonly encKey: Buffer;
  private readonly hmacKey: string;

  constructor(private readonly config: ConfigService) {
    const rawKey = this.config.get<string>('PHONE_ENCRYPTION_KEY');
    if (rawKey) {
      this.encKey = PhoneCryptoService.parseKey(rawKey);
    } else {
      this.logger.warn(
        'PHONE_ENCRYPTION_KEY 未配置，使用开发默认值（生产环境禁止）',
      );
      this.encKey = Buffer.alloc(32, 0x2a);
    }
    this.hmacKey =
      this.config.get<string>('PHONE_HMAC_KEY') ?? 'dev-phone-hmac-key';
    if (!this.config.get<string>('PHONE_HMAC_KEY')) {
      this.logger.warn('PHONE_HMAC_KEY 未配置，使用开发默认值（生产环境禁止）');
    }
  }

  private static parseKey(raw: string): Buffer {
    const fromHex = /^[0-9a-fA-F]{64}$/.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw, 'base64');
    if (fromHex.length !== 32) {
      throw new Error('PHONE_ENCRYPTION_KEY 必须为 32 字节（hex 64 字符或 base64）');
    }
    return fromHex;
  }

  encryptPhone(phone: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(phone, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  decryptPhone(enc: string): string {
    const buf = Buffer.from(enc, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8',
    );
  }

  hashPhone(phone: string): string {
    return createHmac('sha256', this.hmacKey).update(phone).digest('hex');
  }

  /** 138****1234 形式的日志/展示掩码 */
  static maskPhone(phone: string): string {
    if (phone.length < 7) return '***';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}
