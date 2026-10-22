import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthorizationStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * 成员数据隔离守卫（架构红线 5，硬规则；架构 §3.2 指定实现位置）。
 *
 * 凡路径/查询/请求体携带 memberId 的接口必须挂本守卫：先查成员归属或有效授权，
 * 再放行。服务层不得绕过。放行条件（满足其一）：
 *  1. 成员归属当前账号（member.account_id === 当前账号，含本人成员）；
 *  2. 当前账号对该成员持有 status=active 且未过期的照护授权（级别与逐项开关的
 *     细粒度校验由各业务服务在守卫放行后按操作类型再验，见 authorization 模块）。
 */
@Injectable()
export class MemberAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params: Record<string, string>;
      query: Record<string, string>;
      body?: Record<string, unknown>;
    }>();
    const user = request.user;
    if (!user) throw new UnauthorizedException('missing authenticated user');

    const memberId =
      request.params.memberId ??
      request.params.id ??
      request.query.memberId ??
      (typeof request.body?.memberId === 'string'
        ? (request.body.memberId as string)
        : undefined);
    // 未携带 memberId 的接口不归本守卫管辖（如账号自身接口）
    if (!memberId) return true;

    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { id: true, accountId: true },
    });
    if (!member) throw new NotFoundException('member not found');
    if (member.accountId === user.accountId) return true;

    const authorization = await this.prisma.caregiverAuthorization.findFirst({
      where: {
        caregiverAccountId: user.accountId,
        memberId,
        status: AuthorizationStatus.Active,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (authorization) return true;

    throw new ForbiddenException('no access to this member');
  }
}
