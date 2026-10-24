import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import {
  RefreshSession,
  RefreshSessionStore,
  SESSION_REDIS_KEYS,
  getRevokedRetentionMs,
  markAccountRevokedBeforeInMirror,
  markSessionActiveInMirror,
  markSessionRevokedInMirror,
} from './session.service';

/**
 * refresh 会话存储 Redis 实现（P1 迁移，键前缀与 TTL 与内存版一致）。
 * - 会话：medontime:session:<sid> → JSON，TTL = 会话剩余有效期（refresh TTL）；
 * - 账号索引：medontime:session:by-account:<accountId> → SET<sid>（无 TTL，
 *   list 时按记录的 expiresAt/revokedAt 懒清理，避免 SET 过期丢索引）；
 * - 吊销：medontime:revoked:session:<sid> 与 medontime:revoked:account:<accountId>
 *   （见 session.service.ts 的 SESSION_REDIS_KEYS），TTL = 吊销保留期 2h；
 *   revoke/revokeAll 同时更新进程内守卫镜像（JwtAuthGuard 同步回退路径）。
 * 进程重启后会话与吊销记录仍在（目标：重启不丢会话、不复活已吊销会话）。
 */
@Injectable()
export class RedisRefreshSessionStore extends RefreshSessionStore {
  constructor(private readonly redis: RedisService) {
    super();
  }

  private sessionKey(id: string): string {
    return `medontime:session:${id}`;
  }

  private byAccountKey(accountId: string): string {
    return `medontime:session:by-account:${accountId}`;
  }

  private serialize(session: RefreshSession): string {
    return JSON.stringify(session);
  }

  private deserialize(raw: string): RefreshSession {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...(o as unknown as RefreshSession),
      createdAt: new Date(o.createdAt as string),
      expiresAt: new Date(o.expiresAt as string),
      revokedAt: o.revokedAt ? new Date(o.revokedAt as string) : undefined,
    };
  }

  async create(session: RefreshSession): Promise<void> {
    const ttlMs = Math.max(1000, session.expiresAt.getTime() - Date.now());
    const client = this.redis.getClient();
    await client.set(this.sessionKey(session.id), this.serialize(session), 'PX', ttlMs);
    await client.sadd(this.byAccountKey(session.accountId), session.id);
    markSessionActiveInMirror(session.id);
  }

  async findById(id: string): Promise<RefreshSession | null> {
    const raw = await this.redis.getClient().get(this.sessionKey(id));
    return raw ? this.deserialize(raw) : null;
  }

  async listByAccount(accountId: string): Promise<RefreshSession[]> {
    const client = this.redis.getClient();
    const ids = await client.smembers(this.byAccountKey(accountId));
    const out: RefreshSession[] = [];
    for (const id of ids) {
      const raw = await client.get(this.sessionKey(id));
      if (!raw) {
        // 会话键已过期消失，顺手清索引残留
        await client.srem(this.byAccountKey(accountId), id);
        continue;
      }
      out.push(this.deserialize(raw));
    }
    return out;
  }

  async revoke(id: string): Promise<void> {
    const now = new Date();
    const nowMs = now.getTime();
    const client = this.redis.getClient();
    const raw = await client.get(this.sessionKey(id));
    if (raw) {
      const session = this.deserialize(raw);
      if (!session.revokedAt) session.revokedAt = now;
      const ttlMs = Math.max(1000, session.expiresAt.getTime() - nowMs);
      await client.set(this.sessionKey(id), this.serialize(session), 'PX', ttlMs);
    }
    await client.set(
      SESSION_REDIS_KEYS.revokedSession(id),
      '1',
      'PX',
      getRevokedRetentionMs(),
    );
    markSessionRevokedInMirror(id, nowMs);
  }

  async revokeAllByAccount(accountId: string): Promise<void> {
    const now = new Date();
    const nowMs = now.getTime();
    const cutoffSec = Math.floor(nowMs / 1000);
    const client = this.redis.getClient();
    await client.set(
      SESSION_REDIS_KEYS.revokedAccount(accountId),
      String(cutoffSec),
      'PX',
      getRevokedRetentionMs(),
    );
    markAccountRevokedBeforeInMirror(accountId, cutoffSec);
    const ids = await client.smembers(this.byAccountKey(accountId));
    for (const id of ids) {
      await this.revoke(id);
    }
  }
}
