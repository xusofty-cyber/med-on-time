import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { CheckinService } from './checkin.service';
import { requireAccountId } from '../reminder/access.util';
import { CheckinDto, CheckinListQueryDto } from './checkin.dto';

@ApiTags('checkin')
@UseGuards(JwtAuthGuard)
@Controller()
export class CheckinController {
  constructor(private readonly service: CheckinService) {}

  /** 服药打卡：一实例仅一条有效记录，重复打卡幂等返回既有记录 */
  @Post('reminders/:instanceId/checkin')
  async checkin(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('instanceId') instanceId: string,
    @Body() dto: CheckinDto,
  ) {
    const accountId = requireAccountId(user);
    return this.service.checkin(accountId, instanceId, dto);
  }

  /** 成员打卡记录查询 */
  @Get('members/:memberId/checkins')
  @UseGuards(MemberAccessGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('memberId') memberId: string,
    @Query() query: CheckinListQueryDto,
  ) {
    const accountId = requireAccountId(user);
    return this.service.listCheckins(accountId, memberId, query);
  }
}
