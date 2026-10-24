import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  VerificationCodeStore,
  type CodeRecord,
} from './verification-code.service';

/**
 * 验证码存储 Redis 实现（P1 迁移，键前缀与 TTL 与内存版一致）。
 * - 码：medontime:verify:<channel>:<scene>:<hash>，TTL = 码剩余有效期（5 分钟）；
 *   Redis 到期自动删除，语义与内存版“过期即无效”一致。
 * - 限频历史：medontime:verify:hist:<...>，TTL 1 小时（内存版按 1 小时窗口过滤，
 *   Redis 版直接以 TTL 兜底，窗口外历史自动消失）。
 * 进程重启后已发验证码仍可校验（目标：重启不丢失）。
 */
@Injectable()
export class RedisVerificationCodeStore extends VerificationCodeStore {
  constructor(private readonly redis: RedisService) {
    super();
  }

  private key(key: string): string {
    return `medontime:verify:${key}`;
  }

  async get(key: string): Promise<CodeRecord | null> {
    const raw = await this.redis.getClient().get(this.key(key));
    return raw ? (JSON.parse(raw) as CodeRecord) : null;
  }

  async set(key: string, record: CodeRecord): Promise<void> {
    // 剩余有效期作 TTL（至少 1 秒）；过期后 Redis 自动删，与 consume() 的过期判断同口径。
    const ttlMs = Math.max(1000, record.expiresAt - Date.now());
    await this.redis
      .getClient()
      .set(this.key(key), JSON.stringify(record), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.redis.getClient().del(this.key(key));
  }

  async getSendHistory(key: string): Promise<number[]> {
    const raw = await this.redis.getClient().get(this.key(key));
    return raw ? (JSON.parse(raw) as number[]) : [];
  }

  async setSendHistory(key: string, timestamps: number[]): Promise<void> {
    await this.redis
      .getClient()
      .set(this.key(key), JSON.stringify(timestamps), 'EX', 60 * 60);
  }
}
