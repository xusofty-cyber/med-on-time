import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import {
  AccountLifecycleEngineService,
  AccountLifecycleService,
} from './account-lifecycle.service';

@Module({
  imports: [AuthModule],
  controllers: [AccountController],
  providers: [AccountService, AccountLifecycleService, AccountLifecycleEngineService],
  exports: [AccountService],
})
export class AccountModule {}
