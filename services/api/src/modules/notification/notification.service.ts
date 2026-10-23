import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { ReminderInstance } from '@prisma/client';
import { AuthorizationStatus, DeliveryChannel } from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { uuidv7 } from '../../common/utils/uuidv7';
import { NotificationPrefsService } from './notification-prefs.service';
import { ConfigService } from '@nestjs/config';
import { WechatMiniappService } from '../auth/services/wechat-miniapp.service';
import {
  InAppProvider,
  LogPushProvider,
  LogSmsProvider,
  WechatSubscribeProvider,
  type NotificationChannelProvider,
  type ReminderChannelContext,
} from './notification.providers';

/** 同一实例/收件人/渠道在该间隔内的重复投递记 suppressed_dedup（多端/重投递去重） */
const DEDUP_WINDOW_MS = 45_000;

export interface NotificationListItem {
  id: string;
  instanceId: string;
  memberId: string;
  channel: string;
  result: string;
  createdAt: Date;
  read: boolean;
  instance: {
    drugNameSnapshot: string;
    doseAmount: string;
    doseUnit: string;
    localDate: string;
    localTime: string;
    timezone: string;
    status: string;
  } | null;
}

export interface DispatchSummary {
  recipients: number;
  attempted: number;
  sent: number;
  suppressed: number;
}

