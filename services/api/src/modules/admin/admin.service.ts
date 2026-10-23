import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { AccountStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessCode, BusinessException } from '../../common/exceptions/business.exception';
import { signJwt } from '../../common/utils/jwt';
import { uuidv7 } from '../../common/utils/uuidv7';
import type { AuthenticatedAdmin } from '../../common/decorators/admin.decorator';
import { DrugSeedImportService, type DrugSeedImportResult } from './drug-seed-import.service';
import type {
  AdminLoginDto,
  CreateAppVersionDto,
  DrugReviewDto,
  ListAccountsQueryDto,
  ListAppVersionsQueryDto,
  ListAuditLogsQueryDto,
  ListDisputesQueryDto,
  ListDrugsQueryDto,
  ListMembersQueryDto,
  ListPlansQueryDto,
  ResolveDisputeDto,
  UpdateAppVersionDto,
} from './dto/admin.dto';

/** 请求上下文（审计落 ip / userAgent 用） */
export interface AdminRequestContext {
  ip?: string;
  userAgent?: string;
}

/** 后台 access token 有效期：8 小时（契约未给后台 refresh 端点，按一个工作班次定版） */
const ADMIN_ACCESS_TTL_SEC = 8 * 60 * 60;

/** 药品核验第一段的审计动作（第二段据此查核验人，校验核验人≠复核人） */
export const DRUG_REVIEW_VERIFY_ACTION = 'admin:drug:review_verify';

