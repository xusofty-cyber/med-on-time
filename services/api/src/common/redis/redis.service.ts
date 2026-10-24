import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 客户端封装（P1：验证码 / refresh 会话 / 扫码票据从进程内存迁到 Redis）。
 * 复用既有 medontime-redis 容器（deploy/docker-compose.yml，REDIS_URL），
 * 与 BullMQ 共用同一实例、键前缀 medontime: 隔离（BullMQ 自有键前缀与之不冲突）。
 *
 * 连接为懒加载（lazyConnect）：构造时不连 Redis，首条命令才连接——单元测试
 * 与不走 Redis 的启动路径不会因此失败；连接失败时命令抛错（大声失败，
 * 不静默回退内存，否则“重启后验证码不丢失”的迁移目标会被悄悄破坏）。
 * 本地开发须有 Redis（deploy/.env.example 的 REDIS_URL 默认指向 compose 的 redis 服务）。
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  getClient(): Redis {
    if (!this.client) {
      const url = this.config.get<string>('redis.url') ?? 'redis://localhost:6379';
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });
      this.client.on('error', (err) => {
        this.logger.warn(`Redis 连接异常: ${err.message}`);
      });
    }
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}
