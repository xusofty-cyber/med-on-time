import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { AiModule } from '../ai/ai.module';
import { DrugController } from './drug.controller';
import { DrugService } from './drug.service';
import { DrugPhotoService } from './drug-photo.service';

@Module({
  imports: [AiModule],
  controllers: [DrugController],
  providers: [DrugService, DrugPhotoService, JwtAuthGuard, MemberAccessGuard],
  exports: [DrugService],
})
export class DrugModule {}
