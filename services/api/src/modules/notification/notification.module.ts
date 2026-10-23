import { Module } from '@nestjs/common';
import {
  NotificationController,
  NotificationPrefsController,
} from './notification.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationPrefsService } from './notification-prefs.service';

@Module({
  controllers: [NotificationController, NotificationPrefsController],
  providers: [NotificationService, NotificationPrefsService, JwtAuthGuard],
  exports: [NotificationService, NotificationPrefsService],
})
export class NotificationModule {}
