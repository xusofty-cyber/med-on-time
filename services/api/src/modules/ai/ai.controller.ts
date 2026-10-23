import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateAiSessionDto, CreateAiTaskDto, SendAiMessageDto } from './dto/ai.dto';

/**
 * AI 健康助手接口（占位）：POC-2 未评测 + 外部医学审校未过，入口不开——
 * 全部端点经 AiService.assertEnabled 统一返回「未开通」业务码（40310）。
 * 路由与 DTO 先行定版，开通时只换服务实现，不动契约。
 */
@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, MemberAccessGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Post('sessions')
  createSession(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAiSessionDto) {
    return this.service.createSession(user.accountId, dto);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser, @Query('memberId') memberId: string) {
    return this.service.listSessions(user.accountId, memberId);
  }

  @Post('sessions/:sessionId/messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendAiMessageDto,
  ) {
    return this.service.sendMessage(user.accountId, sessionId, dto);
  }

  @Post('tasks')
  createTask(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAiTaskDto) {
    return this.service.createTask(user.accountId, dto);
  }

  @Get('tasks')
  listTasks(@CurrentUser() user: AuthenticatedUser, @Query('memberId') memberId: string) {
    return this.service.listTasks(user.accountId, memberId);
  }

  @Get('quota')
  getQuota(@CurrentUser() user: AuthenticatedUser, @Query('memberId') memberId: string) {
    return this.service.getQuota(user.accountId, memberId);
  }
}
