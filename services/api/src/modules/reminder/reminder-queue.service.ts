import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const REMINDER_GENERATE_QUEUE = 'medontime-reminder-generate';
export const REMINDER_DELIVER_QUEUE = 'medontime-reminder-deliver';

export interface GenerateJobData {
  kind: 'tick';
}

export interface DeliverJobData {
  instanceId: string;
  /** deliver = 一次提醒投递；finalize = 到窗末仍未确认则置 missed */
  kind: 'deliver' | 'finalize';
  /** 本次投递计划时刻（ISO）；重复提醒按 cycle interval 递推 */
  plannedFor?: string;
}

interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
}

/**
 * BullMQ 队列封装（工程内此前无 BullMQ 封装，本文件为唯一入口）：
 * - reminder-generate：生成器节拍（repeatable 每小时）+ 启动补跑；
 * - reminder-deliver：每实例到点投递的延迟任务 + 窗末 finalize 任务。
 * 投递任务以 instanceId+kind+时刻 组装 jobId 去重；入队失败只记日志不阻断
 * 业务请求——实例行是事实来源，生成器节拍与 missed 扫描会兜底重建/收尾。
 */
@Injectable()
export class ReminderQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ReminderQueueService.name);
  readonly generateQueue: Queue<GenerateJobData>;
  readonly deliverQueue: Queue<DeliverJobData>;
  private readonly connection: RedisConnectionOptions;

  constructor(config: ConfigService) {
    const url = config.get<string>('redis.url') ?? 'redis://localhost:6379';
    this.connection = parseRedisUrl(url);
    this.generateQueue = new Queue<GenerateJobData>(REMINDER_GENERATE_QUEUE, {
      connection: this.connection,
    });
    this.deliverQueue = new Queue<DeliverJobData>(REMINDER_DELIVER_QUEUE, {
      connection: this.connection,
    });
  }

  /** Worker 需要独立的阻塞连接，逐个新建连接配置（与队列连接同参数） */
  createConnection(): RedisConnectionOptions {
    return { ...this.connection };
  }

  async enqueueDelivery(data: DeliverJobData, at: Date): Promise<void> {
    try {
      const delay = Math.max(0, at.getTime() - Date.now());
      await this.deliverQueue.add('deliver', data, {
        jobId: `${data.instanceId}-${data.kind}-${at.getTime()}`,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    } catch (err) {
      this.logger.error(
        `enqueue delivery failed instance=${data.instanceId}: ${String(err)}`,
      );
    }
  }

  async enqueueGenerationTick(delayMs = 0): Promise<void> {
    try {
      await this.generateQueue.add(
        'tick',
        { kind: 'tick' },
        {
          delay: delayMs,
          jobId: `tick-${Date.now()}`,
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      );
    } catch (err) {
      this.logger.error(`enqueue generation tick failed: ${String(err)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.generateQueue.close(), this.deliverQueue.close()]);
  }
}

function parseRedisUrl(raw: string): RedisConnectionOptions {
  try {
    const u = new URL(raw);
    const db = u.pathname.replace('/', '');
    return {
      host: u.hostname || 'localhost',
      port: u.port ? parseInt(u.port, 10) : 6379,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: db ? parseInt(db, 10) : undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
}
