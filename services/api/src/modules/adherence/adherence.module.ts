import { Module } from '@nestjs/common';
import { AdherenceController } from './adherence.controller';
import { AdherenceService } from './adherence.service';

@Module({
  controllers: [AdherenceController],
  providers: [AdherenceService],
  exports: [AdherenceService],
})
export class AdherenceModule {}
