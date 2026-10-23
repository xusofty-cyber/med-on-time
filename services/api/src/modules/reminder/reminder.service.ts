import { HttpStatus, Injectable } from '@nestjs/common';
import type { ReminderInstance } from '@prisma/client';
import { ReminderInstanceStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { uuidv7 } from '../../common/utils/uuidv7';
import { NotificationPrefsService } from '../notification/notification-prefs.service';
import { AdherenceService } from '../adherence/adherence.service';
import { ReminderQueueService } from './reminder-queue.service';
import {
  assertAssistLevel,
  resolveMemberAccess,
  type MemberAccess,
} from './access.util';
import { dbDateToStr, dbTimeToStr, localDateOf, strToDbDate } from './tz.util';
import type { SkipDto, SnoozeDto } from './reminder.dto';

export interface ReminderInstanceView {
  id: string;
  memberId: string;
  planId: string;
  planItemId: string;
  drugId: string;
  drugNameSnapshot: string;
  doseAmount: string;
  doseUnit: string;
  scheduledAtUtc: Date;
  localDate: string;
  localTime: string;
  timezone: string;
  status: string;
  snoozeUntil: Date | null;
  snoozeCount: number;
  source: string;
  intake: {
    id: string;
    action: string;
    takenAt: Date | null;
    recordedAt: Date;
    isMakeup: boolean;
  } | null;
}

type InstanceWithIntake = ReminderInstance & {
  intakeRecord: {
    id: string;
    action: string;
    takenAt: Date | null;
    recordedAt: Date;
    isMakeup: boolean;
  } | null;
};

export function toInstanceView(inst: InstanceWithIntake): ReminderInstanceView {
  return {
    id: inst.id,
    memberId: inst.memberId,
    planId: inst.planId,
    planItemId: inst.planItemId,
    drugId: inst.drugId,
    drugNameSnapshot: inst.drugNameSnapshot,
    doseAmount: inst.doseAmount.toString(),
    doseUnit: inst.doseUnit,
    scheduledAtUtc: inst.scheduledAtUtc,
    localDate: dbDateToStr(inst.localDate),
    localTime: dbTimeToStr(inst.localTime),
    timezone: inst.timezone,
    status: inst.status,
    snoozeUntil: inst.snoozeUntil,
    snoozeCount: inst.snoozeCount,
    source: inst.source,
    intake: inst.intakeRecord
      ? {
          id: inst.intakeRecord.id,
          action: inst.intakeRecord.action,
          takenAt: inst.intakeRecord.takenAt,
          recordedAt: inst.intakeRecord.recordedAt,
          isMakeup: inst.intakeRecord.isMakeup,
        }
      : null,
  };
}

@Injectable()
export class ReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: NotificationPrefsService,
    private readonly adherence: AdherenceService,
    private readonly queue: ReminderQueueService,
  ) {}

  async listToday(
    accountId: string,
    memberId: string,
  ): Promise<{ date: string; timezone: string; items: ReminderInstanceView[] }> {
    const access = await resolveMemberAccess(this.prisma, accountId, memberId);
    const date = localDateOf(new Date(), access.member.timezone);
    return this.listByDate(accountId, memberId, date);
  }

  async listByDate(
    accountId: string,
    memberId: string,
    dateStr: string,
  ): Promise<{ date: string; timezone: string; items: ReminderInstanceView[] }> {
    const access = await resolveMemberAccess(this.prisma, accountId, memberId);
    const rows = await this.prisma.reminderInstance.findMany({
      where: {
        memberId,
        localDate: strToDbDate(dateStr),
        deletedAt: null,
      },
      include: {
        intakeRecord: {
          select: {
            id: true,
            action: true,
            takenAt: true,
            recordedAt: true,
            isMakeup: true,
          },
        },
      },
      orderBy: [{ localTime: 'asc' }, { drugNameSnapshot: 'asc' }],
    });
    return {
      date: dateStr,
      timezone: access.member.timezone,
      items: rows.map(toInstanceView),
    };
  }

  /**
   * 顺延（snooze）：按生效 cycle（计划覆盖优先于成员设置）顺延（默认一个 interval），新时刻不越窗末；
   * 状态置 snoozed 并重排投递任务（旧任务触发时见 snoozed 会自动改期，无需撤销）。
   */
  async snooze(
    accountId: string,
    instanceId: string,
    dto: SnoozeDto,
  ): Promise<ReminderInstanceView> {
    const { instance, access } = await this.loadInstanceForActor(accountId, instanceId);
    assertAssistLevel(access);
    const active: string[] = [
      ReminderInstanceStatus.Pending,
      ReminderInstanceStatus.Reminded,
      ReminderInstanceStatus.Snoozed,
    ];
    if (!active.includes(instance.status)) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `instance in status ${instance.status} cannot be snoozed`,
        HttpStatus.CONFLICT,
      );
    }
    const cycle = await this.prefs.getResolvedCycleForPlan(instance.memberId, instance.planId);
    const now = new Date();
    const windowEnd = instance.scheduledAtUtc.getTime() + cycle.windowMinutes * 60_000;
    if (now.getTime() >= windowEnd) {
      throw new BusinessException(
        BusinessCode.Conflict,
        'reminder window has closed',
        HttpStatus.CONFLICT,
      );
    }
    const minutes = dto.minutes ?? cycle.intervalMinutes;
    const snoozeUntil = new Date(
      Math.min(now.getTime() + minutes * 60_000, windowEnd),
    );
    const updated = await this.prisma.reminderInstance.update({
      where: { id: instance.id },
      data: {
        status: ReminderInstanceStatus.Snoozed,
        snoozeUntil,
        snoozeCount: { increment: 1 },
        version: { increment: 1 },
      },
      include: {
        intakeRecord: {
          select: { id: true, action: true, takenAt: true, recordedAt: true, isMakeup: true },
        },
      },
    });
    await this.queue.enqueueDelivery(
      {
        instanceId: instance.id,
        kind: 'deliver',
        plannedFor: snoozeUntil.toISOString(),
      },
      snoozeUntil,
    );
    return toInstanceView(updated);
  }

  /**
   * 跳过本次服药：写一条 action=skipped 的 intake_record（依从统计口径要求
   * missed 与 skipped 分开统计）并置实例 skipped；同 clientRequestId 重入
   * 或已跳过的实例重复调用均幂等返回既有记录。
   */
  async skip(
    accountId: string,
    instanceId: string,
    dto: SkipDto,
  ): Promise<{ instance: ReminderInstanceView; alreadyRecorded: boolean }> {
    const { instance, access } = await this.loadInstanceForActor(accountId, instanceId);
    assertAssistLevel(access);

    const existing = await this.prisma.medicationIntakeRecord.findFirst({
      where: { reminderInstanceId: instance.id, deletedAt: null },
    });
    if (existing) {
      if (existing.action === 'skipped') {
        const current = await this.getInstanceView(instance.id);
        return { instance: current, alreadyRecorded: true };
      }
      throw new BusinessException(
        BusinessCode.Conflict,
        'instance already has an intake record',
        HttpStatus.CONFLICT,
      );
    }
    const skippable: string[] = [
      ReminderInstanceStatus.Pending,
      ReminderInstanceStatus.Reminded,
      ReminderInstanceStatus.Snoozed,
    ];
    if (!skippable.includes(instance.status)) {
      throw new BusinessException(
        BusinessCode.Conflict,
        `instance in status ${instance.status} cannot be skipped`,
        HttpStatus.CONFLICT,
      );
    }

    const clientRequestId = dto.clientRequestId ?? `skip:${instance.id}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.medicationIntakeRecord.create({
        data: {
          id: uuidv7(),
          reminderInstanceId: instance.id,
          memberId: instance.memberId,
          planItemId: instance.planItemId,
          action: 'skipped',
          takenAt: null,
          recordedAt: new Date(),
          isMakeup: false,
          operatedByAccountId: accountId,
          skipReason: dto.reason ?? null,
          clientRequestId,
          confirmationMethod: 'tap',
        },
      });
      await tx.reminderInstance.update({
        where: { id: instance.id },
        data: {
          status: ReminderInstanceStatus.Skipped,
          version: { increment: 1 },
        },
      });
    });
    await this.adherence.recomputeDailyStats(instance.memberId, [
      dbDateToStr(instance.localDate),
    ]);
    const current = await this.getInstanceView(instance.id);
    return { instance: current, alreadyRecorded: false };
  }

  private async loadInstanceForActor(
    accountId: string,
    instanceId: string,
  ): Promise<{ instance: ReminderInstance; access: MemberAccess }> {
    const instance = await this.prisma.reminderInstance.findFirst({
      where: { id: instanceId, deletedAt: null },
    });
    if (!instance) {
      throw new BusinessException(
        BusinessCode.NotFound,
        'reminder instance not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const access = await resolveMemberAccess(this.prisma, accountId, instance.memberId);
    return { instance, access };
  }

  private async getInstanceView(instanceId: string): Promise<ReminderInstanceView> {
    const row = await this.prisma.reminderInstance.findFirstOrThrow({
      where: { id: instanceId },
      include: {
        intakeRecord: {
          select: { id: true, action: true, takenAt: true, recordedAt: true, isMakeup: true },
        },
      },
    });
    return toInstanceView(row);
  }
}
