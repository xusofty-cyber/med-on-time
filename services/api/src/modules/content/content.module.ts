import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { AdminContentController } from './admin-content.controller';
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Module({
  controllers: [ContentController, AdminContentController],
  providers: [ContentService, JwtAuthGuard, AdminAuthGuard],
  exports: [ContentService],
})
export class ContentModule {}
