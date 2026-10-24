import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberService } from './member.service';
import {
  CareSettingsDto,
  CreateMemberDto,
  UpdateMemberDto,
} from './dto/member.dto';

/**
 * 成员接口（契约：/members*）。
 * 隔离：全控制器先 JWT、再 MemberAccessGuard（路径 :memberId 先过归属/授权校验）；
 * 写操作在服务层另验「仅归属账号」（守卫放行含照护人，写口径更严）。
 */
@ApiTags('member')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, MemberAccessGuard)
@Controller('members')
export class MemberController {
  constructor(private readonly service: MemberService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMemberDto,
  ) {
    return this.service.createMember(user.accountId, dto);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMembers(user.accountId);
  }

  @Get(':memberId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
  ) {
    return this.service.getMember(memberId, user.accountId);
  }

  @Patch(':memberId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.service.updateMember(user.accountId, memberId, dto);
  }

  @Delete(':memberId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
  ) {
    return this.service.deleteMember(user.accountId, memberId);
  }

  @Get(':memberId/care-settings')
  async getCareSettings(@Param('memberId') memberId: string) {
    return this.service.getCareSettings(memberId);
  }

  @Put(':memberId/care-settings')
  async putCareSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('memberId') memberId: string,
    @Body() dto: CareSettingsDto,
  ) {
    return this.service.putCareSettings(memberId, dto, user.accountId);
  }
}
