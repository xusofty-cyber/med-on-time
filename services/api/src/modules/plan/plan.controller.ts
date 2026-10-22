import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlanService } from './plan.service';

@ApiTags('plan')
@Controller('plans')
export class PlanController {
  constructor(private readonly service: PlanService) {}
}
