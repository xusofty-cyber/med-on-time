import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import {
  AccountStatus,
  AuthorizationStatus,
  PlanStatus,
  ReminderInstanceStatus,
} from '@med-on-time/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import { SessionService } from '../auth/services/session.service';
import { parseRedisUrl } from '../reminder/reminder-queue.service';
import { CANCEL_COOLING_DAYS } from './account.service';

export const ACCOUNT_LIFECYCLE_QUEUE = 'medontime-account-lifecycle';
/** 审计日志中系统主体的占位 UUID（audit_log.actor_id 无 FK，系统动作用全零） */
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';
const BATCH_LIMIT = 100;

/**
 * 注销终局处理（2026-10-30 全项目审查 H-2 定版，兑现需求定版口径）：
 * 冷静期（30 天）届满的 cancelling 账号 → cancelled，并在一个事务内：
 * - 账号行墓碑化：phone/email 密文与哈希、密码、昵称、头像等可识别信息物理清除；
 * - 成员匿名化存档：displayName/真实姓名/生日/性别/头像抹除、状态 removed，
 *   服药记录与依从统计仅以匿名成员维度保留（不可逆，无法再关联到个人）；
 * - 可识别健康明细物理删除：病历正文、病史、紧急联系人（含第三方电话）；
 * - 计划停止、待发提醒实例取消、照护授权双向撤销、微信绑定解绑留痕、
 *   设备行（含推送令牌）删除；事务后吊销全部会话；
 * - audit_log 落一条 system 记录，detail 只含计数、不含任何个人信息。
 * 事务内复核状态与期限，与 withdrawCancel 并发时以先完成者为准（后到者跳过）。
 */
@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async runDueCancellations(now = new Date()): Promise<{ processed: number }> {
    const deadline = new Date(now.getTime() - CANCEL_COOLING_DAYS * 24 * 3600 * 1000);
    const due = await this.prisma.userAccount.findMany({
      where: {
        status: AccountStatus.Cancelling,
        cancelApplyAt: { lte: deadline },
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { cancelApplyAt: 'asc' },
      take: BATCH_LIMIT,
    });
    let processed = 0;
    for (const { id } of due) {
      try {
        if (await this.finalizeAccount(id, now)) processed += 1;
      } catch (err) {
        // 单账号失败不阻断整批：记录后继续，下一轮节拍会重试该账号。
        this.logger.error(`finalize cancelled account ${id} failed: ${String(err)}`);
      }
    }
    if (processed > 0) {
      this.logger.log(`account cancellations finalized: ${processed}`);
    }
    return { processed };
  }

  private async finalizeAccount(accountId: string, now: Date): Promise<boolean> {
    const deadline = now.getTime() - CANCEL_COOLING_DAYS * 24 * 3600 * 1000;
    const done = await this.prisma.$transaction(async (tx) => {
      const account = await tx.userAccount.findFirst({
        where: { id: accountId, deletedAt: null },
      });
      if (
        !account ||
        account.status !== AccountStatus.Cancelling ||
        !account.cancelApplyAt ||
        account.cancelApplyAt.getTime() > deadline
      ) {
        return null;
      }
      const members = await tx.member.findMany({
        where: { accountId, deletedAt: null },
        select: { id: true },
      });
      const memberIds = members.map((m) => m.id);
      let plansStopped = 0;
      let instancesCancelled = 0;
      if (memberIds.length > 0) {
        const plans = await tx.medicationPlan.findMany({
          where: { memberId: { in: memberIds }, deletedAt: null },
          select: { id: true },
        });
        const planIds = plans.map((p) => p.id);
        if (planIds.length > 0) {
          const stopped = await tx.medicationPlan.updateMany({
            where: {
              id: { in: planIds },
              status: { in: [PlanStatus.Active, PlanStatus.Paused] },
            },
            data: { status: PlanStatus.Stopped },
          });
          plansStopped = stopped.count;
          const cancelled = await tx.reminderInstance.updateMany({
            where: {
              planId: { in: planIds },
              status: {
                in: [
                  ReminderInstanceStatus.Pending,
                  ReminderInstanceStatus.Reminded,
                  ReminderInstanceStatus.Snoozed,
                ],
              },
              deletedAt: null,
            },
            data: { status: ReminderInstanceStatus.Cancelled },
          });
          instancesCancelled = cancelled.count;
        }
        await tx.caregiverAuthorization.updateMany({
          where: {
            memberId: { in: memberIds },
            status: AuthorizationStatus.Active,
            deletedAt: null,
          },
          data: { status: AuthorizationStatus.Revoked },
        });
        await tx.caregiverAuthorization.updateMany({
          where: {
            caregiverAccountId: accountId,
            status: AuthorizationStatus.Active,
            deletedAt: null,
          },
          data: { status: AuthorizationStatus.Revoked },
        });
        // 可识别健康明细物理删除（病历正文/病史/紧急联系人）。
        await tx.memberMedicalRecord.deleteMany({
          where: { memberId: { in: memberIds } },
        });
        await tx.memberMedicalHistory.deleteMany({
          where: { memberId: { in: memberIds } },
        });
        await tx.emergencyContact.deleteMany({
          where: { memberId: { in: memberIds } },
        });
        // 成员匿名化：保留行供匿名统计，抹除一切直接标识。
        await tx.member.updateMany({
          where: { id: { in: memberIds } },
          data: {
            displayName: '已注销成员',
            realNameEnc: null,
            birthDate: null,
            gender: null,
            avatarFileId: null,
            status: 'removed',
            deletedAt: now,
          },
        });
      }
      await tx.userOauthBinding.updateMany({
        where: { accountId, unboundAt: null },
        data: { unboundAt: now },
      });
      await tx.userDevice.deleteMany({ where: { accountId } });
      await tx.userAccount.update({
        where: { id: accountId },
        data: {
          status: AccountStatus.Cancelled,
          cancelledAt: now,
          phone: null,
          phoneHash: null,
          phoneVerifiedAt: null,
          email: null,
          emailHash: null,
          emailVerifiedAt: null,
          passwordHash: null,
          nickname: '已注销用户',
          avatarFileId: null,
          cancelReason: null,
          deletedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          id: uuidv7(),
          actorType: 'system',
          actorId: SYSTEM_ACTOR_ID,
          action: 'account:cancel:finalize',
          targetType: 'user_account',
          targetId: accountId,
          detail: {
            membersAnonymized: memberIds.length,
            plansStopped,
            instancesCancelled,
          },
          result: 'success',
        },
      });
      return true;
    });
    if (!done) return false;
    await this.sessions.revokeAllSessions(accountId).catch((err) => {
      this.logger.warn(
        `revoke sessions for cancelled account ${accountId} failed: ${String(err)}`,
      );
    });
    return true;
  }
}

