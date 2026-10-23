import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';

@Module({
  controllers: [AiController],
  providers: [AiService, JwtAuthGuard, MemberAccessGuard],
  exports: [AiService],
})
export class AiModule {}
