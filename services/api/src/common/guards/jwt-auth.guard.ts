import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_ACCESS_SECRET_FALLBACK, verifyJwt } from '../utils/jwt';
import {
  isSessionRevoked,
  isSessionRevokedInRedis,
} from '../../modules/auth/services/session.service';
import { RedisService } from '../redis/redis.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * 用户端 JWT 守卫（全仓统一定版，2026-10-23 集成收口）：
 * 校验 Authorization: Bearer <token>（common/utils/jwt 校验签名/有效期，
 * payload.type 必须为 'user'），并回查账号状态——账号不存在、已软删、
 * 已注销（cancelled）或已冻结（frozen）一律拒绝（严格版口径，原 auth 模块
 * 守卫逻辑并入此处，用户端全部模块只用这一套）。
 * 通过后写入 request.user = { accountId }（MemberAccessGuard 与
 * CurrentUser 依赖此结构）。后台 token（type='admin'）在本守卫拒绝，反之亦然。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    // RedisService 全局提供；单测直接 new 时缺省 → 仅走进程内同步检查
    @Optional() private readonly redis?: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();
    const header = request.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    const secret =
      this.config.get<string>('jwt.accessSecret') ??
      (process.env.NODE_ENV === 'production'
        ? undefined
        : DEV_ACCESS_SECRET_FALLBACK);
    if (!secret) throw new UnauthorizedException('jwt secret not configured');

    let accountId: string;
    let sessionId: string | undefined;
    let tokenIat: number | undefined;
    try {
      const payload = verifyJwt(header.slice('Bearer '.length), secret);
      if (payload.type !== 'user') throw new Error('not a user token');
      accountId = payload.sub;
      sessionId = payload.sid;
      tokenIat = payload.iat;
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }

    if (isSessionRevoked(sessionId, accountId, tokenIat)) {
      throw new UnauthorizedException('session has been revoked');
    }

    // Redis 吊销检查：覆盖重启前发生的吊销（进程内镜像重启即失）。
    // Redis 不可用时记 warn 并降级为进程内检查（不因此锁死全部请求）。
    if (this.redis) {
      try {
        if (await isSessionRevokedInRedis(this.redis, sessionId, accountId, tokenIat)) {
          throw new UnauthorizedException('session has been revoked');
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        this.logger.warn(
          `Redis 吊销检查失败，降级为进程内检查: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const account = await this.prisma.userAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (
      !account ||
      account.status === AccountStatus.Cancelled ||
      account.status === AccountStatus.Frozen
    ) {
      throw new UnauthorizedException('account unavailable');
    }
    request.user = { accountId: account.id };
    return true;
  }
}
