import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { PlanService } from './plan.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import {
  ListPlansQueryDto,
  PaginationQueryDto,
} from './dto/list-plans.query';

/**
 * 用药计划接口（契约 plan 组）。
 * - members/:memberId/plans：挂 MemberAccessGuard 做成员隔离前置；
 * - plans/:planId 系列：路径无 memberId，隔离与 L3 写权限由 PlanService
 *   按 plan.memberId 二次校验（守卫对此类路由放行，不构成绕过）。
 */
@ApiTags('plan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PlanController {
  constructor(private readonly service: PlanService) {}

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

  @Post('members/:memberId/plans')
  @UseGuards(MemberAccessGuard)
  create(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: CreatePlanDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.createPlan(memberId, dto, this.requireUser(user));
  }

  @Get('members/:memberId/plans')
  @UseGuards(MemberAccessGuard)
  list(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Query() query: ListPlansQueryDto,
  ) {
    return this.service.listPlans(memberId, query);
  }

  @Get('plans/:planId')
  get(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.getPlan(planId, this.requireUser(user));
  }

  @Patch('plans/:planId')
  update(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.updatePlan(planId, dto, this.requireUser(user));
  }

  @Delete('plans/:planId')
  remove(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.deletePlan(planId, this.requireUser(user));
  }

  @Get('plans/:planId/history')
  history(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.getHistory(planId, query, this.requireUser(user));
  }

  @Post('plans/:planId/pause')
  pause(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.pausePlan(planId, this.requireUser(user));
  }

  @Post('plans/:planId/resume')
  resume(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.resumePlan(planId, this.requireUser(user));
  }
}
