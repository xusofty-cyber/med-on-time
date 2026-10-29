import { LoginThrottleService } from './login-throttle.service';

/** LoginThrottleService 单元测试：内存版假 Redis，验证窗口/锁定/清除/fail-open。 */
function makeService() {
  const data = new Map<string, string>();
  const client = {
    get: jest.fn((k: string) => Promise.resolve(data.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      data.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => Promise.resolve(data.delete(k) ? 1 : 0)),
  };
  const redis: any = { getClient: () => client };
  return { service: new LoginThrottleService(redis), data };
}

describe('LoginThrottleService（登录防爆破）', () => {
  it('失败 5 次后锁定，lockedSeconds > 0', async () => {
    const { service } = makeService();
    for (let i = 0; i < 4; i++) {
      await service.recordFailure('user', 'acct-hash-1');
      expect(await service.lockedSeconds('user', 'acct-hash-1')).toBe(0);
    }
    await service.recordFailure('user', 'acct-hash-1');
    const left = await service.lockedSeconds('user', 'acct-hash-1');
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(15 * 60);
  });

  it('clear 后锁定与计数一并消除（登录成功路径）', async () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) await service.recordFailure('user', 'acct-hash-2');
    expect(await service.lockedSeconds('user', 'acct-hash-2')).toBeGreaterThan(0);
    await service.clear('user', 'acct-hash-2');
    expect(await service.lockedSeconds('user', 'acct-hash-2')).toBe(0);
  });

  it('scope 隔离：admin 锁定不影响 user 同名标识', async () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) await service.recordFailure('admin', 'root');
    expect(await service.lockedSeconds('admin', 'root')).toBeGreaterThan(0);
    expect(await service.lockedSeconds('user', 'root')).toBe(0);
  });

  it('Redis 异常时 fail-open：不抛错、不锁定', async () => {
    const redis: any = {
      getClient: () => ({
        get: () => Promise.reject(new Error('redis down')),
        set: () => Promise.reject(new Error('redis down')),
        del: () => Promise.reject(new Error('redis down')),
      }),
    };
    const service = new LoginThrottleService(redis);
    await expect(service.recordFailure('user', 'x')).resolves.toBeUndefined();
    await expect(service.lockedSeconds('user', 'x')).resolves.toBe(0);
    await expect(service.clear('user', 'x')).resolves.toBeUndefined();
  });
});
