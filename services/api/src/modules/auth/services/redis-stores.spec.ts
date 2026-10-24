import { RedisVerificationCodeStore } from './redis-verification-code.store';
import { RedisRefreshSessionStore } from './redis-refresh-session.store';
import { RedisScanLoginTicketStore } from '../scan-login-ticket.store';
import { isSessionRevokedInRedis } from './session.service';

/**
 * 最小 Redis 替身：实现存储层用到的 get/set(PX/EX)/del/sadd/smembers/srem，
 * 并模拟 TTL 过期（offset 可快进时间）。不依赖真实 Redis 进程。
 */
class FakeRedis {
  private kv = new Map<string, { v: string; exp: number | null }>();
  private sets = new Map<string, Set<string>>();
  private offsetMs = 0;

  private now(): number {
    return Date.now() + this.offsetMs;
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.kv.get(key);
    if (!entry) return null;
    if (entry.exp !== null && this.now() >= entry.exp) {
      this.kv.delete(key);
      return null;
    }
    return entry.v;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<string> {
    let exp: number | null = null;
    const pxIdx = args.indexOf('PX');
    const exIdx = args.indexOf('EX');
    if (pxIdx >= 0) exp = this.now() + (args[pxIdx + 1] as number);
    if (exIdx >= 0) exp = this.now() + (args[exIdx + 1] as number) * 1000;
    this.kv.set(key, { v: value, exp });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) if (this.kv.delete(key)) n += 1;
    return n;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    let added = 0;
    for (const m of members) if (!set.has(m)) { set.add(m); added += 1; }
    return added;
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])];
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members) if (set.delete(m)) removed += 1;
    return removed;
  }
}

function fakeRedisService(fake: FakeRedis): any {
  return { getClient: () => fake };
}

