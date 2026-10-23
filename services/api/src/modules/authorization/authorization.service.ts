import { HttpStatus, Injectable } from '@nestjs/common';
import type { CaregiverAuthorization, Prisma } from '@prisma/client';
import { AuthorizationStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import {
  AuthBusinessCode,
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { PhoneCryptoService } from '../auth/services/phone-crypto.service';
import type {
  CreateAuthorizationDto,
  ListAuthorizationsQueryDto,
} from './dto/authorization.dto';

/** 照护人上限（需求定版口径：5 名/成员） */
export const MAX_CAREGIVERS_PER_MEMBER = 5;

const LIVE_STATUSES: string[] = [
  AuthorizationStatus.PendingAccept,
  AuthorizationStatus.Active,
  AuthorizationStatus.Suspended,
];

/**
 * 照护授权线。状态机：pending_accept → active（接受）/ rejected（拒绝）；
 * active|suspended|pending_accept → revoked（撤销）；到期自动 expired（接受时校验）。
 * 一切状态变更写入 caregiver_authorization_log（追加型，operator 双记录：
 * operator_type=account + operator_id + before/after 快照），对齐红线 6。
 */
@Injectable()
export class AuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneCrypto: PhoneCryptoService,
  ) {}

  async create(accountId: string, dto: CreateAuthorizationDto) {
    const member = await this.prisma.member.findFirst({
      where: { id: dto.memberId, deletedAt: null },
      select: { id: true, accountId: true, displayName: true },
    });
    if (!member) {
      throw new BusinessException(BusinessCode.NotFound, '成员不存在', HttpStatus.NOT_FOUND);
    }
    // 发起人必须是成员归属账号（照护人不得再转授）
    if (member.accountId !== accountId) {
      throw new BusinessException(
        BusinessCode.MemberAccessDenied,
        '仅成员归属账号可发起照护授权',
        HttpStatus.FORBIDDEN,
      );
    }

    const caregiver = await this.prisma.userAccount.findFirst({
      where: { phoneHash: this.phoneCrypto.hashPhone(dto.caregiverPhone), deletedAt: null },
      select: { id: true },
    });
    if (!caregiver) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '该手机号尚未注册，无法发起授权',
        HttpStatus.NOT_FOUND,
      );
    }
    if (caregiver.id === accountId) {
      throw new BusinessException(BusinessCode.Conflict, '不可授权给自己', HttpStatus.CONFLICT);
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BusinessException(BusinessCode.BadRequest, 'expiresAt 不是合法时间');
    }
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BusinessException(BusinessCode.BadRequest, 'expiresAt 必须晚于当前时间');
    }

    const live = await this.prisma.caregiverAuthorization.findMany({
      where: { memberId: dto.memberId, status: { in: LIVE_STATUSES }, deletedAt: null },
      select: { id: true, caregiverAccountId: true, status: true },
    });
    if (live.some((a) => a.caregiverAccountId === caregiver.id)) {
      throw new BusinessException(
        BusinessCode.Conflict,
        '该照护人已在授权列表中（待接受/生效/暂停）',
        HttpStatus.CONFLICT,
      );
    }
    if (live.length >= MAX_CAREGIVERS_PER_MEMBER) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `照护人数量已达上限（${MAX_CAREGIVERS_PER_MEMBER} 名/成员）`,
        HttpStatus.CONFLICT,
      );
    }

    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      const auth = await tx.caregiverAuthorization.create({
        data: {
          id: uuidv7(),
          memberId: dto.memberId,
          caregiverAccountId: caregiver.id,
          grantedByAccountId: accountId,
          level: dto.level,
          permissions: (dto.permissions ?? {}) as Prisma.InputJsonValue,
          status: AuthorizationStatus.PendingAccept,
          invitedAt: now,
          expiresAt,
        },
      });
      await this.writeLog(tx, auth, 'invited', accountId, null, auth);
      return auth;
    });
    return this.toView(created);
  }

  async list(accountId: string, query: ListAuthorizationsQueryDto) {
    const include = {
      member: { select: { id: true, displayName: true, accountId: true } },
      caregiverAccount: { select: { id: true, nickname: true } },
      grantedByAccount: { select: { id: true, nickname: true } },
    } as const;
    const [granted, received] = await Promise.all([
      query.view === 'received'
        ? []
        : this.prisma.caregiverAuthorization.findMany({
            where: { grantedByAccountId: accountId, deletedAt: null },
            include,
            orderBy: { createdAt: 'desc' },
          }),
      query.view === 'granted'
        ? []
        : this.prisma.caregiverAuthorization.findMany({
            where: { caregiverAccountId: accountId, deletedAt: null },
            include,
            orderBy: { createdAt: 'desc' },
          }),
    ]);
    return {
      granted: granted.map((a) => this.toView(a)),
      received: received.map((a) => this.toView(a)),
    };
  }

  async accept(accountId: string, id: string) {
    const auth = await this.getOrThrow(id);
    if (auth.caregiverAccountId !== accountId) {
      throw new BusinessException(
        BusinessCode.MemberAccessDenied,
        '仅被邀照护人可接受授权',
        HttpStatus.FORBIDDEN,
      );
    }
    if (auth.status !== AuthorizationStatus.PendingAccept) {
      throw new BusinessException(BusinessCode.Conflict, `授权状态 ${auth.status} 不可接受`);
    }
    // V1.3 三受限之三：接受授权即取得他人用药数据的照护权限，接受者手机号必须
    // 已验证（防未验证登记号码被冒领授权），且与邀请时解析的照护人手机号哈希一致。
    const accepter = await this.prisma.userAccount.findFirst({
      where: { id: accountId, deletedAt: null },
      select: { phoneHash: true, phoneVerifiedAt: true },
    });
    if (!accepter?.phoneVerifiedAt) {
      throw new BusinessException(
        AuthBusinessCode.PhoneVerificationRequired,
        '接受照护授权前须先完成手机号验证',
        HttpStatus.FORBIDDEN,
      );
    }
    const invitedCaregiver = await this.prisma.userAccount.findFirst({
      where: { id: auth.caregiverAccountId, deletedAt: null },
      select: { phoneHash: true },
    });
    if (!invitedCaregiver || accepter.phoneHash !== invitedCaregiver.phoneHash) {
      throw new BusinessException(
        AuthBusinessCode.PhoneMismatch,
        '当前账号手机号与邀请手机号不一致，无法接受授权',
        HttpStatus.CONFLICT,
      );
    }
    const now = new Date();
    if (auth.expiresAt && auth.expiresAt.getTime() <= now.getTime()) {
      await this.transition(auth, AuthorizationStatus.Expired, 'expired', accountId, {});
      throw new BusinessException(BusinessCode.Conflict, '授权邀请已过期', HttpStatus.CONFLICT);
    }
    const activeCount = await this.prisma.caregiverAuthorization.count({
      where: {
        memberId: auth.memberId,
        status: AuthorizationStatus.Active,
        deletedAt: null,
      },
    });
    if (activeCount >= MAX_CAREGIVERS_PER_MEMBER) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `该成员照护人已达上限（${MAX_CAREGIVERS_PER_MEMBER} 名）`,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.transition(auth, AuthorizationStatus.Active, 'accepted', accountId, {
      acceptedAt: now,
      effectiveAt: now,
    });
    return this.toView(updated);
  }

  async reject(accountId: string, id: string) {
    const auth = await this.getOrThrow(id);
    if (auth.caregiverAccountId !== accountId) {
      throw new BusinessException(
        BusinessCode.MemberAccessDenied,
        '仅被邀照护人可拒绝授权',
        HttpStatus.FORBIDDEN,
      );
    }
    if (auth.status !== AuthorizationStatus.PendingAccept) {
      throw new BusinessException(BusinessCode.Conflict, `授权状态 ${auth.status} 不可拒绝`);
    }
    const updated = await this.transition(auth, AuthorizationStatus.Rejected, 'rejected', accountId, {});
    return this.toView(updated);
  }

  /** 撤销：授权方（成员归属账号）或照护人本人均可；记 revoked_by 与原因。 */
  async revoke(accountId: string, id: string, reason?: string) {
    const auth = await this.getOrThrow(id);
    const isGrantor = auth.grantedByAccountId === accountId;
    const isCaregiver = auth.caregiverAccountId === accountId;
    if (!isGrantor && !isCaregiver) {
      throw new BusinessException(
        BusinessCode.MemberAccessDenied,
        '仅授权方或照护人本人可撤销授权',
        HttpStatus.FORBIDDEN,
      );
    }
    if (!LIVE_STATUSES.includes(auth.status)) {
      throw new BusinessException(BusinessCode.Conflict, `授权状态 ${auth.status} 不可撤销`);
    }
    const updated = await this.transition(auth, AuthorizationStatus.Revoked, 'revoked', accountId, {
      revokedAt: new Date(),
      revokedBy: accountId,
      revokeReason: reason ?? null,
    });
    return this.toView(updated);
  }

  private async transition(
    auth: CaregiverAuthorization,
    status: string,
    action: string,
    operatorAccountId: string,
    extra: Prisma.CaregiverAuthorizationUpdateInput,
  ): Promise<CaregiverAuthorization> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.caregiverAuthorization.update({
        where: { id: auth.id },
        data: { status, ...extra },
      });
      await this.writeLog(tx, updated, action, operatorAccountId, auth, updated);
      return updated;
    });
  }

  /** 授权日志双记录：operator（实际操作人）+ before/after 快照（归属成员经 authorization 关联）。 */
  private async writeLog(
    tx: Prisma.TransactionClient,
    auth: CaregiverAuthorization,
    action: string,
    operatorAccountId: string,
    before: CaregiverAuthorization | null,
    after: CaregiverAuthorization,
  ): Promise<void> {
    await tx.caregiverAuthorizationLog.create({
      data: {
        id: uuidv7(),
        authorizationId: auth.id,
        action,
        operatorType: 'account',
        operatorId: operatorAccountId,
        beforeSnapshot: before ? this.snapshot(before) : undefined,
        afterSnapshot: this.snapshot(after),
      },
    });
    // 平台审计镜像（2026-10-23 巡检补）：授权域日志是合规双记录，平台 audit_log
    // 供后台「审计日志」统一检索——此前用户侧动作从不落 audit_log，后台按操作者
    // 类型=用户账号筛选恒为空。actorType 用设计词汇 'account'（枚举 admin/account/system）。
    // 动作名 care:authorization:<invited|accepted|rejected|revoked>。
    await tx.auditLog.create({
      data: {
        id: uuidv7(),
        actorType: 'account',
        actorId: operatorAccountId,
        action: `care:authorization:${action}`,
        targetType: 'caregiver_authorization',
        targetId: auth.id,
        memberId: auth.memberId,
        detail: {
          level: after.level,
          status: after.status,
          caregiverAccountId: after.caregiverAccountId,
          grantedByAccountId: after.grantedByAccountId,
        },
        result: 'success',
      },
    });
  }

  private snapshot(a: CaregiverAuthorization): Prisma.InputJsonValue {
    return {
      id: a.id,
      memberId: a.memberId,
      caregiverAccountId: a.caregiverAccountId,
      grantedByAccountId: a.grantedByAccountId,
      level: a.level,
      status: a.status,
      expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
    };
  }

  private async getOrThrow(id: string): Promise<CaregiverAuthorization> {
    const auth = await this.prisma.caregiverAuthorization.findFirst({
      where: { id, deletedAt: null },
    });
    if (!auth) {
      throw new BusinessException(BusinessCode.NotFound, '授权不存在', HttpStatus.NOT_FOUND);
    }
    return auth;
  }

  private toView(a: CaregiverAuthorization & {
    member?: { id: string; displayName: string; accountId: string };
    caregiverAccount?: { id: string; nickname: string };
    grantedByAccount?: { id: string; nickname: string };
  }) {
    return {
      id: a.id,
      memberId: a.memberId,
      memberDisplayName: a.member?.displayName ?? null,
      caregiverAccountId: a.caregiverAccountId,
      caregiverNickname: a.caregiverAccount?.nickname ?? null,
      grantedByAccountId: a.grantedByAccountId,
      grantedByNickname: a.grantedByAccount?.nickname ?? null,
      level: a.level,
      permissions: a.permissions,
      status: a.status,
      invitedAt: a.invitedAt,
      acceptedAt: a.acceptedAt,
      effectiveAt: a.effectiveAt,
      expiresAt: a.expiresAt,
      revokedAt: a.revokedAt,
      revokedBy: a.revokedBy,
      revokeReason: a.revokeReason,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}
