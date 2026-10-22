import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EhrService } from './ehr.service';

@ApiTags('ehr')
@Controller('ehr')
export class EhrController {
  constructor(private readonly service: EhrService) {}
}
