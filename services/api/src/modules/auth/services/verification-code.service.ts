import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { HttpStatus } from '@nestjs/common';
import {
  BusinessCode,
  BusinessException,
} from '../../../common/exceptions/business.exception';
import { PhoneCryptoService } from './phone-crypto.service';
import { MailSender } from './mail-sender.service';

export type SmsScene = 'register' | 'login' | 'reset';

export const SMS_SCENES: SmsScene[] = ['register', 'login', 'reset'];

/**
 * 验证码场景定版（V1.3 泛化）：register / login / reset_password / bind。
 * 历史/兼容场景名 'reset' 在服务入口统一归一为 'reset_password'（发送与校验同口径，
 * 短信/邮箱既有客户端与端点均可按 'reset' 或 'reset_password' 调用，两侧自洽不回归）。
 */
export type CodeScene = 'register' | 'login' | 'reset_password' | 'bind' | 'reset';

export const CODE_SCENES: CodeScene[] = ['register', 'login', 'reset_password', 'bind', 'reset'];

function normalizeScene(scene: SmsScene | CodeScene): 'register' | 'login' | 'reset_password' | 'bind' {
  return scene === 'reset' ? 'reset_password' : scene;
}

/**
 * 短信发送通道抽象（契约：验证码走 notification 短信接口抽象，生产接真实网关）。
 * 当前 notification 模块尚无短信实现，本线内先落抽象 + dev stub；
 * TODO(notification): notification 模块短信网关就绪后，将 SMS_SENDER 绑定切换至其实现。
 */
export abstract class SmsSender {
  abstract sendVerificationCode(phone: string, code: string, scene: SmsScene): Promise<void>;
}

@Injectable()
export class DevStubSmsSender extends SmsSender {
  private readonly logger = new Logger(DevStubSmsSender.name);

  async sendVerificationCode(phone: string, code: string, scene: SmsScene): Promise<void> {
    // dev stub：不真实下发；仅打掩码日志（红线 4：日志脱敏，验证码不落日志明文）。
    this.logger.log(
      `[SMS stub] scene=${scene} phone=${PhoneCryptoService.maskPhone(phone)} code=******（未真实下发）`,
    );
    void code;
  }
}

interface CodeRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
}

/**
 * 验证码存储抽象。契约口径优先 Redis；当前工程无 Redis 封装，先内存实现。
 * TODO(redis): 接入 Redis 封装后切换为 Redis 实现（TTL 与限频计数天然适配）。
 * 限频：同目标同场景 60 秒重发间隔、1 小时最多 5 次；码 6 位、有效 5 分钟、最多试 5 次。
 */
export abstract class VerificationCodeStore {
  abstract get(key: string): Promise<CodeRecord | null>;
  abstract set(key: string, record: CodeRecord): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract getSendHistory(key: string): Promise<number[]>;
  abstract setSendHistory(key: string, timestamps: number[]): Promise<void>;
}

@Injectable()
export class InMemoryVerificationCodeStore extends VerificationCodeStore {
  private readonly codes = new Map<string, CodeRecord>();
  private readonly history = new Map<string, number[]>();

  async get(key: string): Promise<CodeRecord | null> {
    return this.codes.get(key) ?? null;
  }
  async set(key: string, record: CodeRecord): Promise<void> {
    this.codes.set(key, record);
  }
  async delete(key: string): Promise<void> {
    this.codes.delete(key);
  }
  async getSendHistory(key: string): Promise<number[]> {
    return this.history.get(key) ?? [];
  }
  async setSendHistory(key: string, timestamps: number[]): Promise<void> {
    this.history.set(key, timestamps);
  }
}

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_INTERVAL_MS = 60 * 1000;
const HOURLY_LIMIT = 5;
const MAX_ATTEMPTS = 5;

/**
 * 验证码服务（V1.3 泛化到 target = phone | email）。
 * 存储键含通道前缀（sms:/mail:）与目标哈希，邮箱哈希本身另有 `email:` 域分隔，
 * 两通道同场景互不串扰；限频口径两通道一致。
 */
@Injectable()
export class VerificationCodeService {
  constructor(
    private readonly store: VerificationCodeStore,
    private readonly smsSender: SmsSender,
    private readonly mailSender: MailSender,
  ) {}

  private key(channel: 'sms' | 'mail', targetHash: string, scene: CodeScene): string {
    return `${channel}:${scene}:${targetHash}`;
  }

  /** 短信通道发送（既有入口，签名不变）。 */
  async send(phone: string, phoneHash: string, scene: SmsScene): Promise<{ expiresInSeconds: number }> {
    return this.issue('sms', phoneHash, normalizeScene(scene), (code) =>
      this.smsSender.sendVerificationCode(phone, code, scene),
    );
  }

  /** 邮件通道发送。 */
  async sendEmail(email: string, emailHash: string, scene: CodeScene): Promise<{ expiresInSeconds: number }> {
    const normalized = normalizeScene(scene);
    return this.issue('mail', emailHash, normalized, (code) =>
      this.mailSender.sendVerificationCode(email, code, normalized),
    );
  }

  private async issue(
    channel: 'sms' | 'mail',
    targetHash: string,
    scene: CodeScene,
    deliver: (code: string) => Promise<void>,
  ): Promise<{ expiresInSeconds: number }> {
    const now = Date.now();
    const historyKey = `hist:${this.key(channel, targetHash, scene)}`;
    const history = (await this.store.getSendHistory(historyKey)).filter(
      (t) => now - t < 60 * 60 * 1000,
    );
    const last = history[history.length - 1];
    if (last !== undefined && now - last < RESEND_INTERVAL_MS) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        '验证码发送过于频繁，请 60 秒后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (history.length >= HOURLY_LIMIT) {
      throw new BusinessException(
        BusinessCode.BadRequest,
        '验证码发送次数已达上限，请 1 小时后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.store.set(this.key(channel, targetHash, scene), {
      code,
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      sentAt: now,
    });
    history.push(now);
    await this.store.setSendHistory(historyKey, history);
    await deliver(code);
    return { expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  /** 短信码校验并一次性消费（既有入口，签名不变）。 */
  async verifyAndConsume(phoneHash: string, scene: SmsScene, code: string): Promise<void> {
    return this.consume('sms', phoneHash, normalizeScene(scene), code);
  }

  /** 邮箱码校验并一次性消费。 */
  async verifyEmailAndConsume(emailHash: string, scene: CodeScene, code: string): Promise<void> {
    return this.consume('mail', emailHash, normalizeScene(scene), code);
  }

  private async consume(
    channel: 'sms' | 'mail',
    targetHash: string,
    scene: CodeScene,
    code: string,
  ): Promise<void> {
    const key = this.key(channel, targetHash, scene);
    const record = await this.store.get(key);
    if (!record || record.expiresAt < Date.now()) {
      throw new BusinessException(BusinessCode.BadRequest, '验证码已过期或未发送');
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await this.store.delete(key);
      throw new BusinessException(BusinessCode.BadRequest, '验证码错误次数过多，请重新获取');
    }
    if (record.code !== code) {
      record.attempts += 1;
      await this.store.set(key, record);
      throw new BusinessException(BusinessCode.BadRequest, '验证码不正确');
    }
    await this.store.delete(key);
  }
}
