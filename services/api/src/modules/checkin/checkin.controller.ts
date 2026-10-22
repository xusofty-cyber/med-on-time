import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CheckinService } from './checkin.service';

@ApiTags('checkin')
@Controller('checkins')
export class CheckinController {
  constructor(private readonly service: CheckinService) {}
}
