import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationService } from './notification.service';

@ApiTags('notification')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}
}
