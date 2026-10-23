import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AdherenceModule } from '../adherence/adherence.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { ReminderController } from './reminder.controller';
import { ReminderService } from './reminder.service';
import { ReminderQueueService } from './reminder-queue.service';
import { ReminderGenerationService } from './reminder-generation.service';
import { ReminderDeliveryService } from './reminder-delivery.service';
import { ReminderEngineService } from './reminder-engine.service';

@Module({
  imports: [NotificationModule, AdherenceModule],
  controllers: [ReminderController],
  providers: [
    ReminderService,
    ReminderQueueService,
    ReminderGenerationService,
    ReminderDeliveryService,
    ReminderEngineService,
    JwtAuthGuard,
    MemberAccessGuard,
  ],
  exports: [ReminderService, ReminderGenerationService],
})
export class ReminderModule {}
