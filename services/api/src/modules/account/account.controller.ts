import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountService } from './account.service';
import { CancelAccountDto, UpdateProfileDto } from './dto/account.dto';

/** 契约路径：/account/*（基路径 /api 由 main.ts 全局前缀提供） */
@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly service: AccountService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProfile(user.accountId);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.service.updateProfile(user.accountId, dto);
  }

  /** 注销申请 → 30 天冷静期（状态流转见 AccountService） */
  @Post('cancel')
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CancelAccountDto,
  ) {
    return this.service.applyCancel(user.accountId, dto);
  }

  /** 冷静期内撤销注销申请 */
  @Post('cancel/withdraw')
  async withdrawCancel(@CurrentUser() user: AuthenticatedUser) {
    return this.service.withdrawCancel(user.accountId);
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listSessions(user.accountId);
  }

  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.revokeSession(user.accountId, id);
  }
}