/**
 * 后台管理服务：独立于用户端的主体（admin_user + 角色），一切写操作落 audit_log，
 * 裁决/冻结/核验类动作在 detail 中双记录前后值。后台不绕过成员隔离读单成员明细——
 * 账号/成员仅做监管口径列表与聚合，病历等正文不在本域暴露。
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly seedImport: DrugSeedImportService,
  ) {}

  // ------------------------------------------------------------------ 登录

  async login(dto: AdminLoginDto, ctx: AdminRequestContext) {
    const admin = await this.prisma.adminUser.findFirst({
      where: { username: dto.username, deletedAt: null },
      include: { userRoles: { where: { deletedAt: null }, include: { role: true } } },
    });
    if (!admin) {
      throw new BusinessException(BusinessCode.Unauthorized, '用户名或密码不正确', HttpStatus.UNAUTHORIZED);
    }
    let passwordOk = false;
    try {
      passwordOk = await argon2.verify(admin.passwordHash, dto.password);
    } catch {
      passwordOk = false;
    }
    if (!passwordOk) {
      await this.writeAudit({
        adminId: admin.id,
        action: 'admin:auth:login',
        targetType: 'admin_user',
        targetId: admin.id,
        detail: { username: admin.username },
        result: 'failed',
        ctx,
      });
      throw new BusinessException(BusinessCode.Unauthorized, '用户名或密码不正确', HttpStatus.UNAUTHORIZED);
    }
    if (admin.status !== 'active') {
      throw new BusinessException(
        BusinessCode.Forbidden,
        `管理员账号状态为 ${admin.status}，不可登录`,
        HttpStatus.FORBIDDEN,
      );
    }
    const roles = admin.userRoles.map((ur) => ur.role.code);
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    await this.writeAudit({
      adminId: admin.id,
      action: 'admin:auth:login',
      targetType: 'admin_user',
      targetId: admin.id,
      detail: { username: admin.username, roles },
      ctx,
    });
    const accessToken = signJwt(
      { sub: admin.id, type: 'admin', aud: 'admin', username: admin.username, roles },
      this.adminSecret(),
      ADMIN_ACCESS_TTL_SEC,
    );
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ADMIN_ACCESS_TTL_SEC,
      admin: { id: admin.id, username: admin.username, realName: admin.realName, roles },
    };
  }

  // ------------------------------------------------------------------ 看板

  async dashboard() {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const [
      accountsTotal,
      accountsActive,
      accountsFrozen,
      membersTotal,
      drugsTotal,
      drugsPendingReview,
      deliveriesToday,
      deliveriesFailedToday,
      plansActive,
      disputesOpen,
    ] = await Promise.all([
      this.prisma.userAccount.count({ where: { deletedAt: null } }),
      this.prisma.userAccount.count({ where: { deletedAt: null, status: AccountStatus.Active } }),
      this.prisma.userAccount.count({ where: { deletedAt: null, status: AccountStatus.Frozen } }),
      this.prisma.member.count({ where: { deletedAt: null } }),
      this.prisma.drug.count({ where: { deletedAt: null } }),
      this.prisma.drug.count({ where: { deletedAt: null, reviewStatus: 'pending_review' } }),
      this.prisma.reminderDeliveryLog.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.reminderDeliveryLog.count({
        where: { createdAt: { gte: startOfToday }, result: 'failed' },
      }),
      this.prisma.medicationPlan.count({ where: { deletedAt: null, status: 'active' } }),
      this.prisma.feedbackTicket.count({ where: { deletedAt: null, status: 'open' } }),
    ]);
    return {
      accounts: { total: accountsTotal, active: accountsActive, frozen: accountsFrozen },
      members: { total: membersTotal },
      drugs: { total: drugsTotal, pendingReview: drugsPendingReview },
      deliveriesToday: { total: deliveriesToday, failed: deliveriesFailedToday },
      plans: { active: plansActive },
      disputes: { open: disputesOpen },
    };
  }

  // -------------------------------------------------------------- 账号/成员

  async listAccounts(query: ListAccountsQueryDto) {
    const where: Prisma.UserAccountWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { nickname: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.userAccount.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          nickname: true,
          status: true,
          registerChannel: true,
          registeredAt: true,
          lastLoginAt: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { members: true } },
        },
      }),
      this.prisma.userAccount.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getAccount(id: string) {
    const account = await this.prisma.userAccount.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        nickname: true,
        status: true,
        registerChannel: true,
        registeredAt: true,
        lastLoginAt: true,
        timezone: true,
        cancelApplyAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
        members: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, displayName: true, relationship: true, gender: true, status: true },
        },
        _count: { select: { devices: true } },
      },
    });
    if (!account) {
      throw new BusinessException(BusinessCode.NotFound, 'account not found', HttpStatus.NOT_FOUND);
    }
    return account;
  }

  /** 冻结/解冻：前后状态双记录入审计。 */
  async setAccountFrozen(
    admin: AuthenticatedAdmin,
    id: string,
    frozen: boolean,
    ctx: AdminRequestContext,
  ) {
    const account = await this.prisma.userAccount.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!account) {
      throw new BusinessException(BusinessCode.NotFound, 'account not found', HttpStatus.NOT_FOUND);
    }
    const target = frozen ? AccountStatus.Frozen : AccountStatus.Active;
    if (account.status === target) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `account already ${target}`,
        HttpStatus.CONFLICT,
      );
    }
    if (frozen && account.status === AccountStatus.Cancelled) {
      throw new BusinessException(BusinessCode.Conflict, 'cancelled account cannot be frozen', HttpStatus.CONFLICT);
    }
    if (!frozen && account.status !== AccountStatus.Frozen) {
      throw new BusinessException(BusinessCode.Conflict, 'only frozen accounts can be unfrozen', HttpStatus.CONFLICT);
    }
    const updated = await this.prisma.userAccount.update({
      where: { id },
      data: { status: target },
      select: { id: true, status: true, updatedAt: true },
    });
    await this.writeAudit({
      adminId: admin.adminId,
      action: frozen ? 'admin:account:freeze' : 'admin:account:unfreeze',
      targetType: 'user_account',
      targetId: id,
      detail: { before: { status: account.status }, after: { status: target } },
      ctx,
    });
    return updated;
  }

  async listMembers(query: ListMembersQueryDto) {
    const where: Prisma.MemberWhereInput = {
      deletedAt: null,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { displayName: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          accountId: true,
          displayName: true,
          relationship: true,
          gender: true,
          timezone: true,
          status: true,
          createdAt: true,
          account: { select: { id: true, nickname: true, status: true } },
        },
      }),
      this.prisma.member.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // ------------------------------------------------------------------ 药品

  async listDrugs(query: ListDrugsQueryDto) {
    const where: Prisma.DrugWhereInput = {
      deletedAt: null,
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(query.q
        ? {
            OR: [
              { genericName: { contains: query.q, mode: 'insensitive' } },
              { brandName: { contains: query.q, mode: 'insensitive' } },
              { approvalNumber: { contains: query.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.drug.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          genericName: true,
          brandName: true,
          manufacturer: true,
          approvalNumber: true,
          dosageForm: true,
          specification: true,
          unit: true,
          sourceType: true,
          reviewStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.drug.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getDrug(id: string) {
    const drug = await this.prisma.drug.findFirst({ where: { id, deletedAt: null } });
    if (!drug) {
      throw new BusinessException(BusinessCode.NotFound, 'drug not found', HttpStatus.NOT_FOUND);
    }
    // 附最近一段核验审计（供后台展示双人核验进度）
    const lastVerify = await this.prisma.auditLog.findFirst({
      where: { action: DRUG_REVIEW_VERIFY_ACTION, targetType: 'drug', targetId: id },
      orderBy: { createdAt: 'desc' },
      select: { actorId: true, createdAt: true, detail: true },
    });
    return { ...drug, lastVerification: lastVerify };
  }

  /**
   * 药品双人核验两段：
   *  verify —— 核验人对 pending_review 药品核验（状态不变，审计落核验人）；
   *  decide —— 复核人裁定 approved/rejected，强制复核人 ≠ 最近一段核验人。
   */
  async reviewDrug(
    admin: AuthenticatedAdmin,
    id: string,
    dto: DrugReviewDto,
    ctx: AdminRequestContext,
  ) {
    const drug = await this.prisma.drug.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, genericName: true, reviewStatus: true },
    });
    if (!drug) {
      throw new BusinessException(BusinessCode.NotFound, 'drug not found', HttpStatus.NOT_FOUND);
    }
    if (drug.reviewStatus !== 'pending_review') {
      throw new BusinessException(
        BusinessCode.Conflict,
        `drug is ${drug.reviewStatus}, only pending_review drugs can be reviewed`,
        HttpStatus.CONFLICT,
      );
    }
    if (dto.stage === 'verify') {
      await this.writeAudit({
        adminId: admin.adminId,
        action: DRUG_REVIEW_VERIFY_ACTION,
        targetType: 'drug',
        targetId: id,
        detail: {
          stage: 'verify',
          note: dto.note ?? null,
          before: { reviewStatus: drug.reviewStatus },
          after: { reviewStatus: drug.reviewStatus },
        },
        ctx,
      });
      return { id, reviewStatus: drug.reviewStatus, stage: 'verify', verifier: admin.adminId };
    }
    // stage === 'decide'
    if (!dto.decision) {
      throw new BusinessException(BusinessCode.BadRequest, 'decision is required for stage=decide');
    }
    const lastVerify = await this.prisma.auditLog.findFirst({
      where: { action: DRUG_REVIEW_VERIFY_ACTION, targetType: 'drug', targetId: id },
      orderBy: { createdAt: 'desc' },
      select: { actorId: true },
    });
    if (!lastVerify) {
      throw new BusinessException(
        BusinessCode.Conflict,
        'drug has not completed the verification stage yet',
        HttpStatus.CONFLICT,
      );
    }
    if (lastVerify.actorId === admin.adminId) {
      throw new BusinessException(
        BusinessCode.Conflict,
        '复核人不得与核验人为同一人（双人核验）',
        HttpStatus.CONFLICT,
      );
    }
    const target = dto.decision === 'approve' ? 'approved' : 'rejected';
    const updated = await this.prisma.drug.update({
      where: { id },
      data: { reviewStatus: target },
      select: { id: true, reviewStatus: true, updatedAt: true },
    });
    await this.writeAudit({
      adminId: admin.adminId,
      action: 'admin:drug:review_decide',
      targetType: 'drug',
      targetId: id,
      detail: {
        stage: 'decide',
        decision: dto.decision,
        note: dto.note ?? null,
        verifiedBy: lastVerify.actorId,
        before: { reviewStatus: drug.reviewStatus },
        after: { reviewStatus: target },
      },
      ctx,
    });
    return { ...updated, stage: 'decide', verifier: lastVerify.actorId, decider: admin.adminId };
  }

  async importDrugSeed(admin: AuthenticatedAdmin, ctx: AdminRequestContext): Promise<DrugSeedImportResult> {
    const result = await this.seedImport.importSeed();
    await this.writeAudit({
      adminId: admin.adminId,
      action: 'admin:drug:import_seed',
      targetType: 'drug',
      detail: { ...result },
      ctx,
    });
    return result;
  }

  // -------------------------------------------------------------- 计划监管

  async listPlans(query: ListPlansQueryDto) {
    const where: Prisma.MedicationPlanWhereInput = {
      deletedAt: null,
      ...(query.memberId ? { memberId: query.memberId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.medicationPlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          memberId: true,
          name: true,
          planType: true,
          status: true,
          startDate: true,
          endDate: true,
          createdByAccountId: true,
          createdAt: true,
          updatedAt: true,
          member: { select: { id: true, displayName: true, accountId: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.medicationPlan.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** 计划变更史：字段级时间线（plan_change_history，只追加表）。 */
  async getPlanHistory(id: string, query: { page: number; pageSize: number }) {
    const plan = await this.prisma.medicationPlan.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, memberId: true, name: true },
    });
    if (!plan) {
      throw new BusinessException(BusinessCode.NotFound, 'plan not found', HttpStatus.NOT_FOUND);
    }
    const where: Prisma.PlanChangeHistoryWhereInput = { planId: id };
    const [items, total] = await Promise.all([
      this.prisma.planChangeHistory.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.planChangeHistory.count({ where }),
    ]);
    return { plan, items, total, page: query.page, pageSize: query.pageSize };
  }

  // -------------------------------------------------------------- 客服裁决
  // 纠纷载体为 feedback_ticket（schema 无专设 dispute 表）；裁决写 resolution +
  // status=resolved，审计 detail 双记录裁决前后值（客服全权裁决定版口径）。

  async listDisputes(query: ListDisputesQueryDto) {
    const where: Prisma.FeedbackTicketWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.feedbackTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          account: { select: { id: true, nickname: true, status: true } },
          member: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.feedbackTicket.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async resolveDispute(
    admin: AuthenticatedAdmin,
    id: string,
    dto: ResolveDisputeDto,
    ctx: AdminRequestContext,
  ) {
    const ticket = await this.prisma.feedbackTicket.findFirst({
      where: { id, deletedAt: null },
    });
    if (!ticket) {
      throw new BusinessException(BusinessCode.NotFound, 'dispute not found', HttpStatus.NOT_FOUND);
    }
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      throw new BusinessException(
        BusinessCode.Conflict,
        `dispute already ${ticket.status}`,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.prisma.feedbackTicket.update({
      where: { id },
      data: {
        status: 'resolved',
        resolution: dto.resolution,
        assignedAdminId: ticket.assignedAdminId ?? admin.adminId,
      },
    });
    await this.writeAudit({
      adminId: admin.adminId,
      action: 'admin:dispute:resolve',
      targetType: 'feedback_ticket',
      targetId: id,
      memberId: ticket.memberId ?? undefined,
      detail: {
        before: { status: ticket.status, resolution: ticket.resolution },
        after: { status: 'resolved', resolution: dto.resolution },
        category: ticket.category,
      },
      ctx,
    });
    return updated;
  }

  // ------------------------------------------------------------------ 审计

  async listAuditLogs(query: ListAuditLogsQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorType ? { actorType: query.actorType } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  // -------------------------------------------------------------- 客户端版本

  async listAppVersions(query: ListAppVersionsQueryDto) {
    const where: Prisma.AppVersionWhereInput = {
      deletedAt: null,
      ...(query.platform ? { platform: query.platform } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.appVersion.findMany({
        where,
        orderBy: [{ platform: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.appVersion.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createAppVersion(admin: AuthenticatedAdmin, dto: CreateAppVersionDto, ctx: AdminRequestContext) {
    const clash = await this.prisma.appVersion.findFirst({
      where: { platform: dto.platform, version: dto.version, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `app version already exists: ${dto.platform}/${dto.version}`,
        HttpStatus.CONFLICT,
      );
    }
    const created = await this.prisma.appVersion.create({
      data: {
        id: uuidv7(),
        platform: dto.platform,
        version: dto.version,
        minSupportedVersion: dto.minSupportedVersion ?? null,
        releaseNote: dto.releaseNote ?? null,
        downloadUrl: dto.downloadUrl ?? null,
        status: dto.status ?? 'active',
      },
    });
    await this.writeAudit({
      adminId: admin.adminId,
      action: 'admin:app_version:create',
      targetType: 'app_version',
      targetId: created.id,
      detail: { platform: dto.platform, version: dto.version },
      ctx,
    });
    return created;
  }

  async updateAppVersion(
    admin: AuthenticatedAdmin,
    id: string,
    dto: UpdateAppVersionDto,
    ctx: AdminRequestContext,
  ) {
    const existing = await this.prisma.appVersion.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'app version not found', HttpStatus.NOT_FOUND);
    }
    const data: Prisma.AppVersionUpdateInput = {};
    if (dto.minSupportedVersion !== undefined) data.minSupportedVersion = dto.minSupportedVersion;
    if (dto.releaseNote !== undefined) data.releaseNote = dto.releaseNote;
    if (dto.downloadUrl !== undefined) data.downloadUrl = dto.downloadUrl;
    if (dto.status !== undefined) data.status = dto.status;
    const updated = await this.prisma.appVersion.update({ where: { id }, data });
    await this.writeAudit({
      adminId: admin.adminId,
      action: 'admin:app_version:update',
      targetType: 'app_version',
      targetId: id,
      detail: {
        before: {
          minSupportedVersion: existing.minSupportedVersion,
          status: existing.status,
        },
        after: {
          minSupportedVersion: updated.minSupportedVersion,
          status: updated.status,
        },
      },
      ctx,
    });
    return updated;
  }

  async deleteAppVersion(admin: AuthenticatedAdmin, id: string, ctx: AdminRequestContext) {
    const existing = await this.prisma.appVersion.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, platform: true, version: true },
    });
    if (!existing) {
      throw new BusinessException(BusinessCode.NotFound, 'app version not found', HttpStatus.NOT_FOUND);
    }
    await this.prisma.appVersion.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.writeAudit({
      adminId: admin.adminId,
      action: 'admin:app_version:delete',
      targetType: 'app_version',
      targetId: id,
      detail: { platform: existing.platform, version: existing.version },
      ctx,
    });
    return { deleted: true as const };
  }

  // ------------------------------------------------------------------ 内部

  private adminSecret(): string {
    const secret =
      this.config.get<string>('ADMIN_JWT_SECRET') ??
      this.config.get<string>('jwt.accessSecret') ??
      (process.env.NODE_ENV === 'production' ? undefined : 'med-on-time-dev-admin-secret');
    if (!secret) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        'admin jwt secret not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return secret;
  }

  /** 审计落库（audit_log 只追加；detail 禁止写入明文敏感值——调用方只传状态/结论级信息）。 */
  private async writeAudit(params: {
    adminId: string;
    action: string;
    targetType: string;
    targetId?: string;
    memberId?: string;
    detail?: Prisma.InputJsonValue;
    result?: 'success' | 'denied' | 'failed';
    ctx?: AdminRequestContext;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: uuidv7(),
        actorType: 'admin',
        actorId: params.adminId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ?? null,
        memberId: params.memberId ?? null,
        detail: params.detail ?? undefined,
        ipAddress: params.ctx?.ip ?? null,
        userAgent: params.ctx?.userAgent ?? null,
        result: params.result ?? 'success',
      },
    });
  }
}
