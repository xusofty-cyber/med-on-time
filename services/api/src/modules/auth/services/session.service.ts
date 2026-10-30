import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../common/utils/uuidv7';

/**
 * 登录会话（refresh 吊销的事实来源）。
 *
 * 存储经 RefreshSessionStore 抽象落地：现行实现为 RedisRefreshSessionStore
 * （会话/索引/吊销记录均在 Redis，进程重启不丢会话、不复活已吊销会话）。
 * 早期「schema 无 user_session 表先内存实现」的缺口已由该迁移关闭；
 * 若未来补 user_session 表，只需新增 Prisma 实现替换绑定，接口不变。
 */
export interface RefreshSession {
  id: string; // sid，同时写入 JWT 的 sid claim
  accountId: string;
  refreshJti: string;
  platform?: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  /** 轮换消费时刻：refresh 轮换成功时由 consumeForRotation 原子写入（与 revokedAt 同时落）。 */
  rotatedAt?: Date;
}

/**
 * refresh 轮换消费结果（防重放 + 复用检测，RFC 6819 口径）：
 * - ok：本次消费成功，session 为被消费的旧会话（已标记 rotatedAt/revokedAt）；
 * - reuse：已轮换出去的旧 token 在宽限期后再次出现 = 疑似盗用，调用方须
 *   全量吊销该账号会话并拒绝；
 * - invalid：不存在/已过期/已吊销/jti 不符/宽限期内重复提交（并发重试），
 *   一律按「会话已失效」拒绝，不触发全量吊销。
 */
export type RotateConsumeOutcome =
  | { status: 'ok'; session: RefreshSession }
  | { status: 'reuse'; session: RefreshSession }
  | { status: 'invalid' };

/** 轮换宽限期：并发/重试在此时长内重复提交旧 token 只判 invalid，不判盗用。 */
export const ROTATION_GRACE_MS = 10_000;

export abstract class RefreshSessionStore {
  abstract create(session: RefreshSession): Promise<void>;
  abstract findById(id: string): Promise<RefreshSession | null>;
  abstract listByAccount(accountId: string): Promise<RefreshSession[]>;
  abstract revoke(id: string): Promise<void>;
  abstract revokeAllByAccount(accountId: string): Promise<void>;
  /**
   * 原子消费一次 refresh 轮换：校验 jti/过期/吊销状态并在同一原子步内标记
   * rotatedAt+revokedAt，杜绝「先查后吊销」竞态下同一 refresh 被双花。
   */
  abstract consumeForRotation(
    id: string,
    expectedJti: string,
  ): Promise<RotateConsumeOutcome>;
}

const activeSessionIds = new Set<string>();
const revokedSessionIds = new Map<string, number>();
const revokedAccountBeforeSec = new Map<string, number>();
const REVOKED_RETENTION_MS = 2 * 60 * 60 * 1000; // 与 access token 2h TTL 对齐

/** 吊销状态的 Redis 键（P1 迁移：重启后吊销仍生效的事实来源） */
export const SESSION_REDIS_KEYS = {
  /** 单个会话吊销：medontime:revoked:session:<sid> → '1'，TTL = 吊销保留期 */
  revokedSession: (id: string): string => `medontime:revoked:session:${id}`,
  /** 账号级全量吊销：medontime:revoked:account:<accountId> → 吊销时刻（秒），TTL = 吊销保留期 */
  revokedAccount: (accountId: string): string =>
    `medontime:revoked:account:${accountId}`,
} as const;

/** 供 RedisRefreshSessionStore 同步更新进程内守卫镜像（JwtAuthGuard 的同步回退路径） */
export function markSessionActiveInMirror(id: string): void {
  activeSessionIds.add(id);
  revokedSessionIds.delete(id);
}

export function markSessionRevokedInMirror(id: string, revokedAtMs: number): void {
  activeSessionIds.delete(id);
  revokedSessionIds.set(id, revokedAtMs);
}

export function markAccountRevokedBeforeInMirror(
  accountId: string,
  cutoffSec: number,
): void {
  revokedAccountBeforeSec.set(accountId, cutoffSec);
}

/** 吊销保留期（毫秒），Redis 吊销键 TTL 与内存镜像清理同口径 */
export function getRevokedRetentionMs(): number {
  return REVOKED_RETENTION_MS;
}

/**
 * 供 JwtAuthGuard 同步判断会话是否已吊销：
 * - 明确吊销的 sid 立即拒绝；
 * - 吊销后新建的活跃 sid 放行（即使在同一秒内重新登录）；
 * - 账号级全量吊销时间点之前签发的令牌拒绝；
 * - 进程重启后未知但未吊销的合法令牌保持放行，不破坏无状态容灾。
 */
export function isSessionRevoked(
  sessionId?: string,
  accountId?: string,
  tokenIatSec?: number,
): boolean {
  if (sessionId && revokedSessionIds.has(sessionId)) return true;
  if (sessionId && activeSessionIds.has(sessionId)) return false;
  if (accountId) {
    const cutoffSec = revokedAccountBeforeSec.get(accountId);
    if (cutoffSec !== undefined && (tokenIatSec === undefined || tokenIatSec <= cutoffSec)) {
      return true;
    }
  }
  return false;
}

/**
 * Redis 吊销检查（异步，JwtAuthGuard 用）：查重启后仍有效的吊销记录。
 * redis 参数为 RedisService（类型 import，避免循环依赖由调用方传入实例）。
 * Redis 不可用时抛错，由调用方降级为进程内同步检查（isSessionRevoked）。
 */
