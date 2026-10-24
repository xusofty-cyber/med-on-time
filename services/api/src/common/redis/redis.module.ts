import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * 全局 Redis 模块：各业务模块无需 import 即可注入 RedisService
 *（JwtAuthGuard 在十余模块内各自提供，需全局可见；业务存储亦然）。
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
