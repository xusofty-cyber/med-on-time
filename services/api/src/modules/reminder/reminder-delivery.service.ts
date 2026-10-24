import { Injectable, Logger } from '@nestjs/common';
import type { ReminderInstance } from '@prisma/client';
import { ReminderInstanceStatus } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPrefsService } from '../notification/notification-prefs.service';
import { NotificationService } from '../notification/notification.service';
import { AdherenceService } from '../adherence/adherence.service';
import {
  ReminderQueueService,
  type DeliverJobData,
} from './reminder-queue.service';
import { dbDateToStr } from './tz.util';

const ACTIVE_STATUSES: string[] = [
  ReminderInstanceStatus.Pending,
  ReminderInstanceStatus.Reminded,
  ReminderInstanceStatus.Snoozed,
];

const TERMINAL_STATUSES: string[] = [
  ReminderInstanceStatus.Taken,
  ReminderInstanceStatus.Skipped,
  ReminderInstanceStatus.Missed,
  ReminderInstanceStatus.Cancelled,
];

/**
 * 提醒投递器（契约「提醒引擎」一节）：
 * 到点按收件人通知偏好投递（编排在 NotificationService），每次投递逐条写
 * reminder_delivery_log；未确认按成员 cycle 在窗口内每 interval 重复投递；
 * 到窗末仍未确认置 missed 并刷新依从日统计。任务重投递/乱序到达时以实例
 * 当前状态为准自我收敛（已打卡/已跳过的实例恒不再投递）。
 */
@Injectable()
export class ReminderDeliveryService {
  private readonly logger = new Logger(ReminderDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: NotificationPrefsService,
    private readonly notifications: NotificationService,
    private readonly adherence: AdherenceService,
    private readonly queue: ReminderQueueService,
  ) {}

  async handleJob(data: DeliverJobData): Promise<void> {
    const instance = await this.prisma.reminderInstance.findFirst({
      where: { id: data.instanceId, deletedAt: null },
    });
    if (!instance) return;
    if (TERMINAL_STATUSES.includes(instance.status)) return;

    const [member, plan, planItem] = await Promise.all([
      this.prisma.member.findFirst({
        where: { id: instance.memberId, deletedAt: null, status: 'active' },
        select: { id: true, accountId: true },
      }),
      this.prisma.medicationPlan.findFirst({
        where: { id: instance.planId, deletedAt: null, status: 'active' },
        select: { id: true },
      }),
      this.prisma.medicationPlanItem.findFirst({
        where: { id: instance.planItemId, deletedAt: null, status: 'active' },
        select: { id: true },
      }),
    ]);
    if (!member || !plan || !planItem) {
      await this.prisma.reminderInstance.updateMany({
        where: { id: instance.id, status: instance.status },
        data: {
          status: ReminderInstanceStatus.Cancelled,
          snoozeUntil: null,
          updatedAt: new Date(),
        },
      });
      return;
    }

    const now = new Date();
    const cycle = await this.prefs.getResolvedCycleForPlan(instance.memberId, instance.planId);
    const windowEnd = new Date(
      instance.scheduledAtUtc.getTime() + cycle.windowMinutes * 60_000,
    );

    if (data.kind === 'finalize') {
      await this.finalizeMissed(instance);
      return;
    }

    // 顺延中：未到 snoozeUntil 则改期再投（到窗末则转 finalize）
    if (
      instance.status === ReminderInstanceStatus.Snoozed &&
      instance.snoozeUntil &&
      instance.snoozeUntil.getTime() > now.getTime() + 1_000
    ) {
      if (instance.snoozeUntil.getTime() >= windowEnd.getTime()) {
        await this.queue.enqueueDelivery(
          { instanceId: instance.id, kind: 'finalize' },
          windowEnd,
        );
      } else {
        await this.queue.enqueueDelivery(
          {
            instanceId: instance.id,
            kind: 'deliver',
            plannedFor: instance.snoozeUntil.toISOString(),
          },
          instance.snoozeUntil,
        );
      }
      return;
    }

    if (now.getTime() >= windowEnd.getTime()) {
      await this.finalizeMissed(instance);
      return;
    }

    // 任务提前触发（时钟偏差/重复入队）：回到计划时刻再投
    if (now.getTime() < instance.scheduledAtUtc.getTime() - 60_000) {
      await this.queue.enqueueDelivery(
        {
          instanceId: instance.id,
          kind: 'deliver',
          plannedFor: instance.scheduledAtUtc.toISOString(),
        },
        instance.scheduledAtUtc,
      );
      return;
    }

    await this.notifications.dispatchReminder(instance, member);

    if (
      instance.status === ReminderInstanceStatus.Pending ||
      instance.status === ReminderInstanceStatus.Snoozed
    ) {
      await this.prisma.reminderInstance.updateMany({
        where: { id: instance.id, status: instance.status },
        data: {
          status: ReminderInstanceStatus.Reminded,
          version: { increment: 1 },
        },
      });
    }

    // 排下一次重复提醒；无下一次则排窗末 finalize
    const plannedFor = data.plannedFor
      ? new Date(data.plannedFor)
      : instance.scheduledAtUtc;
    let next = plannedFor.getTime() + cycle.intervalMinutes * 60_000;
    while (next <= now.getTime()) next += cycle.intervalMinutes * 60_000;
    if (next < windowEnd.getTime()) {
      await this.queue.enqueueDelivery(
        {
          instanceId: instance.id,
          kind: 'deliver',
          plannedFor: new Date(next).toISOString(),
        },
        new Date(next),
      );
    } else {
      await this.queue.enqueueDelivery(
        { instanceId: instance.id, kind: 'finalize' },
        windowEnd,
      );
    }
  }

  /** 窗末未确认置 missed（状态守卫保证并发/重入安全），并刷新依从日统计 */
  async finalizeMissed(instance: ReminderInstance): Promise<void> {
    const updated = await this.prisma.reminderInstance.updateMany({
      where: { id: instance.id, status: { in: ACTIVE_STATUSES } },
      data: {
        status: ReminderInstanceStatus.Missed,
        version: { increment: 1 },
      },
    });
    if (updated.count > 0) {
      this.logger.log(`instance marked missed id=${instance.id}`);
      await this.adherence.recomputeDailyStats(instance.memberId, [
        dbDateToStr(instance.localDate),
      ]);
    }
  }
}
