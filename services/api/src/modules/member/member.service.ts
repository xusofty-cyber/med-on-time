import { HttpStatus, Injectable } from '@nestjs/common';
import type { Member } from '@prisma/client';
import { AuthorizationStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import {
  CYCLE_PRESETS,
  NotificationPrefsService,
  type CareSettings as StoredCareSettings,
} from '../notification/notification-prefs.service';
import type {
  CareSettingsDto,
  CreateMemberDto,
  UpdateMemberDto,
} from './dto/member.dto';

/**
 * 关怀设置对外视图（定版）：cycleWindowMinutes/cycleIntervalMinutes 为解析后的
 * 生效数值（显式覆盖 > 预设），与各端既有消费口径一致；底层存储形状与
 * reminder 引擎读取侧完全一致（system_config 键 member_care_settings:<memberId>，
 * 显式覆盖以 null 表示跟随预设，见 NotificationPrefsService）。
 */
export interface CareSettings {
  memberId: string;
  careMode: boolean;
  cyclePreset: StoredCareSettings['cyclePreset'];
  cycleWindowMinutes: number;
  cycleIntervalMinutes: number;
  lockScreenShowDrugDetail: boolean;
  /** 强提醒方式（成员级默认）：none / alarm / voice */
  strongAlertMode: StoredCareSettings['strongAlertMode'];
}

/** 成员上限（需求定版口径：10 名/账号） */
export const MAX_MEMBERS_PER_ACCOUNT = 10;

@Injectable()
export class MemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: NotificationPrefsService,
  ) {}

  async createMember(accountId: string, dto: CreateMemberDto): Promise<Member> {
    const count = await this.prisma.member.count({
      where: { accountId, deletedAt: null, status: { not: 'removed' } },
    });
    if (count >= MAX_MEMBERS_PER_ACCOUNT) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `成员数量已达上限（${MAX_MEMBERS_PER_ACCOUNT} 名/账号）`,
        HttpStatus.CONFLICT,
      );
    }
    if (dto.relationship === 'self') {
      const existingSelf = await this.prisma.member.findFirst({
        where: { accountId, relationship: 'self', deletedAt: null },
        select: { id: true },
      });
      if (existingSelf) {
        throw new BusinessException(
          BusinessCode.Conflict,
          '本人成员已存在，不可重复创建',
          HttpStatus.CONFLICT,
        );
      }
    }
    return this.prisma.member.create({
      data: {
        id: uuidv7(),
        accountId,
        displayName: dto.displayName,
        relationship: dto.relationship,
        gender: dto.gender ?? null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        timezone: dto.timezone ?? 'Asia/Shanghai',
        sortOrder: dto.sortOrder ?? 0,
        status: 'active',
      },
    });
  }

  /** 列表作用域：本人账号的成员 + 他人授权我照护的成员（隔离红线，禁止越界）。 */
  async listMembers(accountId: string) {
    const own = await this.prisma.member.findMany({
      where: { accountId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const authorized = await this.prisma.caregiverAuthorization.findMany({
      where: {
        caregiverAccountId: accountId,
        status: AuthorizationStatus.Active,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { member: true },
    });
    return {
      own: own.map((m) => this.toMemberView(m, 'owner')),
      authorized: authorized
        .filter((a) => a.member && !a.member.deletedAt)
        .map((a) => ({
          ...this.toMemberView(a.member, 'caregiver'),
          authorizationId: a.id,
          level: a.level,
        })),
    };
  }

  async getMember(memberId: string): Promise<Member> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, deletedAt: null },
    });
    if (!member) {
      throw new BusinessException(BusinessCode.NotFound, '成员不存在', HttpStatus.NOT_FOUND);
    }
    return member;
  }

  /** 更新：仅成员归属账号可改（照护人代配置走 plan 等业务线并双记，不在此口）。 */
  async updateMember(
    accountId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<Member> {
    const member = await this.getMember(memberId);
    if (member.accountId !== accountId) {
      throw new BusinessException(
        BusinessCode.MemberAccessDenied,
        '仅成员归属账号可修改成员资料',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.prisma.member.update({
      where: { id: memberId },
      data: {
        displayName: dto.displayName,
        relationship: dto.relationship,
        gender: dto.gender,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        timezone: dto.timezone,
        sortOrder: dto.sortOrder,
      },
    });
  }

  /** 删除：软删除（deleted_at + status=removed），仅归属账号；本人成员不可删。 */
  async deleteMember(accountId: string, memberId: string): Promise<{ deleted: boolean }> {
    const member = await this.getMember(memberId);
    if (member.accountId !== accountId) {
      throw new BusinessException(
        BusinessCode.MemberAccessDenied,
        '仅成员归属账号可删除成员',
        HttpStatus.FORBIDDEN,
      );
    }
    if (member.relationship === 'self') {
      throw new BusinessException(BusinessCode.Conflict, '本人成员不可删除', HttpStatus.CONFLICT);
    }
    await this.prisma.member.update({
      where: { id: memberId },
      data: { status: 'removed', deletedAt: new Date() },
    });
    await this.prefs.deleteCareSettings(memberId);
    return { deleted: true };
  }

  async getCareSettings(memberId: string): Promise<CareSettings> {
    await this.getMember(memberId);
    const stored = await this.prefs.getCareSettings(memberId);
    return this.toCareSettingsView(memberId, stored);
  }

  async putCareSettings(memberId: string, dto: CareSettingsDto): Promise<CareSettings> {
    await this.getMember(memberId);
    const stored = await this.prefs.getCareSettings(memberId);
    const preset = dto.cyclePreset ?? stored.cyclePreset;
    const presetValues = CYCLE_PRESETS[preset];
    const presetChanged =
      dto.cyclePreset !== undefined && dto.cyclePreset !== stored.cyclePreset;
    // 显式数值与目标预设的定版值相等 → 存 null（跟随预设）；不等 → 显式覆盖。
    // 未传数值时：换了预设则清掉旧覆盖跟随新预设，否则保留既有覆盖。
    const nextWindow =
      dto.cycleWindowMinutes !== undefined
        ? dto.cycleWindowMinutes === presetValues.windowMinutes
          ? null
          : dto.cycleWindowMinutes
        : presetChanged
          ? null
          : stored.cycleWindowMinutes;
    const nextInterval =
      dto.cycleIntervalMinutes !== undefined
        ? dto.cycleIntervalMinutes === presetValues.intervalMinutes
          ? null
          : dto.cycleIntervalMinutes
        : presetChanged
          ? null
          : stored.cycleIntervalMinutes;
    const next: StoredCareSettings = {
      careMode: dto.careMode ?? stored.careMode,
      lockScreenShowDrugDetail:
        dto.lockScreenShowDrugDetail ?? stored.lockScreenShowDrugDetail,
      strongAlertMode: dto.strongAlertMode ?? stored.strongAlertMode ?? 'none',
      cyclePreset: preset,
      cycleWindowMinutes: nextWindow,
      cycleIntervalMinutes: nextInterval,
    };
    await this.prefs.updateCareSettings(memberId, next);
    return this.toCareSettingsView(memberId, next);
  }

  private toCareSettingsView(
    memberId: string,
    stored: StoredCareSettings,
  ): CareSettings {
    const presetValues = CYCLE_PRESETS[stored.cyclePreset];
    return {
      memberId,
      careMode: stored.careMode,
      cyclePreset: stored.cyclePreset,
      cycleWindowMinutes: stored.cycleWindowMinutes ?? presetValues.windowMinutes,
      cycleIntervalMinutes:
        stored.cycleIntervalMinutes ?? presetValues.intervalMinutes,
      lockScreenShowDrugDetail: stored.lockScreenShowDrugDetail,
      strongAlertMode: stored.strongAlertMode ?? 'none',
    };
  }

  private toMemberView(member: Member, access: 'owner' | 'caregiver') {
    return {
      id: member.id,
      accountId: member.accountId,
      displayName: member.displayName,
      relationship: member.relationship,
      gender: member.gender,
      birthDate: member.birthDate,
      timezone: member.timezone,
      status: member.status,
      sortOrder: member.sortOrder,
      access,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    };
  }
}
