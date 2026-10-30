import type { Request } from 'express';

/**
 * Refresh token 的 httpOnly cookie 通道（第三批续：审查 07 H2 改造）。
 *
 * 双模并存：
 * - Web/Admin（浏览器）：登录/注册/扫码确认/刷新成功后由后端下发本 cookie，
 *   refresh 不再进 localStorage（XSS 读不到 httpOnly）；刷新时浏览器自动携带，
 *   access 只驻内存。原生端/小程序/桌面不依赖 cookie，继续走 body 传 token，
 *   两条路径在 AuthService.refresh 汇合，语义一致（原子轮换+复用检测）。
 * - 安全配套：cookie 模式刷新必须带自定义头 X-Mot-Client: web —— HTML 表单
 *   与跨源脚本都无法在无 CORS 许可下设置自定义头，等效 CSRF 防线；
 *   SameSite=Lax 再兜一层；Path 收敛到 /api/auth，最小暴露面。
 */
export const REFRESH_COOKIE_NAME = 'mot_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';
export const COOKIE_CLIENT_HEADER = 'x-mot-client';
export const COOKIE_CLIENT_VALUE = 'web';

/** 由控制器经 ConfigService 注入（配置隔离红线：本模块不直读 process.env）。 */
export interface RefreshCookieOptions {
  /** 生产环境为 true（Secure 属性）。 */
  secure: boolean;
  /** refresh TTL（秒），与 jwt.refreshTtl 同口径，仅决定浏览器保留期。 */
  maxAgeSeconds: number;
}

interface CookieResponse {
  cookie?: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie?: (name: string, options: Record<string, unknown>) => void;
}

function resOf(req: Request): CookieResponse | undefined {
  return (req as unknown as { res?: CookieResponse }).res;
}

/** 解析 TTL 文本（'30d'/'12h'/'45m'/'90s'）为秒；不合法时回落 30d。 */
export function parseTtlSeconds(raw: string): number {
  const m = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!m) return 30 * 24 * 60 * 60;
  const n = parseInt(m[1] as string, 10);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'] ?? 86400;
  return n * unit;
}

export function setRefreshCookie(
  req: Request,
  refreshToken: string,
  opts: RefreshCookieOptions,
): void {
  resOf(req)?.cookie?.(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    sameSite: 'lax',
    secure: opts.secure,
    maxAge: opts.maxAgeSeconds * 1000,
  });
}

export function clearRefreshCookie(
  req: Request,
  opts: Pick<RefreshCookieOptions, 'secure'>,
): void {
  resOf(req)?.clearCookie?.(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    sameSite: 'lax',
    secure: opts.secure,
  });
}

/** 从 Cookie 头解析 refresh token（不引 cookie-parser 依赖，单键精确匹配）。 */
export function readRefreshCookie(req: Request): string | null {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === REFRESH_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

/** cookie 模式刷新的 CSRF 门槛：必须带自定义头 X-Mot-Client: web。 */
export function hasCookieClientHeader(req: Request): boolean {
  return req.headers?.[COOKIE_CLIENT_HEADER] === COOKIE_CLIENT_VALUE;
}
