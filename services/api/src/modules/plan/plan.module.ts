import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { DrugModule } from '../drug/drug.module';
import { NotificationModule } from '../notification/notification.module';
import { ReminderModule } from '../reminder/reminder.module';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';

@Module({
  imports: [DrugModule, NotificationModule, ReminderModule],
  controllers: [PlanController],
  providers: [PlanService, JwtAuthGuard, MemberAccessGuard],
  exports: [PlanService],
})
export class PlanModule {}
