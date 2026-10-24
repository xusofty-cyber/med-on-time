import { HttpStatus, Injectable } from '@nestjs/common';
import { AccountStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/services/session.service';
import type { CancelAccountDto, UpdateProfileDto } from './dto/account.dto';

/** 注销冷静期（需求定版口径：30 天） */
export const CANCEL_COOLING_DAYS = 30;

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
  ) {}

  async getProfile(accountId: string) {
    const account = await this.prisma.userAccount.findFirst({
      where: { id: accountId, deletedAt: null },
    });
    if (!account) {
      throw new BusinessException(BusinessCode.NotFound, '账号不存在', HttpStatus.NOT_FOUND);
    }
    return this.authService.buildAccountView(account);
  }

  async updateProfile(accountId: string, dto: UpdateProfileDto) {
    if (dto.timezone !== undefined) {
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: dto.timezone });
      } catch {
        throw new BusinessException(
          BusinessCode.BadRequest,
          '非法的时区标识（须为合法 IANA 时区，如 Asia/Shanghai）',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    if (dto.avatarFileId !== undefined && dto.avatarFileId !== null) {
      const attachment = await this.prisma.fileAttachment.findFirst({
        where: {
          id: dto.avatarFileId,
          ownerAccountId: accountId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!attachment) {
        throw new BusinessException(
          BusinessCode.BadRequest,
          '头像附件不存在或不属于当前账号',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const account = await this.prisma.userAccount.update({
      where: { id: accountId },
      data: {
        nickname: dto.nickname,
        avatarFileId: dto.avatarFileId,
        timezone: dto.timezone,
      },
    });
    return this.authService.buildAccountView(account);
  }

  /**
   * 注销申请：状态 active → cancelling，记录申请时间与原因；
   * 冷静期 30 天内可撤销（withdraw），期满由 ops 定时任务执行终局注销
   * （cancelled + 可识别信息物理删除 + 健康明细不可逆匿名化，见需求定版口径）。
   * 申请即吊销全部会话。
   */
  async applyCancel(accountId: string, dto: CancelAccountDto) {
    const account = await this.prisma.userAccount.findFirst({
      where: { id: accountId, deletedAt: null },
    });
    if (!account) {
      throw new BusinessException(BusinessCode.NotFound, '账号不存在', HttpStatus.NOT_FOUND);
    }
    if (account.status === AccountStatus.Cancelling) {
      throw new BusinessException(BusinessCode.Conflict, '注销申请已在冷静期中', HttpStatus.CONFLICT);
    }
    if (account.status !== AccountStatus.Active) {
      throw new BusinessException(BusinessCode.Conflict, `账号状态 ${account.status} 不可申请注销`);
    }
    const now = new Date();
    const effectiveAt = new Date(now.getTime() + CANCEL_COOLING_DAYS * 24 * 3600 * 1000);
    await this.prisma.userAccount.update({
      where: { id: accountId },
      data: {
        status: AccountStatus.Cancelling,
        cancelApplyAt: now,
        cancelReason: dto.reason ?? null,
      },
    });
    await this.sessions.revokeAllSessions(accountId);
    return {
      status: AccountStatus.Cancelling,
      cancelApplyAt: now,
      effectiveAt,
      coolingDays: CANCEL_COOLING_DAYS,
    };
  }

  /** 冷静期内撤销注销：cancelling → active，清注销字段。 */
  async withdrawCancel(accountId: string) {
    const account = await this.prisma.userAccount.findFirst({
      where: { id: accountId, deletedAt: null },
    });
    if (!account || account.status !== AccountStatus.Cancelling) {
      throw new BusinessException(BusinessCode.Conflict, '当前不在注销冷静期，无可撤销的申请');
    }
    await this.prisma.userAccount.update({
      where: { id: accountId },
      data: {
        status: AccountStatus.Active,
        cancelApplyAt: null,
        cancelReason: null,
        cancelledAt: null,
      },
    });
    return { status: AccountStatus.Active };
  }

  async listSessions(accountId: string) {
    const sessions = await this.sessions.listActiveSessions(accountId);
    return {
      items: sessions.map((s) => ({
        id: s.id,
        platform: s.platform ?? null,
        deviceName: s.deviceName ?? null,
        ipAddress: s.ipAddress ?? null,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
      total: sessions.length,
    };
  }

  /** 踢出指定会话（只能操作本人会话）。 */
  async revokeSession(accountId: string, sessionId: string) {
    const sessions = await this.sessions.listActiveSessions(accountId);
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) {
      throw new BusinessException(BusinessCode.NotFound, '会话不存在或已失效', HttpStatus.NOT_FOUND);
    }
    await this.sessions.revokeSession(sessionId);
    return { revoked: true };
  }
}
