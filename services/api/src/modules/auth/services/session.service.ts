import { Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../common/utils/uuidv7';

/**
 * 登录会话（refresh 吊销的事实来源）。
 *
 * ⚠️ schema 缺口：API 契约要求 refresh 存 `user_session` 表以便吊销，但现行
 * schema.prisma（56 表）无 user_session 模型，本线禁改 schema。故先以
 * RefreshSessionStore 抽象 + 内存实现落地接口语义（创建/校验/单会话踢出/全量吊销），
 * TODO(schema): 待 DB V1.3 补 user_session 表后切换为 Prisma 实现（接口不变）。
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
}

export abstract class RefreshSessionStore {
  abstract create(session: RefreshSession): Promise<void>;
  abstract findById(id: string): Promise<RefreshSession | null>;
  abstract listByAccount(accountId: string): Promise<RefreshSession[]>;
  abstract revoke(id: string): Promise<void>;
  abstract revokeAllByAccount(accountId: string): Promise<void>;
}

@Injectable()
export class InMemoryRefreshSessionStore extends RefreshSessionStore {
  private readonly sessions = new Map<string, RefreshSession>();

  async create(session: RefreshSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async findById(id: string): Promise<RefreshSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async listByAccount(accountId: string): Promise<RefreshSession[]> {
    return [...this.sessions.values()].filter((s) => s.accountId === accountId);
  }

  async revoke(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (s && !s.revokedAt) s.revokedAt = new Date();
  }

  async revokeAllByAccount(accountId: string): Promise<void> {
    for (const s of this.sessions.values()) {
      if (s.accountId === accountId && !s.revokedAt) s.revokedAt = new Date();
    }
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
