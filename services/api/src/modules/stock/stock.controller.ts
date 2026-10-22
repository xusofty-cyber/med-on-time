import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';

@ApiTags('stock')
@Controller('stocks')
export class StockController {
  constructor(private readonly service: StockService) {}
}
