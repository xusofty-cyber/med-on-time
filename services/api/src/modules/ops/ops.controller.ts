import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OpsService } from './ops.service';

@ApiTags('ops')
@Controller('ops')
export class OpsController {
  constructor(private readonly service: OpsService) {}
}
