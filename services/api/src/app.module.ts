import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnv } from './config/validate-env';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AccountModule } from './modules/account/account.module';
import { AdherenceModule } from './modules/adherence/adherence.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { ContentModule } from './modules/content/content.module';
import { DrugModule } from './modules/drug/drug.module';
import { EhrModule } from './modules/ehr/ehr.module';
import { MemberModule } from './modules/member/member.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OpsModule } from './modules/ops/ops.module';
import { PlanModule } from './modules/plan/plan.module';
import { ReminderModule } from './modules/reminder/reminder.module';
import { StockModule } from './modules/stock/stock.module';

/**
 * 模块划分见 TECH_ARCHITECTURE §3.1（已冻结）。
 * 分层红线：模块间只经对方导出的 Service 协作，禁止循环依赖；
 * 涉及成员数据的接口必须挂 common/guards/member-access.guard（成员隔离硬规则）。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
    PrismaModule,
    RedisModule,
    AuthModule,
    AccountModule,
    MemberModule,
    AuthorizationModule,
    DrugModule,
    PlanModule,
    ReminderModule,
    CheckinModule,
    AdherenceModule,
    NotificationModule,
    EhrModule,
    StockModule,
    ContentModule,
    OpsModule,
    AdminModule,
    AiModule,
  ],
})
export class AppModule {}
