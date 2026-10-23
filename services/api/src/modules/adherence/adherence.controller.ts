import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { AdherenceService } from './adherence.service';
import { requireAccountId } from '../reminder/access.util';
import {
  AdherenceCalendarQueryDto,
  AdherenceSummaryQueryDto,
} from './adherence.dto';

@ApiTags('adherence')
@Controller('members/:memberId/adherence')
@UseGuards(JwtAuthGuard, MemberAccessGuard)
export class AdherenceController {
  constructor(private readonly service: AdherenceService) {}

  /** 依从汇总：应服/实服/按时率（range=week|month） */
  @Get('summary')
  async summary(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('memberId') memberId: string,
    @Query() query: AdherenceSummaryQueryDto,
  ) {
    const accountId = requireAccountId(user);
    return this.service.summary(accountId, memberId, query.range);
  }

  /** 依从月历：按月逐日状态 */
  @Get('calendar')
  async calendar(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('memberId') memberId: string,
    @Query() query: AdherenceCalendarQueryDto,
  ) {
    const accountId = requireAccountId(user);
    return this.service.calendar(accountId, memberId, query.month);
  }
}
