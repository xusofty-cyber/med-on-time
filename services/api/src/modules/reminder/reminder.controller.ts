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
import { ReminderService } from './reminder.service';
import { requireAccountId } from './access.util';
import { DateQueryDto, SkipDto, SnoozeDto } from './reminder.dto';

@ApiTags('reminder')
@UseGuards(JwtAuthGuard)
@Controller()
export class ReminderController {
  constructor(private readonly service: ReminderService) {}

  /** 今日提醒（按成员本地时区的自然日） */
  @Get('members/:memberId/reminders/today')
  @UseGuards(MemberAccessGuard)
  async today(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('memberId') memberId: string,
  ) {
    const accountId = requireAccountId(user);
    return this.service.listToday(accountId, memberId);
  }

  /** 指定日期提醒（date=YYYY-MM-DD，成员本地日） */
  @Get('members/:memberId/reminders')
  @UseGuards(MemberAccessGuard)
  async byDate(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('memberId') memberId: string,
    @Query() query: DateQueryDto,
  ) {
    const accountId = requireAccountId(user);
    return this.service.listByDate(accountId, memberId, query.date);
  }

  /** 顺延：按 cycle 顺延并重排投递 */
  @Post('reminders/:instanceId/snooze')
  async snooze(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('instanceId') instanceId: string,
    @Body() dto: SnoozeDto,
  ) {
    const accountId = requireAccountId(user);
    return this.service.snooze(accountId, instanceId, dto);
  }

  /** 跳过本次服药 */
  @Post('reminders/:instanceId/skip')
  async skip(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('instanceId') instanceId: string,
    @Body() dto: SkipDto,
  ) {
    const accountId = requireAccountId(user);
    return this.service.skip(accountId, instanceId, dto);
  }
}
