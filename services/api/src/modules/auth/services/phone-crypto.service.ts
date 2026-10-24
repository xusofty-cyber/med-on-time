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
    const isProd = process.env.NODE_ENV === 'production';
    const rawKey = this.config.get<string>('PHONE_ENCRYPTION_KEY');
    const rawHmacKey = this.config.get<string>('PHONE_HMAC_KEY');
    if (isProd && (!rawKey || !rawHmacKey)) {
      throw new Error(
        '生产环境必须配置 PHONE_ENCRYPTION_KEY 与 PHONE_HMAC_KEY，禁止回退开发默认密钥',
      );
    }
    if (rawKey) {
      this.encKey = PhoneCryptoService.parseKey(rawKey);
    } else {
      this.logger.warn(
        'PHONE_ENCRYPTION_KEY 未配置，使用开发默认值（生产环境禁止）',
      );
      this.encKey = Buffer.alloc(32, 0x2a);
    }
    this.hmacKey = rawHmacKey ?? 'dev-phone-hmac-key';
    if (!rawHmacKey) {
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

  private encryptText(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  private decryptText(enc: string): string {
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

  encryptPhone(phone: string): string {
    return this.encryptText(phone);
  }

  decryptPhone(enc: string): string {
    return this.decryptText(enc);
  }

  hashPhone(phone: string): string {
    return createHmac('sha256', this.hmacKey).update(phone).digest('hex');
  }

  // ---- 邮箱（V1.3 注册验证通道）：与手机号同密钥同算法，哈希加域分隔前缀 ----

  /** 邮箱规范化：去空白 + 全小写（登记与查询同口径，避免大小写双账号）。 */
  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  encryptEmail(email: string): string {
    return this.encryptText(PhoneCryptoService.normalizeEmail(email));
  }

  decryptEmail(enc: string): string {
    return this.decryptText(enc);
  }

  /** HMAC 输入加 `email:` 域分隔前缀，与手机号哈希同值域不串味（同一字符串互不命中）。 */
  hashEmail(email: string): string {
    return createHmac('sha256', this.hmacKey)
      .update(`email:${PhoneCryptoService.normalizeEmail(email)}`)
      .digest('hex');
  }

  /** 138****1234 形式的日志/展示掩码 */
  static maskPhone(phone: string): string {
    if (phone.length < 7) return '***';
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }

  /** a***@example.com 形式的日志/展示掩码 */
  static maskEmail(email: string): string {
    const at = email.indexOf('@');
    if (at <= 0) return '***';
    return `${email.slice(0, 1)}***${email.slice(at)}`;
  }
}