/**
 * 注销终局引擎装配：BullMQ repeatable 每日 03:30 扫描 + 启动后补跑一次，
 * 模式与 ReminderEngineService 一致；Redis 不可用只记错不阻断 API 启动。
 */
@Injectable()
export class AccountLifecycleEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountLifecycleEngineService.name);
  private worker: Worker | null = null;
  private queue: Queue | null = null;

  constructor(
    private readonly lifecycle: AccountLifecycleService,
    config: ConfigService,
  ) {
    const url = config.get<string>('redis.url') ?? 'redis://localhost:6379';
    this.queue = new Queue(ACCOUNT_LIFECYCLE_QUEUE, {
      connection: parseRedisUrl(url),
    });
    this.connectionUrl = url;
  }

  private readonly connectionUrl: string;

  async onModuleInit(): Promise<void> {
    try {
      this.worker = new Worker(
        ACCOUNT_LIFECYCLE_QUEUE,
        async () => {
          await this.lifecycle.runDueCancellations();
        },
        {
          connection: parseRedisUrl(this.connectionUrl),
          concurrency: 1,
        },
      );
      this.worker.on('failed', (job, err) => {
        this.logger.error(
          `lifecycle job failed job=${job?.id ?? '-'}: ${String(err)}`,
        );
      });
      await this.queue?.add(
        'scan',
        {},
        { repeat: { pattern: '30 3 * * *' }, removeOnComplete: 10, removeOnFail: 50 },
      );
      await this.queue?.add('scan', {}, { delay: 60_000, removeOnComplete: 10 });
      this.logger.log('account lifecycle engine started (daily scan at 03:30)');
    } catch (err) {
      this.logger.error(
        `account lifecycle engine failed to start (Redis unavailable?): ${String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    this.worker = null;
    this.queue = null;
  }
}
