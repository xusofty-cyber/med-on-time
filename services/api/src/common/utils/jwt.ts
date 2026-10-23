import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 极简 HS256 JWT 签发/校验（无第三方 JWT 依赖，格式遵循 RFC 7519）。
 * 全仓唯一 JWT 实现（定版，2026-10-23 集成收口）：auth 的 TokenService 与
 * admin 登录都经本工具签发，common/guards/* 统一经本工具校验，禁止再自建实现。
 * 密钥与 payload.type 严格隔离：
 *  - 用户端 access：type='user'，密钥 jwt.accessSecret（JWT_ACCESS_SECRET）；
 *  - 用户端 refresh：type='refresh'，密钥 jwt.refreshSecret（JWT_REFRESH_SECRET），
 *    另在会话存储落 sid/jti 以便吊销与轮换；
 *  - 后台端：type='admin' + aud='admin'，密钥 ADMIN_JWT_SECRET（未配置时回退
 *    JWT_ACCESS_SECRET，仍靠 type/aud 双重校验与用户端隔离）。
 */
export interface JwtPayload {
  sub: string;
  type: 'user' | 'refresh' | 'admin';
  aud?: string;
  /** 会话 ID（用户端 token 携带，与会话存储记录对应） */
  sid?: string;
  /** token 唯一 ID（refresh 轮换/吊销比对用） */
  jti?: string;
  username?: string;
  roles?: string[];
  iat: number;
  exp: number;
  [key: string]: unknown;
}

/** 开发环境兜底密钥（生产未配置一律拒绝，禁止落到此值）。 */
export const DEV_ACCESS_SECRET_FALLBACK = 'dev-access-secret';
export const DEV_REFRESH_SECRET_FALLBACK = 'dev-refresh-secret';

function base64urlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlDecode(input: string): Buffer {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export function signJwt(
  claims: {
    sub: string;
    type: 'user' | 'refresh' | 'admin';
    aud?: string;
    sid?: string;
    jti?: string;
    username?: string;
    roles?: string[];
  },
  secret: string,
  expiresInSec: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: JwtPayload = { ...claims, iat: now, exp: now + expiresInSec };
  const body = base64urlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${base64urlEncode(signature)}`;
}

/** 校验签名与有效期；任何不合法都抛 Error（由守卫转 401）。 */
export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const [header, body, signature] = parts as [string, string, string];
  const parsedHeader = JSON.parse(base64urlDecode(header).toString('utf8')) as { alg?: string };
  if (parsedHeader.alg !== 'HS256') throw new Error('unexpected alg');
  const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  const actual = base64urlDecode(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('signature mismatch');
  }
  const payload = JSON.parse(base64urlDecode(body).toString('utf8')) as JwtPayload;
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('token expired');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('missing subject');
  }
  return payload;
}
