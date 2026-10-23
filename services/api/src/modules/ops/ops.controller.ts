import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OpsService } from './ops.service';

/** 运维探针（无鉴权，供部署脚本/监控探活；不暴露任何业务数据）。 */
@ApiTags('ops')
@Controller('ops')
export class OpsController {
  constructor(private readonly service: OpsService) {}

  @Get('health')
  health() {
    return this.service.health();
  }

  @Get('ready')
  ready() {
    return this.service.ready();
  }

  @Get('metrics')
  metrics() {
    return this.service.metrics();
  }
}
