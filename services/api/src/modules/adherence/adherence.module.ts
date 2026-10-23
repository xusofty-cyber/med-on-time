import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { AdherenceController } from './adherence.controller';
import { AdherenceService } from './adherence.service';

@Module({
  imports: [NotificationModule],
  controllers: [AdherenceController],
  providers: [AdherenceService, JwtAuthGuard, MemberAccessGuard],
  exports: [AdherenceService],
})
export class AdherenceModule {}
