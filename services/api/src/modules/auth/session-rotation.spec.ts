import { AuthService } from './auth.service';
import {
  ROTATION_GRACE_MS,
  RefreshSession,
  RefreshSessionStore,
  RotateConsumeOutcome,
  SessionService,
} from './services/session.service';

/**
 * Refresh 轮换原子消费 + 复用检测（第三批）：
 * 存储层以内存双替身复刻 Redis Lua 的判定语义（单线程即原子），验证
 * SessionService/AuthService 层的四条路径：正常轮换、并发双花（宽限期内
 * 只判失效）、宽限期外重放（判盗用 → 全量吊销）、jti 不符（一般失效）。
 */
class InMemorySessionStore extends RefreshSessionStore {
  readonly sessions = new Map<string, RefreshSession>();

  async create(session: RefreshSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async findById(id: string): Promise<RefreshSession | null> {
    const s = this.sessions.get(id);
    return s ? { ...s } : null;
  }

  async listByAccount(accountId: string): Promise<RefreshSession[]> {
    return [...this.sessions.values()]
      .filter((s) => s.accountId === accountId)
      .map((s) => ({ ...s }));
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

  async consumeForRotation(
    id: string,
    expectedJti: string,
  ): Promise<RotateConsumeOutcome> {
    const s = this.sessions.get(id);
    if (!s) return { status: 'invalid' };
    if (s.refreshJti !== expectedJti) return { status: 'invalid' };
    if (s.expiresAt.getTime() < Date.now()) return { status: 'invalid' };
    if (s.rotatedAt) {
      if (Date.now() - s.rotatedAt.getTime() <= ROTATION_GRACE_MS) {
        return { status: 'invalid' };
      }
      return { status: 'reuse', session: { ...s } };
    }
    if (s.revokedAt) return { status: 'invalid' };
    s.rotatedAt = new Date();
    s.revokedAt = new Date();
    return { status: 'ok', session: { ...s } };
  }
}

describe('refresh 轮换：原子消费 + 复用检测', () => {
  let store: InMemorySessionStore;
  let sessions: SessionService;
  let service: AuthService;
  let tokenVerify: jest.Mock;

  const seedSession = (overrides: Partial<RefreshSession> = {}) =>
    store.create({
      id: 'sid-1',
      accountId: 'acc-1',
      refreshJti: 'jti-1',
      platform: 'web',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...overrides,
    });

  beforeEach(async () => {
    store = new InMemorySessionStore();
    sessions = new SessionService(store);
    tokenVerify = jest.fn((token: string) =>
      token === 'rt-1' ? { sub: 'acc-1', sid: 'sid-1', jti: 'jti-1' } : null,
    );
    const tokenService = {
      verify: tokenVerify,
      signRefreshToken: jest.fn(() => ({ token: 'rt-2', jti: 'jti-2' })),
      signAccessToken: jest.fn(() => 'at-2'),
      refreshTtlSeconds: 30 * 24 * 60 * 60,
      accessTtlSeconds: 2 * 60 * 60,
    };
    service = new AuthService(
      { userAccount: { findFirst: jest.fn(), findUnique: jest.fn() } } as never,
      null as never,
      tokenService as never,
      sessions,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
    jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(service as any, 'findAccountById')
      .mockResolvedValue({ id: 'acc-1', status: 'active' });
    await seedSession();
  });

  it('正常轮换：旧会话被消费（rotatedAt 落标），新会话可继续轮换', async () => {
    const pair = await service.refresh('rt-1', {});
    expect(pair.accessToken).toBe('at-2');
    const old = await store.findById('sid-1');
    expect(old?.rotatedAt).toBeInstanceOf(Date);
    expect(old?.revokedAt).toBeInstanceOf(Date);
    // 新会话已落库且有效
    const all = await store.listByAccount('acc-1');
    const fresh = all.find((s) => s.id !== 'sid-1');
    expect(fresh?.refreshJti).toBe('jti-2');
    expect(await sessions.findValidSession(fresh!.id, 'jti-2')).not.toBeNull();
  });

  it('并发双花：宽限期内第二次提交同一旧 token 只判失效，不触发全量吊销', async () => {
    await service.refresh('rt-1', {});
    await expect(service.refresh('rt-1', {})).rejects.toThrow('会话已失效');
    // 第一次轮换出的新会话不受影响
    const all = await store.listByAccount('acc-1');
    const fresh = all.find((s) => s.id !== 'sid-1');
    expect(await sessions.findValidSession(fresh!.id, 'jti-2')).not.toBeNull();
  });

  it('宽限期外重放已轮换 token：判疑似盗用，账号全部会话被吊销', async () => {
    // 另有一台设备的活跃会话
    await store.create({
      id: 'sid-other',
      accountId: 'acc-1',
      refreshJti: 'jti-other',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    // sid-1 在 60 秒前已被轮换消费
    const s = store.sessions.get('sid-1')!;
    s.rotatedAt = new Date(Date.now() - 60 * 1000);
    s.revokedAt = new Date(Date.now() - 60 * 1000);

    await expect(service.refresh('rt-1', {})).rejects.toThrow('异常复用');
    expect(await sessions.findValidSession('sid-other', 'jti-other')).toBeNull();
  });

  it('jti 不符：一般失效，不误伤同账号其他会话', async () => {
    await store.create({
      id: 'sid-other',
      accountId: 'acc-1',
      refreshJti: 'jti-other',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    tokenVerify.mockReturnValue({ sub: 'acc-1', sid: 'sid-1', jti: 'jti-WRONG' });
    await expect(service.refresh('rt-1', {})).rejects.toThrow('会话已失效');
    expect(await sessions.findValidSession('sid-other', 'jti-other')).not.toBeNull();
    // 原会话也未被消费
    expect(await sessions.findValidSession('sid-1', 'jti-1')).not.toBeNull();
  });
});
