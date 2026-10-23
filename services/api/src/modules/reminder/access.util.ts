import { HttpStatus } from '@nestjs/common';
import { AuthorizationStatus } from '@med-on-time/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * 成员访问解析（服务层版，与 common/guards/member-access.guard 同口径）：
 * 实例级接口（路径只有 instanceId、无 memberId）守卫无法覆盖，必须在服务层
 * 先由实例反查 memberId 再做隔离校验，本文件是 reminder/checkin/adherence
 * 三个模块共用的唯一实现，禁止各模块另写一份导致口径漂移。
 */

export interface MemberAccess {
  relation: 'self' | 'caregiver';
  /** self 时为 'self'；照护时为授权级别 L1 / L2 / L3 */
  level: string;
  authorizationId?: string;
  member: { id: string; accountId: string; timezone: string; status: string };
}

export function requireAccountId(user: AuthenticatedUser | undefined): string {
  if (!user?.accountId) {
    throw new BusinessException(
      BusinessCode.Unauthorized,
      'missing authenticated user',
      HttpStatus.UNAUTHORIZED,
    );
  }
  return user.accountId;
}

export async function resolveMemberAccess(
  prisma: PrismaService,
  accountId: string,
  memberId: string,
): Promise<MemberAccess> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: { id: true, accountId: true, timezone: true, status: true },
  });
  if (!member) {
    throw new BusinessException(
      BusinessCode.NotFound,
      'member not found',
      HttpStatus.NOT_FOUND,
    );
  }
  if (member.accountId === accountId) {
    return { relation: 'self', level: 'self', member };
  }
  const authorization = await prisma.caregiverAuthorization.findFirst({
    where: {
      caregiverAccountId: accountId,
      memberId,
      status: AuthorizationStatus.Active,
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true, level: true },
  });
  if (authorization) {
    return {
      relation: 'caregiver',
      level: authorization.level,
      authorizationId: authorization.id,
      member,
    };
  }
  throw new BusinessException(
    BusinessCode.MemberAccessDenied,
    'no access to this member',
    HttpStatus.FORBIDDEN,
  );
}

/** 代操作级别校验：照护人执行协助类动作（打卡/顺延/跳过）须 L2 以上（DB 口径） */
export function assertAssistLevel(access: MemberAccess): void {
  if (access.relation === 'caregiver' && access.level === 'L1') {
    throw new BusinessException(
      BusinessCode.MemberAccessDenied,
      'caregiver level L1 is read-only; L2 or above required',
      HttpStatus.FORBIDDEN,
    );
  }
}
