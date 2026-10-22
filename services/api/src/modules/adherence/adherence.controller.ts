import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdherenceService } from './adherence.service';

@ApiTags('adherence')
@Controller('adherence')
export class AdherenceController {
  constructor(private readonly service: AdherenceService) {}
}
