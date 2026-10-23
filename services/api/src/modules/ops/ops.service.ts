import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../../common/exceptions/business.exception';

/**
 * 运维探针服务：存活（进程在即 ok）、就绪（DB 连通才算 ready，供部署脚本与负载均衡摘流）、
 * 基础运行指标（进程内存/运行时长 + 队列深度占位结构，BullMQ 接入后回填真实深度）。
 */
@Injectable()
export class OpsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      status: 'ready',
      db: 'up',
      timestamp: new Date().toISOString(),
    };
  }

  async metrics() {
    const memory = process.memoryUsage();
    const dbUp = await this.pingDb();
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
      // 队列深度占位：reminder 模块 BullMQ 接入后由其回填 waiting/active/delayed 计数
      queues: {
        reminder: { waiting: null, active: null, delayed: null, status: 'placeholder' },
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
