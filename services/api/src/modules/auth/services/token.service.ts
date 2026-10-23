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

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  readonly accessTtlSeconds = ACCESS_TTL_SECONDS;
  readonly refreshTtlSeconds = REFRESH_TTL_SECONDS;

  constructor(private readonly config: ConfigService) {
    this.accessSecret =
      this.config.get<string>('jwt.accessSecret') ?? DEV_ACCESS_SECRET_FALLBACK;
    this.refreshSecret =
      this.config.get<string>('jwt.refreshSecret') ?? DEV_REFRESH_SECRET_FALLBACK;
    if (
      !this.config.get<string>('jwt.accessSecret') ||
      !this.config.get<string>('jwt.refreshSecret')
    ) {
      this.logger.warn('JWT 密钥未配置，使用开发默认值（生产环境禁止）');
    }
  }

  signAccessToken(accountId: string, sessionId: string): string {
    return signJwt(
      { sub: accountId, type: 'user', sid: sessionId, jti: randomUUID() },
      this.accessSecret,
      ACCESS_TTL_SECONDS,
    );
  }

  signRefreshToken(accountId: string, sessionId: string): { token: string; jti: string } {
    const jti = randomUUID();
    const token = signJwt(
      { sub: accountId, type: 'refresh', sid: sessionId, jti },
      this.refreshSecret,
      REFRESH_TTL_SECONDS,
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