function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeToStr(d: Date): string {
  return d.toISOString().slice(11, 16);
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly providers: Record<string, NotificationChannelProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: NotificationPrefsService,
    wechat: WechatMiniappService,
    config: ConfigService,
  ) {
    this.providers = {
      [DeliveryChannel.InApp]: new InAppProvider(),
      [DeliveryChannel.Sms]: new LogSmsProvider(),
      [DeliveryChannel.AppPush]: new LogPushProvider(),
      [DeliveryChannel.WechatSubscribe]: new WechatSubscribeProvider(
        prisma,
        wechat,
        config.get<string>('WECHAT_SUBSCRIBE_TEMPLATE_ID'),
        config.get<string>('WECHAT_SUBSCRIBE_MP_STATE') ?? 'formal',
      ),
    };
  }

  // ------------------------------------------------------------------
  // 站内通知（数据源 = reminder_delivery_log 中 channel=in_app 的行；
  // DB V1.2 无独立站内通知表，已读态走 NotificationPrefsService 的过渡存储）
  // ------------------------------------------------------------------

  async listForAccount(
    accountId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: NotificationListItem[];
    total: number;
    page: number;
    pageSize: number;
    unread: number;
  }> {
    const where = {
      recipientAccountId: accountId,
      channel: DeliveryChannel.InApp,
    } as const;
    const [total, rows, readIds] = await Promise.all([
      this.prisma.reminderDeliveryLog.count({ where }),
      this.prisma.reminderDeliveryLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          reminderInstance: {
            select: {
              drugNameSnapshot: true,
              doseAmount: true,
              doseUnit: true,
              localDate: true,
              localTime: true,
              timezone: true,
              status: true,
            },
          },
        },
      }),
      this.prefs.getReadIds(accountId),
    ]);
    const readSet = new Set(readIds);
    const readCount =
      readIds.length === 0
        ? 0
        : await this.prisma.reminderDeliveryLog.count({
            where: { ...where, id: { in: readIds } },
          });
    const items: NotificationListItem[] = rows.map((row) => ({
      id: row.id,
      instanceId: row.reminderInstanceId,
      memberId: row.memberId,
      channel: row.channel,
      result: row.result,
      createdAt: row.createdAt,
      read: readSet.has(row.id),
      instance: row.reminderInstance
        ? {
            drugNameSnapshot: row.reminderInstance.drugNameSnapshot,
            doseAmount: row.reminderInstance.doseAmount.toString(),
            doseUnit: row.reminderInstance.doseUnit,
            localDate: dateToStr(row.reminderInstance.localDate),
            localTime: timeToStr(row.reminderInstance.localTime),
            timezone: row.reminderInstance.timezone,
            status: row.reminderInstance.status,
          }
        : null,
    }));
    return { items, total, page, pageSize, unread: total - readCount };
  }

  async markRead(accountId: string, notificationId: string): Promise<void> {
    const row = await this.prisma.reminderDeliveryLog.findFirst({
      where: { id: notificationId, channel: DeliveryChannel.InApp },
      select: { id: true, recipientAccountId: true },
    });
    if (!row || row.recipientAccountId !== accountId) {
      throw new BusinessException(
        BusinessCode.NotFound,
        'notification not found',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.prefs.markRead(accountId, notificationId);
  }

  // ------------------------------------------------------------------
  // 提醒投递编排（供 reminder 投递器调用）：按收件人偏好逐渠道投递并逐条写投递日志
  // ------------------------------------------------------------------

  /** 收件人 = 成员所属账号 + 对该成员持有有效授权的照护人账号 */
  async resolveRecipients(
    memberId: string,
    ownerAccountId: string,
  ): Promise<string[]> {
    const authorizations = await this.prisma.caregiverAuthorization.findMany({
      where: {
        memberId,
        status: AuthorizationStatus.Active,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { caregiverAccountId: true },
    });
    const recipients = new Set<string>([ownerAccountId]);
    for (const auth of authorizations) recipients.add(auth.caregiverAccountId);
    return [...recipients];
  }

  async dispatchReminder(
    instance: ReminderInstance,
    member: { id: string; accountId: string },
  ): Promise<DispatchSummary> {
    const recipients = await this.resolveRecipients(member.id, member.accountId);
    const summary: DispatchSummary = {
      recipients: recipients.length,
      attempted: 0,
      sent: 0,
      suppressed: 0,
    };
    const baseCtx: ReminderChannelContext = {
      instanceId: instance.id,
      memberId: member.id,
      recipientAccountId: '',
      drugNameSnapshot: instance.drugNameSnapshot,
      doseText: `${instance.doseAmount.toString()}${instance.doseUnit}`,
      localTimeText: timeToStr(instance.localTime),
    };
    for (const recipientAccountId of recipients) {
      const prefs = await this.prefs.getNotificationPrefs(recipientAccountId);
      const ctx: ReminderChannelContext = { ...baseCtx, recipientAccountId };
      if (prefs.inApp) {
        await this.deliverChannel(instance, ctx, DeliveryChannel.InApp, summary);
      }
      // App 推送：命中该账号任一启用推送的设备即投递（一行日志标注设备）
      const device = await this.prisma.userDevice.findFirst({
        where: {
          accountId: recipientAccountId,
          pushEnabled: true,
          pushToken: { not: null },
          deletedAt: null,
        },
        select: { id: true },
        orderBy: { lastActiveAt: 'desc' },
      });
      if (device) {
        await this.deliverChannel(
          instance,
          { ...ctx, deviceId: device.id },
          DeliveryChannel.AppPush,
          summary,
        );
      }
      if (prefs.sms) {
        await this.deliverChannel(instance, ctx, DeliveryChannel.Sms, summary);
      }
      if (prefs.wechat) {
        await this.deliverChannel(
          instance,
          ctx,
          DeliveryChannel.WechatSubscribe,
          summary,
        );
      }
    }
    return summary;
  }

  private async deliverChannel(
    instance: ReminderInstance,
    ctx: ReminderChannelContext,
    channel: string,
    summary: DispatchSummary,
  ): Promise<void> {
    summary.attempted += 1;
    const provider = this.providers[channel];
    if (!provider) return;

    // 去重：短窗内已有成功投递则记 suppressed_dedup，不再真实下发
    const recent = await this.prisma.reminderDeliveryLog.findFirst({
      where: {
        reminderInstanceId: instance.id,
        recipientAccountId: ctx.recipientAccountId,
        channel,
        result: 'success',
        createdAt: { gt: new Date(Date.now() - DEDUP_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) {
      summary.suppressed += 1;
      await this.writeLog(instance, ctx, channel, {
        result: 'suppressed_dedup',
      });
      return;
    }

    let outcome: { result: string; providerMsgId?: string; errorCode?: string };
    try {
      outcome = await provider.send(ctx);
    } catch (err) {
      this.logger.error(
        `channel ${channel} send failed instance=${instance.id}: ${String(err)}`,
      );
      outcome = { result: 'failed', errorCode: 'PROVIDER_ERROR' };
    }
    if (outcome.result === 'success') summary.sent += 1;
    await this.writeLog(instance, ctx, channel, outcome);
  }

  private async writeLog(
    instance: ReminderInstance,
    ctx: ReminderChannelContext,
    channel: string,
    outcome: { result: string; providerMsgId?: string; errorCode?: string },
  ): Promise<void> {
    await this.prisma.reminderDeliveryLog.create({
      data: {
        id: uuidv7(),
        reminderInstanceId: instance.id,
        memberId: instance.memberId,
        recipientAccountId: ctx.recipientAccountId,
        channel,
        deviceId: ctx.deviceId ?? null,
        sentAt: outcome.result === 'success' ? new Date() : null,
        result: outcome.result,
        providerMsgId: outcome.providerMsgId ?? null,
        errorCode: outcome.errorCode ?? null,
      },
    });
  }
}
