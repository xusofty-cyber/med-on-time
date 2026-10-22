import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContentService } from './content.service';

@ApiTags('content')
@Controller('contents')
export class ContentController {
  constructor(private readonly service: ContentService) {}
}
