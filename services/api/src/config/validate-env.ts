/**
 * 启动期环境校验（ConfigModule validate 钩子，bootstrap 前执行）：
 * - 生产环境（NODE_ENV=production）硬性失败：核心密钥缺失或彼此相同、
 *   DATABASE_URL 缺失 —— 配置错误必须在启动时暴露，不带病上线；
 * - 密钥长度 < 32 只警告不拦截：存量部署的密钥长度不一，长度治理另行安排，
 *   不能让校验本身把现有生产打挂；
 * - 非生产环境一律只警告（本地/CI 以开发默认值运行是既定口径）。
 */
export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const isProd = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  const str = (key: string): string => {
    const v = env[key];
    return typeof v === 'string' ? v : '';
  };

  const access = str('JWT_ACCESS_SECRET');
  const refresh = str('JWT_REFRESH_SECRET');
  const admin = str('ADMIN_JWT_SECRET');

  if (isProd) {
    if (!access) errors.push('JWT_ACCESS_SECRET 未配置');
    if (!refresh) errors.push('JWT_REFRESH_SECRET 未配置');
    if (!admin) errors.push('ADMIN_JWT_SECRET 未配置');
    if (!str('DATABASE_URL')) errors.push('DATABASE_URL 未配置');
    if (access && refresh && access === refresh) {
      errors.push('JWT_ACCESS_SECRET 与 JWT_REFRESH_SECRET 不得相同');
    }
    if (admin && access && admin === access) {
      errors.push('ADMIN_JWT_SECRET 不得与 JWT_ACCESS_SECRET 相同');
    }
    if (admin && refresh && admin === refresh) {
      errors.push('ADMIN_JWT_SECRET 不得与 JWT_REFRESH_SECRET 相同');
    }
  }

  for (const [key, value] of [
    ['JWT_ACCESS_SECRET', access],
    ['JWT_REFRESH_SECRET', refresh],
    ['ADMIN_JWT_SECRET', admin],
  ] as const) {
    if (value && value.length < 32) {
      warnings.push(`${key} 长度不足 32 字符，建议更换为更长随机值`);
    }
  }

  for (const w of warnings) console.warn(`[env] 警告：${w}`);
  if (errors.length > 0) {
    throw new Error(`[env] 生产环境配置校验失败：${errors.join('；')}`);
  }
  return env;
}
