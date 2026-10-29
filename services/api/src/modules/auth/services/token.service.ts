import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  DEV_ACCESS_SECRET_FALLBACK,
  DEV_REFRESH_SECRET_FALLBACK,
  signJwt,
  verifyJwt,
} from '../../../common/utils/jwt';

/**
 * 用户端 JWT 签发/校验（定版：底层统一走 common/utils/jwt，本类只管
 * 用户端密钥、TTL 与会话字段，不再自建签名实现）。
 * 契约口径：access 2h + refresh 30d；refresh 另在 SessionService 落会话记录以便吊销。
 * payload: { sub: accountId, sid: 会话ID, jti, type: 'user'|'refresh', iat, exp }
 * TODO(生产): JWT_*_SECRET 必须经保险库注入；未配置时使用开发默认值并打警告日志。
 */
export interface JwtPayload {
  sub: string;
  sid: string;
  jti: string;
  type: 'user' | 'refresh';
  iat: number;
  exp: number;
}

const ACCESS_TTL_SECONDS = 2 * 60 * 60; // 2h（契约）
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60; // 30d（契约）

function parseTtlSeconds(raw: string | number | undefined, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const m = /^(\d+)\s*([smhd])$/i.exec(trimmed);
  if (!m) return fallback;
  const numPart = m[1];
  const unitPart = m[2];
  if (numPart === undefined || unitPart === undefined) return fallback;
  const val = parseInt(numPart, 10);
  const unit = unitPart.toLowerCase();
  if (unit === 's') return val;
  if (unit === 'm') return val * 60;
  if (unit === 'h') return val * 3600;
  if (unit === 'd') return val * 86400;
  return fallback;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;

  constructor(private readonly config: ConfigService) {
    const isProd = process.env.NODE_ENV === 'production';
    const rawAccessSecret = this.config.get<string>('jwt.accessSecret');
    const rawRefreshSecret = this.config.get<string>('jwt.refreshSecret');
    if (isProd && (!rawAccessSecret || !rawRefreshSecret)) {
      throw new Error(
        '生产环境必须配置 JWT_ACCESS_SECRET 与 JWT_REFRESH_SECRET，禁止回退开发默认密钥',
      );
    }
    // 管理员密钥独立性（2026-10-30 审查 H-3）：生产环境 ADMIN_JWT_SECRET
    // 必须显式配置且不得与用户端 access 密钥相同——管理员令牌与用户令牌
    // 同钥等于隔离失效（任一端密钥泄漏即全域沦陷），缺失/相同一律拒启动。
    if (isProd) {
      const adminSecret = this.config.get<string>('ADMIN_JWT_SECRET');
      if (!adminSecret) {
        throw new Error(
          '生产环境必须配置 ADMIN_JWT_SECRET（管理员令牌独立密钥），禁止回退用户端密钥',
        );
      }
      if (rawAccessSecret && adminSecret === rawAccessSecret) {
        throw new Error(
          'ADMIN_JWT_SECRET 不得与 JWT_ACCESS_SECRET 相同（管理员与用户令牌必须异钥）',
        );
      }
    }
    this.accessSecret = rawAccessSecret ?? DEV_ACCESS_SECRET_FALLBACK;
    this.refreshSecret = rawRefreshSecret ?? DEV_REFRESH_SECRET_FALLBACK;
    this.accessTtlSeconds = parseTtlSeconds(
      this.config.get<string>('jwt.accessTtl'),
      ACCESS_TTL_SECONDS,
    );
    this.refreshTtlSeconds = parseTtlSeconds(
      this.config.get<string>('jwt.refreshTtl'),
      REFRESH_TTL_SECONDS,
    );
    if (!rawAccessSecret || !rawRefreshSecret) {
      this.logger.warn('JWT 密钥未配置，使用开发默认值（生产环境禁止）');
    }
  }

  signAccessToken(accountId: string, sessionId: string): string {
    return signJwt(
      { sub: accountId, type: 'user', sid: sessionId, jti: randomUUID() },
      this.accessSecret,
      this.accessTtlSeconds,
    );
  }

  signRefreshToken(accountId: string, sessionId: string): { token: string; jti: string } {
    const jti = randomUUID();
    const token = signJwt(
      { sub: accountId, type: 'refresh', sid: sessionId, jti },
      this.refreshSecret,
      this.refreshTtlSeconds,
    );
    return { token, jti };
  }

  /** 校验签名/类型/有效期/会话字段；任一不符返回 null（由调用方转 401）。 */
  verify(token: string, type: 'user' | 'refresh'): JwtPayload | null {
    const secret = type === 'user' ? this.accessSecret : this.refreshSecret;
    try {
      const payload = verifyJwt(token, secret);
      if (payload.type !== type) return null;
      if (!payload.sid || !payload.jti) return null;
      return {
        sub: payload.sub,
        sid: payload.sid,
        jti: payload.jti,
        type,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch {
      return null;
    }
  }
}
