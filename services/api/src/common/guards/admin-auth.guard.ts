import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyJwt } from '../utils/jwt';
import {
  ADMIN_ROLES_KEY,
  type AuthenticatedAdmin,
} from '../decorators/admin.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * 后台 JWT 守卫（与用户端隔离）：密钥优先 ADMIN_JWT_SECRET，未配置回退
 * JWT_ACCESS_SECRET，但 payload 必须同时满足 type='admin' 且 aud='admin'，
 * 用户端 token 无法冒充。再按 @AdminRoles 元数据做角色门禁（super_admin 恒放行）。
 * 通过后写入 request.admin，并同步 request.user.adminId（兼容 CurrentUser 结构）。
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthenticatedUser;
      admin?: AuthenticatedAdmin;
    }>();
    const header = request.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing bearer token');
    }
    const secret =
      this.config.get<string>('ADMIN_JWT_SECRET') ??
      this.config.get<string>('jwt.accessSecret') ??
      (process.env.NODE_ENV === 'production' ? undefined : 'med-on-time-dev-admin-secret');
    if (!secret) throw new UnauthorizedException('admin jwt secret not configured');

    let adminId: string;
    try {
      const payload = verifyJwt(header.slice('Bearer '.length), secret);
      if (payload.type !== 'admin' || payload.aud !== 'admin') {
        throw new Error('not an admin token');
      }
      adminId = payload.sub;
    } catch {
      throw new UnauthorizedException('invalid or expired admin token');
    }

    const adminRow = await this.prisma.adminUser.findFirst({
      where: { id: adminId, status: 'active', deletedAt: null },
      include: {
        userRoles: {
          where: { deletedAt: null },
          include: { role: true },
        },
      },
    });
    if (!adminRow) {
      throw new UnauthorizedException('admin account unavailable');
    }

    const roles = adminRow.userRoles
      .filter((ur) => ur.role.deletedAt === null)
      .map((ur) => ur.role.code);
    const admin: AuthenticatedAdmin = {
      adminId: adminRow.id,
      username: adminRow.username,
      roles,
    };
    request.admin = admin;
    request.user = { accountId: '', adminId: admin.adminId };

    const required = this.reflector.getAllAndOverride<string[] | undefined>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      required &&
      required.length > 0 &&
      !admin.roles.includes('super_admin') &&
      !required.some((role) => admin.roles.includes(role))
    ) {
      throw new ForbiddenException('insufficient admin role');
    }
    return true;
  }
}