describe('Redis stores (P1 迁移)', () => {
  describe('RedisVerificationCodeStore', () => {
    it('存取往返；TTL 到期后码自动失效（重启不丢、过期不留）', async () => {
      const fake = new FakeRedis();
      const store = new RedisVerificationCodeStore(fakeRedisService(fake));
      const now = Date.now();
      await store.set('sms:login:hash-1', {
        code: '123456',
        expiresAt: now + 5 * 60 * 1000,
        attempts: 0,
        sentAt: now,
      });
      expect((await store.get('sms:login:hash-1'))?.code).toBe('123456');

      fake.advance(5 * 60 * 1000 + 1000);
      expect(await store.get('sms:login:hash-1')).toBeNull();
    });

    it('限频历史存取往返，1 小时后消失', async () => {
      const fake = new FakeRedis();
      const store = new RedisVerificationCodeStore(fakeRedisService(fake));
      await store.setSendHistory('hist:sms:login:hash-1', [1000, 2000]);
      expect(await store.getSendHistory('hist:sms:login:hash-1')).toEqual([1000, 2000]);
      fake.advance(60 * 60 * 1000 + 1000);
      expect(await store.getSendHistory('hist:sms:login:hash-1')).toEqual([]);
    });

    it('delete 删除码记录', async () => {
      const fake = new FakeRedis();
      const store = new RedisVerificationCodeStore(fakeRedisService(fake));
      const now = Date.now();
      await store.set('sms:login:hash-1', {
        code: '123456',
        expiresAt: now + 300_000,
        attempts: 0,
        sentAt: now,
      });
      await store.delete('sms:login:hash-1');
      expect(await store.get('sms:login:hash-1')).toBeNull();
    });
  });

  describe('RedisRefreshSessionStore', () => {
    const session = (overrides: Record<string, unknown> = {}) => ({
      id: 'sid-1',
      accountId: 'acc-1',
      refreshJti: 'jti-1',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...overrides,
    });

    it('create/findById/listByAccount 往返', async () => {
      const fake = new FakeRedis();
      const store = new RedisRefreshSessionStore(fakeRedisService(fake));
      await store.create(session());
      await store.create(session({ id: 'sid-2', refreshJti: 'jti-2' }));
      expect((await store.findById('sid-1'))?.refreshJti).toBe('jti-1');
      const list = await store.listByAccount('acc-1');
      expect(list.map((s) => s.id).sort()).toEqual(['sid-1', 'sid-2']);
      expect(list[0]?.expiresAt instanceof Date).toBe(true);
    });

    it('会话过期后 findById 为 null，list 时清索引残留', async () => {
      const fake = new FakeRedis();
      const store = new RedisRefreshSessionStore(fakeRedisService(fake));
      await store.create(
        session({ expiresAt: new Date(Date.now() + 60 * 1000) }),
      );
      fake.advance(61 * 1000);
      expect(await store.findById('sid-1')).toBeNull();
      expect(await store.listByAccount('acc-1')).toEqual([]);
    });

    it('revoke 后会话带 revokedAt，且 Redis 吊销检查返回 true', async () => {
      const fake = new FakeRedis();
      const redis = fakeRedisService(fake);
      const store = new RedisRefreshSessionStore(redis);
      await store.create(session());
      await store.revoke('sid-1');
      const found = await store.findById('sid-1');
      expect(found?.revokedAt).toBeInstanceOf(Date);
      expect(
        await isSessionRevokedInRedis(redis, 'sid-1', 'acc-1', Math.floor(Date.now() / 1000)),
      ).toBe(true);
      // 未吊销的会话不受影响
      expect(
        await isSessionRevokedInRedis(redis, 'sid-other', 'acc-1', Math.floor(Date.now() / 1000)),
      ).toBe(false);
    });

    it('revokeAllByAccount 后该账号旧令牌（iat ≤ 截止点）被拒、新会话放行', async () => {
      const fake = new FakeRedis();
      const redis = fakeRedisService(fake);
      const store = new RedisRefreshSessionStore(redis);
      await store.create(session());
      const beforeSec = Math.floor(Date.now() / 1000);
      await store.revokeAllByAccount('acc-1');
      expect(await isSessionRevokedInRedis(redis, 'sid-1', 'acc-1', beforeSec)).toBe(true);
      // 吊销后新签的令牌（iat 大于截止点）放行
      expect(
        await isSessionRevokedInRedis(redis, 'sid-new', 'acc-1', beforeSec + 3600),
      ).toBe(false);
      // 但已吊销的 sid 本身仍被拒（即使 iat 较新）
      expect(
        await isSessionRevokedInRedis(redis, 'sid-1', 'acc-1', beforeSec + 3600),
      ).toBe(true);
    });
  });

  describe('RedisScanLoginTicketStore', () => {
    const ticket = (overrides: Record<string, unknown> = {}) => ({
      id: 'ticket-1',
      status: 'pending' as const,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      purpose: 'login' as const,
      ...overrides,
    });

    it('create/get 往返；TTL 到期后 get 与 getRaw 均为 undefined（Redis 已删键，调用方按 expired 处理）', async () => {
      const fake = new FakeRedis();
      const store = new RedisScanLoginTicketStore(fakeRedisService(fake));
      await store.create(ticket());
      expect((await store.get('ticket-1'))?.status).toBe('pending');
      fake.advance(5 * 60 * 1000 + 1000);
      expect(await store.get('ticket-1')).toBeUndefined();
      expect(await store.getRaw('ticket-1')).toBeUndefined();
    });

    it('save 回写确认状态（原地改动可持久化）', async () => {
      const fake = new FakeRedis();
      const store = new RedisScanLoginTicketStore(fakeRedisService(fake));
      await store.create(ticket());
      const got = await store.get('ticket-1');
      got!.status = 'confirmed';
      got!.accountId = 'acc-9';
      await store.save(got!);
      const again = await store.get('ticket-1');
      expect(again?.status).toBe('confirmed');
      expect(again?.accountId).toBe('acc-9');
    });

    it('delete 删除票据', async () => {
      const fake = new FakeRedis();
      const store = new RedisScanLoginTicketStore(fakeRedisService(fake));
      await store.create(ticket());
      await store.delete('ticket-1');
      expect(await store.get('ticket-1')).toBeUndefined();
    });
  });
});
