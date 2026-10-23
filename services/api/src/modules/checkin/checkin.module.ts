import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { AdherenceModule } from '../adherence/adherence.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';

@Module({
  imports: [NotificationModule, AdherenceModule],
  controllers: [CheckinController],
  providers: [CheckinService, JwtAuthGuard, MemberAccessGuard],
  exports: [CheckinService],
})
export class CheckinModule {}
