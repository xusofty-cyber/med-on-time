import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthorizationService } from './authorization.service';
import {
  CreateAuthorizationDto,
  ListAuthorizationsQueryDto,
  RevokeAuthorizationDto,
} from './dto/authorization.dto';

/**
 * 照护授权接口（契约：/authorizations*）。
 * 发起走 MemberAccessGuard（body.memberId 先过隔离）；接受/拒绝/撤销的角色校验在服务层。
 */
@ApiTags('authorization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('authorizations')
export class AuthorizationController {
  constructor(private readonly service: AuthorizationService) {}

  @UseGuards(MemberAccessGuard)
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAuthorizationDto,
  ) {
    return this.service.create(user.accountId, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAuthorizationsQueryDto,
  ) {
    return this.service.list(user.accountId, query);
  }

  @Post(':id/accept')
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.accept(user.accountId, id);
  }

  @Post(':id/reject')
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.reject(user.accountId, id);
  }

  @Post(':id/revoke')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RevokeAuthorizationDto,
  ) {
    return this.service.revoke(user.accountId, id, dto.reason);
  }
}
