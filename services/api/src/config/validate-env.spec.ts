import { validateEnv } from './validate-env';

describe('validateEnv 启动校验', () => {
  const prodBase = {
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    ADMIN_JWT_SECRET: 'c'.repeat(40),
    DATABASE_URL: 'postgresql://u:p@db:5432/medontime',
  };

  it('生产配置齐全且互异 → 通过', () => {
    expect(validateEnv({ ...prodBase })).toBeTruthy();
  });

  it('生产缺 ADMIN_JWT_SECRET → 抛错', () => {
    const env = { ...prodBase } as Record<string, unknown>;
    delete env.ADMIN_JWT_SECRET;
    expect(() => validateEnv(env)).toThrow('ADMIN_JWT_SECRET 未配置');
  });

  it('生产 ADMIN 与 ACCESS 相同 → 抛错', () => {
    expect(() =>
      validateEnv({ ...prodBase, ADMIN_JWT_SECRET: prodBase.JWT_ACCESS_SECRET }),
    ).toThrow('不得与 JWT_ACCESS_SECRET 相同');
  });

  it('生产缺 DATABASE_URL → 抛错', () => {
    const env = { ...prodBase } as Record<string, unknown>;
    delete env.DATABASE_URL;
    expect(() => validateEnv(env)).toThrow('DATABASE_URL 未配置');
  });

  it('非生产缺密钥 → 只警告不抛错', () => {
    expect(validateEnv({ NODE_ENV: 'development' })).toBeTruthy();
  });
});
