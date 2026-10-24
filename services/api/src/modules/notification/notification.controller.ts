import {
  Controller,
  Get,
  UseGuards,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { NotificationPrefsService } from './notification-prefs.service';
import {
  PaginationQueryDto,
  UpdateNotificationPrefsDto,
} from './notification.dto';

function requireAccountId(user: AuthenticatedUser | undefined): string {
  if (!user?.accountId) {
    throw new BusinessException(
      BusinessCode.Unauthorized,
      'missing authenticated user',
      HttpStatus.UNAUTHORIZED,
    );
  }
  return user.accountId;
}

@ApiTags('notification')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  /** 站内通知列表（数据源为 in_app 投递日志行） */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() query: PaginationQueryDto,
  ) {
    const accountId = requireAccountId(user);
    return this.service.listForAccount(accountId, query.page, query.pageSize);
  }

  @Post(':id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const accountId = requireAccountId(user);
    await this.service.markRead(accountId, id);
    return { read: true };
  }
}

@ApiTags('notification')
@UseGuards(JwtAuthGuard)
@Controller('notification-prefs')
export class NotificationPrefsController {
  constructor(private readonly prefs: NotificationPrefsService) {}

  @Get()
  async get(@CurrentUser() user: AuthenticatedUser | undefined) {
    const accountId = requireAccountId(user);
    return this.prefs.getNotificationPrefs(accountId);
  }

  @Put()
  async update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpdateNotificationPrefsDto,
  ) {
    const accountId = requireAccountId(user);
    return this.prefs.updateNotificationPrefs(accountId, dto);
  }
}
