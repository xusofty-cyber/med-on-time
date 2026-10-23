import { Module } from '@nestjs/common';
import { EhrController } from './ehr.controller';
import { EhrService } from './ehr.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';

@Module({
  controllers: [EhrController],
  providers: [EhrService, JwtAuthGuard, MemberAccessGuard],
  exports: [EhrService],
})
export class EhrModule {}
