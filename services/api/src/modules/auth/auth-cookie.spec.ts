import type { Request } from 'express';
import {
  clearRefreshCookie,
  hasCookieClientHeader,
  parseTtlSeconds,
  readRefreshCookie,
  setRefreshCookie,
} from './auth-cookie';

function fakeReq(cookieHeader?: string): {
  req: Request;
  cookieCalls: unknown[];
  clearCalls: unknown[];
} {
  const cookieCalls: unknown[] = [];
  const clearCalls: unknown[] = [];
  const req = {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    res: {
      cookie: (...args: unknown[]) => cookieCalls.push(args),
      clearCookie: (...args: unknown[]) => clearCalls.push(args),
    },
  } as unknown as Request;
  return { req, cookieCalls, clearCalls };
}

describe('auth-cookie helpers', () => {
  it('setRefreshCookie：httpOnly + Path 收敛 + SameSite=Lax + 30d', () => {
    const { req, cookieCalls } = fakeReq();
    setRefreshCookie(req, 'rt-abc', { secure: true, maxAgeSeconds: 30 * 86400 });
    expect(cookieCalls).toHaveLength(1);
    const [name, value, options] = cookieCalls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe('mot_refresh');
    expect(value).toBe('rt-abc');
    expect(options.httpOnly).toBe(true);
    expect(options.path).toBe('/api/auth');
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('readRefreshCookie：多键头里精确取 mot_refresh 并解码', () => {
    const { req } = fakeReq('theme=a; mot_refresh=rt%2Bxyz%3D; other=1');
    expect(readRefreshCookie(req)).toBe('rt+xyz=');
    const { req: empty } = fakeReq('theme=a');
    expect(readRefreshCookie(empty)).toBeNull();
    const { req: none } = fakeReq();
    expect(readRefreshCookie(none)).toBeNull();
  });

  it('clearRefreshCookie：同名同 Path 清除', () => {
    const { req, clearCalls } = fakeReq();
    clearRefreshCookie(req, { secure: true });
    expect(clearCalls).toHaveLength(1);
    const [name, options] = clearCalls[0] as [string, Record<string, unknown>];
    expect(name).toBe('mot_refresh');
    expect(options.path).toBe('/api/auth');
  });

  it('hasCookieClientHeader：仅 x-mot-client: web 通过', () => {
    const ok = { headers: { 'x-mot-client': 'web' } } as unknown as Request;
    const no = { headers: {} } as unknown as Request;
    expect(hasCookieClientHeader(ok)).toBe(true);
    expect(hasCookieClientHeader(no)).toBe(false);
  });

  it('parseTtlSeconds：解析 TTL 文本与回落', () => {
    expect(parseTtlSeconds('30d')).toBe(30 * 86400);
    expect(parseTtlSeconds('12h')).toBe(12 * 3600);
    expect(parseTtlSeconds('45m')).toBe(45 * 60);
    expect(parseTtlSeconds('bogus')).toBe(30 * 86400);
  });
});
