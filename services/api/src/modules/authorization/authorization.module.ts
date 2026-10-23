import { Module } from '@nestjs/common';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationService } from './authorization.service';

@Module({
  imports: [AuthModule],
  controllers: [AuthorizationController],
  providers: [AuthorizationService, MemberAccessGuard],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
