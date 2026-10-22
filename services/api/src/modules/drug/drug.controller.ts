import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DrugService } from './drug.service';

@ApiTags('drug')
@Controller('drugs')
export class DrugController {
  constructor(private readonly service: DrugService) {}
}
