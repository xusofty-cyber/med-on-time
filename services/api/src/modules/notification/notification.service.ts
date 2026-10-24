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
  TencentSmsReminderProvider,
  WechatSubscribeProvider,
  type NotificationChannelProvider,
  type ReminderChannelContext,
} from './notification.providers';
import { PhoneCryptoService } from '../auth/services/phone-crypto.service';
import { TencentSmsGateway } from '../auth/services/tencent-sms.service';

/** 同一实例/收件人/渠道在该间隔内的重复投递记 suppressed_dedup（多端/重投递去重） */
const DEDUP_WINDOW_MS = 45_000;

export interface NotificationListItem {
  id: string;
  instanceId: string;
  memberId: string;
  channel: string;
  result: string;
  createdAt: Date;
  /** 兼容旧字段：与 isRead 同义 */
  read: boolean;
  /** 各端 NotificationItem 期望字段（Web/小程序/iOS 共用，见契约测试） */
  title: string;
  content: string;
  isRead: boolean;
  /** 已读时间戳：当前无通知表、已读态只存 id 集合（system_config 过渡存储），故恒为 null；DB V1.3 补通知表后回填 */
  readAt: string | null;
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

/** 提醒实例状态 → 列表文案（与各端展示口径一致；未知状态原样透出） */
const INSTANCE_STATUS_TEXT: Record<string, string> = {
  pending: '待服药',
  reminded: '已提醒',
  taken: '已服药',
  snoozed: '已稍后提醒',
  skipped: '已跳过',
  missed: '已错过',
  cancelled: '已取消',
};

/** 投递结果 → 列表文案 */
const DELIVERY_RESULT_TEXT: Record<string, string> = {
  success: '已送达',
  failed: '发送失败',
  suppressed_dedup: '去重跳过',
};

/** 由实例快照合成前端 NotificationItem 期望的 title/content */
export function buildNotificationText(
  instance: NotificationListItem['instance'],
  result: string,
): { title: string; content: string } {
  if (!instance) {
    return {
      title: '服药提醒',
      content: `站内通知·投递${DELIVERY_RESULT_TEXT[result] ?? result}`,
    };
  }
  const title = `${instance.drugNameSnapshot} ${instance.doseAmount}${instance.doseUnit}`;
  const statusText = INSTANCE_STATUS_TEXT[instance.status] ?? instance.status;
  const resultText = DELIVERY_RESULT_TEXT[result] ?? result;
  return {
    title,
    content: `${instance.localDate} ${instance.localTime}（${instance.timezone}）·${statusText}·站内通知${resultText}`,
  };
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
      // 提醒短信走腾讯云网关（未配置时诚实返回 failed，不再记 success）
      [DeliveryChannel.Sms]: new TencentSmsReminderProvider(
        prisma,
        new PhoneCryptoService(config),
        config,
        new TencentSmsGateway(config),
      ),
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

  /**
   * 站内通知列表。
   * 默认只返回 result='success' 的行（排除 failed / suppressed_dedup 等）：
   * 失败行是投递系统的运维留痕、不是发给用户的通知——失败提醒本身已有站内
   * 渠道兜底（in_app 投递失败时用户仍能在下一成功行看到提醒），把失败行混
   * 进收件箱会让用户看到“发送失败”的脏通知、且未读数失真；运维排障直接查
   * reminder_delivery_log 全量，不过滤口径只存在于日志层。
   */
  async listForAccount(
    accountId: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: NotificationListItem[];
    total: number;
    page: number;
    pageSize: number;
    /** 兼容旧字段：与 unreadCount 同值 */
    unread: number;
    unreadCount: number;
    /** 小程序端 PageResult 字段名（res.unreadTotal），与 unreadCount 同值 */
    unreadTotal: number;
  }> {
    const where = {
      recipientAccountId: accountId,
      channel: DeliveryChannel.InApp,
      result: 'success',
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
    const items: NotificationListItem[] = rows.map((row) => {
      const instance = row.reminderInstance
        ? {
            drugNameSnapshot: row.reminderInstance.drugNameSnapshot,
            doseAmount: row.reminderInstance.doseAmount.toString(),
            doseUnit: row.reminderInstance.doseUnit,
            localDate: dateToStr(row.reminderInstance.localDate),
            localTime: timeToStr(row.reminderInstance.localTime),
            timezone: row.reminderInstance.timezone,
            status: row.reminderInstance.status,
          }
        : null;
      const isRead = readSet.has(row.id);
      const { title, content } = buildNotificationText(instance, row.result);
      return {
        id: row.id,
        instanceId: row.reminderInstanceId,
        memberId: row.memberId,
        channel: row.channel,
        result: row.result,
        createdAt: row.createdAt,
        read: isRead,
        title,
        content,
        isRead,
        // 无通知表：已读时间无处可存，恒 null（前端以 isRead 为准，见契约测试）
        readAt: null,
        instance,
      };
    });
    const unreadCount = total - readCount;
    return {
      items,
      total,
      page,
      pageSize,
      unread: unreadCount,
      unreadCount,
      unreadTotal: unreadCount,
    };
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
