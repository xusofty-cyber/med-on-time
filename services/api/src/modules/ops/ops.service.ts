import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReminderQueueService } from '../reminder/reminder-queue.service';
import { BusinessException } from '../../common/exceptions/business.exception';

/**
 * 运维探针服务：存活（进程在即 ok）、就绪（DB 与 Redis 连通才算 ready，供部署脚本与负载均衡摘流）、
 * 基础运行指标（进程内存/运行时长 + 队列真实深度）。
 */
@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reminderQueue: ReminderQueueService,
  ) {}

  health() {
    return {
      status: 'ok',
      uptimeSec: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const dbUp = await this.pingDb();
    if (!dbUp) {
      // 就绪探针专用业务码（503 段，通用码表未预置）
      throw new BusinessException(50300, 'database not reachable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const redisUp = await this.reminderQueue.pingRedis();
    if (!redisUp) {
      throw new BusinessException(50301, 'redis not reachable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: 'ready',
      db: 'up',
      redis: 'up',
      timestamp: new Date().toISOString(),
    };
  }

  async metrics() {
    const memory = process.memoryUsage();
    const dbUp = await this.pingDb();
    const redisUp = await this.reminderQueue.pingRedis();

    let deliverCounts = { waiting: 0, active: 0, delayed: 0, failed: 0 };
    let generateCounts = { waiting: 0, active: 0, delayed: 0, failed: 0 };
    try {
      const [dCounts, gCounts] = await Promise.all([
        this.reminderQueue.deliverQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
        this.reminderQueue.generateQueue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      ]);
      deliverCounts = {
        waiting: dCounts['waiting'] ?? 0,
        active: dCounts['active'] ?? 0,
        delayed: dCounts['delayed'] ?? 0,
        failed: dCounts['failed'] ?? 0,
      };
      generateCounts = {
        waiting: gCounts['waiting'] ?? 0,
        active: gCounts['active'] ?? 0,
        delayed: gCounts['delayed'] ?? 0,
        failed: gCounts['failed'] ?? 0,
      };
    } catch {
      // ignore Redis read errors
    }

    return {
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        uptimeSec: Math.floor(process.uptime()),
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          externalBytes: memory.external,
        },
      },
      database: { connected: dbUp },
      redis: { connected: redisUp },
      queues: {
        reminder: {
          waiting: deliverCounts.waiting,
          active: deliverCounts.active,
          delayed: deliverCounts.delayed,
          failed: deliverCounts.failed,
          status: redisUp ? 'active' : 'unreachable',
        },
        generate: {
          waiting: generateCounts.waiting,
          active: generateCounts.active,
          delayed: generateCounts.delayed,
          failed: generateCounts.failed,
          status: redisUp ? 'active' : 'unreachable',
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async pingDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
