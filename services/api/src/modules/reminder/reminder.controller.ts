import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReminderService } from './reminder.service';

@ApiTags('reminder')
@Controller('reminders')
export class ReminderController {
  constructor(private readonly service: ReminderService) {}
}
