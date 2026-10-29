import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

interface ThrottleEntry {
  failures: number[];
  lockedUntil?: number;
}

/**
 * 登录防爆破（2026-10-30 全项目审查 H-1/H-3 定版）：
 * - 口径与后台既有实现一致：15 分钟窗口内失败 5 次 → 锁定 15 分钟；
 * - 状态落 Redis：进程重启不清零、多副本共享（取代后台原进程内 Map）；
 * - Redis 不可用时 fail-open（记 warn、不拦截登录），与 JwtAuthGuard 的
 *   吊销检查容灾口径一致——防爆破是纵深防线，不应成为登录可用性的单点；
 * - 键只含 scope 与已哈希标识（phoneHash/emailHash/管理员用户名），不落明文。
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  static readonly WINDOW_MS = 15 * 60 * 1000;
  static readonly MAX_FAILURES = 5;
  static readonly LOCK_MS = 15 * 60 * 1000;
  private static readonly TTL_MS =
    LoginThrottleService.WINDOW_MS + LoginThrottleService.LOCK_MS;

  constructor(private readonly redis: RedisService) {}

  private key(scope: string, id: string): string {
    return `medontime:login-throttle:${scope}:${id}`;
  }

  private async load(scope: string, id: string): Promise<ThrottleEntry> {
    const raw = await this.redis.getClient().get(this.key(scope, id));
    if (!raw) return { failures: [] };
    try {
      const parsed = JSON.parse(raw) as ThrottleEntry;
      return { failures: parsed.failures ?? [], lockedUntil: parsed.lockedUntil };
    } catch {
      return { failures: [] };
    }
  }

  /** 当前锁定剩余秒数；未锁定或 Redis 异常时为 0（fail-open）。 */
  async lockedSeconds(scope: string, id: string): Promise<number> {
    try {
      const entry = await this.load(scope, id);
      if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
        return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
      }
      return 0;
    } catch (err) {
      this.logger.warn(`login throttle read failed (fail-open): ${String(err)}`);
      return 0;
    }
  }

  async recordFailure(scope: string, id: string): Promise<void> {
    try {
      const now = Date.now();
      const entry = await this.load(scope, id);
      entry.failures = entry.failures.filter(
        (t) => now - t < LoginThrottleService.WINDOW_MS,
      );
      entry.failures.push(now);
      if (entry.failures.length >= LoginThrottleService.MAX_FAILURES) {
        entry.lockedUntil = now + LoginThrottleService.LOCK_MS;
        entry.failures = [];
      }
      await this.redis
        .getClient()
        .set(this.key(scope, id), JSON.stringify(entry), 'PX', LoginThrottleService.TTL_MS);
    } catch (err) {
      this.logger.warn(`login throttle write failed: ${String(err)}`);
    }
  }

  async clear(scope: string, id: string): Promise<void> {
    try {
      await this.redis.getClient().del(this.key(scope, id));
    } catch (err) {
      this.logger.warn(`login throttle clear failed: ${String(err)}`);
    }
  }
}
