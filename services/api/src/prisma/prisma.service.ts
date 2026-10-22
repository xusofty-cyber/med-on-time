import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 客户端封装。约定（DB 设计 V1.2 §2.2）：
 * - 业务表主键为 UUIDv7，由应用层生成（见 common/utils/uuidv7.ts），库内不设自增。
 * - 所有常规查询必须带 deleted_at IS NULL（软删除）；服务层通过各模块仓储方法收口，
 *   禁止绕过成员隔离守卫直接按 memberId 以外维度查询成员数据。
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
