import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { StockService } from './stock.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ListStockQueryDto } from './dto/list-stock.query';

/** 库存接口（契约 stock 组）：成员域路由，统一挂成员隔离守卫。 */
@ApiTags('stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class StockController {
  constructor(private readonly service: StockService) {}

  private requireUser(user?: AuthenticatedUser): AuthenticatedUser {
    if (!user) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        'missing authenticated user',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return user;
  }

  @Get('members/:memberId/stock')
  @UseGuards(MemberAccessGuard)
  list(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Query() query: ListStockQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.listStock(memberId, query, this.requireUser(user));
  }

  @Post('members/:memberId/stock/adjust')
  @UseGuards(MemberAccessGuard)
  adjust(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.adjustStock(memberId, dto, this.requireUser(user));
  }
}