export async function isSessionRevokedInRedis(
  redis: { getClient(): { get(key: string): Promise<string | null> } },
  sessionId?: string,
  accountId?: string,
  tokenIatSec?: number,
): Promise<boolean> {
  const client = redis.getClient();
  if (sessionId) {
    const revoked = await client.get(SESSION_REDIS_KEYS.revokedSession(sessionId));
    if (revoked !== null) return true;
  }
  if (accountId) {
    const cutoffRaw = await client.get(SESSION_REDIS_KEYS.revokedAccount(accountId));
    if (cutoffRaw !== null) {
      const cutoffSec = parseInt(cutoffRaw, 10);
      if (
        !Number.isNaN(cutoffSec) &&
        (tokenIatSec === undefined || tokenIatSec <= cutoffSec)
      ) {
        return true;
      }
    }
  }
  return false;
}

@Injectable()
export class InMemoryRefreshSessionStore extends RefreshSessionStore {
  private readonly sessions = new Map<string, RefreshSession>();

  private prune(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (s.expiresAt.getTime() < now || (s.revokedAt && now - s.revokedAt.getTime() > REVOKED_RETENTION_MS)) {
        this.sessions.delete(id);
        activeSessionIds.delete(id);
      }
    }
    for (const [id, revokedAtMs] of revokedSessionIds) {
      if (now - revokedAtMs > REVOKED_RETENTION_MS) {
        revokedSessionIds.delete(id);
      }
    }
  }

  async create(session: RefreshSession): Promise<void> {
    this.prune();
    this.sessions.set(session.id, session);
    activeSessionIds.add(session.id);
    revokedSessionIds.delete(session.id);
  }

  async findById(id: string): Promise<RefreshSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async listByAccount(accountId: string): Promise<RefreshSession[]> {
    this.prune();
    return [...this.sessions.values()].filter((s) => s.accountId === accountId);
  }

  async revoke(id: string): Promise<void> {
    const now = new Date();
    const s = this.sessions.get(id);
    if (s && !s.revokedAt) s.revokedAt = now;
    activeSessionIds.delete(id);
    revokedSessionIds.set(id, now.getTime());
  }

  async revokeAllByAccount(accountId: string): Promise<void> {
    const now = new Date();
    const nowMs = now.getTime();
    revokedAccountBeforeSec.set(accountId, Math.floor(nowMs / 1000));
    for (const s of this.sessions.values()) {
      if (s.accountId === accountId) {
        if (!s.revokedAt) s.revokedAt = now;
        activeSessionIds.delete(s.id);
        revokedSessionIds.set(s.id, nowMs);
      }
    }
  }

  /**
   * 内存版轮换消费：判定与标记之间无 await，Node 单线程下即原子，
   * 语义与 Redis Lua 版逐条对齐（宽限期口径同 ROTATION_GRACE_MS）。
   */
  async consumeForRotation(
    id: string,
    expectedJti: string,
  ): Promise<RotateConsumeOutcome> {
    this.prune();
    const s = this.sessions.get(id);
    if (!s) return { status: 'invalid' };
    if (s.refreshJti !== expectedJti) return { status: 'invalid' };
    const now = new Date();
    if (s.expiresAt.getTime() < now.getTime()) return { status: 'invalid' };
    if (s.rotatedAt) {
      if (now.getTime() - s.rotatedAt.getTime() <= ROTATION_GRACE_MS) {
        return { status: 'invalid' };
      }
      return { status: 'reuse', session: s };
    }
    if (s.revokedAt) return { status: 'invalid' };
    s.rotatedAt = now;
    s.revokedAt = now;
    activeSessionIds.delete(id);
    revokedSessionIds.set(id, now.getTime());
    return { status: 'ok', session: s };
  }
}

@Injectable()
export class SessionService {
  constructor(private readonly store: RefreshSessionStore) {}

  async createSession(input: {
    id?: string;
    accountId: string;
    refreshJti: string;
    refreshTtlSeconds: number;
    platform?: string;
    deviceName?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RefreshSession> {
    const now = new Date();
    const session: RefreshSession = {
      id: input.id ?? uuidv7(),
      accountId: input.accountId,
      refreshJti: input.refreshJti,
      platform: input.platform,
      deviceName: input.deviceName,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.refreshTtlSeconds * 1000),
    };
    await this.store.create(session);
    return session;
  }

  /** refresh 轮换/校验：会话存在、未吊销、未过期、jti 一致才有效。 */
  async findValidSession(sessionId: string, refreshJti: string): Promise<RefreshSession | null> {
    const s = await this.store.findById(sessionId);
    if (!s || s.revokedAt || s.refreshJti !== refreshJti) return null;
    if (s.expiresAt.getTime() < Date.now()) return null;
    return s;
  }

  /**
   * refresh 轮换消费（原子）：把「校验 + 吊销旧会话」收敛为存储层单步，
   * 并按 RotateConsumeOutcome 区分正常消费 / 疑似盗用复用 / 一般失效。
   * 轮换成功后由调用方签发新会话（新 sid），旧会话不再可用。
   */
  async rotateSession(
    sessionId: string,
    refreshJti: string,
  ): Promise<RotateConsumeOutcome> {
    return this.store.consumeForRotation(sessionId, refreshJti);
  }

  async listActiveSessions(accountId: string): Promise<RefreshSession[]> {
    const all = await this.store.listByAccount(accountId);
    const now = Date.now();
    return all
      .filter((s) => !s.revokedAt && s.expiresAt.getTime() >= now)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async revokeSession(id: string): Promise<void> {
    await this.store.revoke(id);
  }

  async revokeAllSessions(accountId: string): Promise<void> {
    await this.store.revokeAllByAccount(accountId);
  }
}
