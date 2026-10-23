import { Module } from '@nestjs/common';
import { AdminAuthController, AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DrugSeedImportService } from './drug-seed-import.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Module({
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService, DrugSeedImportService, AdminAuthGuard],
  exports: [AdminService],
})
export class AdminModule {}
