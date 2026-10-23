import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import {
  REMINDER_DELIVER_QUEUE,
  REMINDER_GENERATE_QUEUE,
  ReminderQueueService,
  type DeliverJobData,
  type GenerateJobData,
} from './reminder-queue.service';
import { ReminderGenerationService } from './reminder-generation.service';
import { ReminderDeliveryService } from './reminder-delivery.service';

/**
 * 提醒引擎装配：Worker 注册与生成器节拍（repeatable 每小时第 5 分钟；
 * 另在启动后补跑一次，覆盖进程停机期间错过的生成窗口）。
 * Redis 不可用时只记错不阻断 API 启动——实例数据在 DB 中完好，
 * 引擎恢复后靠节拍补生成（幂等）与 missed 扫描自愈。
 */
@Injectable()
export class ReminderEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderEngineService.name);
  private workers: Worker[] = [];

  constructor(
    private readonly queue: ReminderQueueService,
    private readonly generation: ReminderGenerationService,
    private readonly delivery: ReminderDeliveryService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const generateWorker = new Worker<GenerateJobData>(
        REMINDER_GENERATE_QUEUE,
        async () => {
          await this.generation.runTick();
        },
        { connection: this.queue.createConnection(), concurrency: 1 },
      );
      const deliverWorker = new Worker<DeliverJobData>(
        REMINDER_DELIVER_QUEUE,
        async (job) => {
          await this.delivery.handleJob(job.data);
        },
        { connection: this.queue.createConnection(), concurrency: 10 },
      );
      for (const worker of [generateWorker, deliverWorker]) {
        worker.on('failed', (job, err) => {
          this.logger.error(
            `job failed queue=${worker.name} job=${job?.id ?? '-'}: ${String(err)}`,
          );
        });
      }
      this.workers = [generateWorker, deliverWorker];

      await this.queue.generateQueue.add(
        'tick',
        { kind: 'tick' },
        { repeat: { pattern: '5 * * * *' }, removeOnComplete: 10, removeOnFail: 50 },
      );
      await this.queue.enqueueGenerationTick(5_000);
      this.logger.log('reminder engine started (generate tick hourly at :05)');
    } catch (err) {
      this.logger.error(
        `reminder engine failed to start (Redis unavailable?): ${String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.workers.map((w) => w.close()));
    this.workers = [];
  }
}
