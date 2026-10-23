import { Module } from '@nestjs/common';
import { AdminAuthController, AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DrugSeedImportService } from './drug-seed-import.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { PhoneCryptoService } from '../auth/services/phone-crypto.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService, DrugSeedImportService, AdminAuthGuard, PhoneCryptoService],
  exports: [AdminService],
})
export class AdminModule {}
