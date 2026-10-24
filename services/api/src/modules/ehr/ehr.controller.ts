import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EhrService } from './ehr.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  CreateAdverseRecordDto,
  CreateEmergencyContactDto,
  PageQueryDto,
  PutAllergiesDto,
  UpdateEmergencyContactDto,
  UpsertMedicalRecordDto,
} from './dto/ehr.dto';

/**
 * 档案域接口（契约 ehr 一节）。全线挂用户 JWT + 成员隔离守卫：
 * 路径 memberId 先过归属/授权校验（红线 5），服务层查询再带 memberId 作用域。
 */
@ApiTags('ehr')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, MemberAccessGuard)
@Controller('members/:memberId')
export class EhrController {
  constructor(private readonly service: EhrService) {}

  // 过敏档案
  @Get('allergies')
  listAllergies(@Param('memberId') memberId: string) {
    return this.service.listAllergies(memberId);
  }

  @Put('allergies')
  replaceAllergies(
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PutAllergiesDto,
  ) {
    return this.service.replaceAllergies(memberId, user.accountId, dto);
  }

  // 服药后不适记录
  @Post('adverse-records')
  createAdverseRecord(
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAdverseRecordDto,
  ) {
    return this.service.createAdverseRecord(memberId, user.accountId, dto);
  }

  @Get('adverse-records')
  listAdverseRecords(
    @Param('memberId') memberId: string,
    @Query() query: PageQueryDto,
    @Query('severity') severity?: string,
  ) {
    return this.service.listAdverseRecords(memberId, query, severity);
  }

  // 紧急联系人
  @Get('emergency-contacts')
  listEmergencyContacts(@Param('memberId') memberId: string) {
    return this.service.listEmergencyContacts(memberId);
  }

  @Post('emergency-contacts')
  createEmergencyContact(
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmergencyContactDto,
  ) {
    return this.service.createEmergencyContact(memberId, dto, user.accountId);
  }

  @Patch('emergency-contacts/:contactId')
  updateEmergencyContact(
    @Param('memberId') memberId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateEmergencyContactDto,
  ) {
    return this.service.updateEmergencyContact(memberId, contactId, dto, user.accountId);
  }

  @Delete('emergency-contacts/:contactId')
  deleteEmergencyContact(
    @Param('memberId') memberId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.deleteEmergencyContact(memberId, contactId, user.accountId);
  }

  // 病历（正文加密存储）
  @Get('medical-records')
  getMedicalRecord(@Param('memberId') memberId: string) {
    return this.service.getMedicalRecord(memberId);
  }

  @Post('medical-records')
  upsertMedicalRecord(
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertMedicalRecordDto,
  ) {
    return this.service.upsertMedicalRecord(memberId, dto, user.accountId);
  }
}
