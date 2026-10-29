import { Module } from '@nestjs/common';
import { AdminAuthController, AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DrugSeedImportService } from './drug-seed-import.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { PhoneCryptoService } from '../auth/services/phone-crypto.service';
import { LoginThrottleService } from '../auth/services/login-throttle.service';
import { AiModule } from '../ai/ai.module';
import { WechatOaModule } from '../wechat-oa/wechat-oa.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AiModule, WechatOaModule, AuthModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService, DrugSeedImportService, AdminAuthGuard, PhoneCryptoService, LoginThrottleService],
  exports: [AdminService],
})
export class AdminModule {}
