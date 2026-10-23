import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { DrugController } from './drug.controller';
import { DrugService } from './drug.service';

@Module({
  controllers: [DrugController],
  providers: [DrugService, JwtAuthGuard, MemberAccessGuard],
  exports: [DrugService],
})
export class DrugModule {}
