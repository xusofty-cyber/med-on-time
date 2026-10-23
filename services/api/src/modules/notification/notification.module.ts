import { Module } from '@nestjs/common';
import {
  NotificationController,
  NotificationPrefsController,
} from './notification.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationPrefsService } from './notification-prefs.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [NotificationController, NotificationPrefsController],
  providers: [NotificationService, NotificationPrefsService, JwtAuthGuard],
  exports: [NotificationService, NotificationPrefsService],
})
export class NotificationModule {}
