import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminService, type AdminRequestContext } from './admin.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import {
  AdminRoles,
  CurrentAdmin,
  type AuthenticatedAdmin,
} from '../../common/decorators/admin.decorator';
import {
  AdminLoginDto,
  CreateAppVersionDto,
  DrugReviewDto,
  ListAccountsQueryDto,
  ListAppVersionsQueryDto,
  ListAuditLogsQueryDto,
  ListDisputesQueryDto,
  ListDrugsQueryDto,
  ListMembersQueryDto,
  ListPlansQueryDto,
  PageQueryDto,
  ResolveDisputeDto,
  UpdateAppVersionDto,
} from './dto/admin.dto';
import {
  CreateAiProviderDto,
  UpdateAiProviderDto,
} from './dto/ai-provider.dto';
import { AiProviderConfigService } from '../ai/ai-provider-config.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { WechatOaService } from '../wechat-oa/wechat-oa.service';
import {
  CreateOaArticleDto,
  UpdateOaArticleDto,
  UploadOaCoverDto,
} from '../wechat-oa/dto/oa-article.dto';

function requestContext(req: Request): AdminRequestContext {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

/** 后台登录（独立主体：admin_user + 角色；签发的 token 与用户端严格隔离）。 */
@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly service: AdminService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.service.login(dto, requestContext(req));
  }
}

/**
 * 后台管理接口（契约「后台接口」一节，/api/admin 前缀）。
 * 全线挂 AdminAuthGuard（独立密钥口径 + type/aud 校验 + 角色门禁）；
 * 角色口径：读接口任意管理员；冻结/导入/版本管理限 operator；药品核验限
 * operator/medical_reviewer；客服裁决限 cs_agent（super_admin 恒放行）。
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly aiProviders: AiProviderConfigService,
    private readonly aiGateway: AiGatewayService,
    private readonly wechatOa: WechatOaService,
  ) {}

  /* ---------------- 大模型配置（2026-10-24：名称/模型/URL/key 后台可配） ---------------- */

  @Get('ai-providers')
  listAiProviders() {
    return this.aiProviders.list();
  }

  @Post('ai-providers')
  @AdminRoles('operator')
  async createAiProvider(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CreateAiProviderDto,
    @Req() req: Request,
  ) {
    const created = await this.aiProviders.create(dto);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:ai_provider:create',
      targetType: 'ai_provider',
      targetId: created.id,
      detail: { name: dto.name, modelName: dto.modelName, capability: dto.capability },
      ctx: requestContext(req),
    });
    return created;
  }

  @Patch('ai-providers/:id')
  @AdminRoles('operator')
  async updateAiProvider(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UpdateAiProviderDto,
    @Req() req: Request,
  ) {
    const updated = await this.aiProviders.update(id, dto);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:ai_provider:update',
      targetType: 'ai_provider',
      targetId: id,
      detail: { name: dto.name, modelName: dto.modelName, capability: dto.capability, isActive: dto.isActive },
      ctx: requestContext(req),
    });
    return updated;
  }

  @Delete('ai-providers/:id')
  @AdminRoles('operator')
  async removeAiProvider(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const res = await this.aiProviders.remove(id);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:ai_provider:delete',
      targetType: 'ai_provider',
      targetId: id,
      ctx: requestContext(req),
    });
    return res;
  }

  @Post('ai-providers/:id/test')
  @AdminRoles('operator')
  testAiProvider(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.aiGateway.testConnection(id);
  }

  /* ---------------- 公众号文章（2026-10-24：后台写稿 → 同步公众号草稿箱；发布在公众号侧人工确认） ---------------- */

  @Get('oa-articles')
  listOaArticles() {
    return this.wechatOa.list();
  }

  @Get('oa-articles/:id')
  getOaArticle(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.wechatOa.get(id);
  }

  @Post('oa-articles')
  @AdminRoles('operator')
  async createOaArticle(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CreateOaArticleDto,
    @Req() req: Request,
  ) {
    const created = await this.wechatOa.create(dto, admin?.username ?? null);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:oa_article:create',
      targetType: 'oa_article',
      targetId: created.id,
      detail: { title: dto.title },
      ctx: requestContext(req),
    });
    return created;
  }

  @Patch('oa-articles/:id')
  @AdminRoles('operator')
  async updateOaArticle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UpdateOaArticleDto,
    @Req() req: Request,
  ) {
    const updated = await this.wechatOa.update(id, dto);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:oa_article:update',
      targetType: 'oa_article',
      targetId: id,
      detail: { title: dto.title },
      ctx: requestContext(req),
    });
    return updated;
  }

  @Delete('oa-articles/:id')
  @AdminRoles('operator')
  async removeOaArticle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const res = await this.wechatOa.remove(id);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:oa_article:delete',
      targetType: 'oa_article',
      targetId: id,
      ctx: requestContext(req),
    });
    return res;
  }

  @Post('oa-articles/:id/cover')
  @AdminRoles('operator')
  async uploadOaCover(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UploadOaCoverDto,
    @Req() req: Request,
  ) {
    const res = await this.wechatOa.uploadCover(id, dto.imageBase64, dto.mimeType);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:oa_article:upload_cover',
      targetType: 'oa_article',
      targetId: id,
      ctx: requestContext(req),
    });
    return res;
  }

  @Post('oa-articles/:id/sync')
  @AdminRoles('operator')
  async syncOaArticle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const res = await this.wechatOa.sync(id);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:oa_article:sync',
      targetType: 'oa_article',
      targetId: id,
      ctx: requestContext(req),
    });
    return res;
  }

  @Post('oa-articles/:id/unsync')
  @AdminRoles('operator')
  async unsyncOaArticle(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    const res = await this.wechatOa.unsync(id);
    await this.service.recordAudit({
      adminId: admin.adminId,
      action: 'admin:oa_article:unsync',
      targetType: 'oa_article',
      targetId: id,
      ctx: requestContext(req),
    });
    return res;
  }

  @Get('dashboard')
  dashboard() {
    return this.service.dashboard();
  }

  // 账号与成员
  @Get('accounts')
  listAccounts(@Query() query: ListAccountsQueryDto) {
    return this.service.listAccounts(query);
  }

  @Get('accounts/:id')
  getAccount(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getAccount(id);
  }

  @Post('accounts/:id/freeze')
  @AdminRoles('operator')
  freezeAccount(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.service.setAccountFrozen(admin, id, true, requestContext(req));
  }

  @Post('accounts/:id/unfreeze')
  @AdminRoles('operator')
  unfreezeAccount(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.service.setAccountFrozen(admin, id, false, requestContext(req));
  }

  @Get('members')
  listMembers(@Query() query: ListMembersQueryDto) {
    return this.service.listMembers(query);
  }

  // 药品库
  @Get('drugs')
  listDrugs(@Query() query: ListDrugsQueryDto) {
    return this.service.listDrugs(query);
  }

  @Post('drugs/import-seed')
  @AdminRoles('operator')
  importDrugSeed(@CurrentAdmin() admin: AuthenticatedAdmin, @Req() req: Request) {
    return this.service.importDrugSeed(admin, requestContext(req));
  }

  @Get('drugs/:id')
  getDrug(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getDrug(id);
  }

  @Patch('drugs/:id/review')
  @AdminRoles('operator', 'medical_reviewer')
  reviewDrug(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DrugReviewDto,
    @Req() req: Request,
  ) {
    return this.service.reviewDrug(admin, id, dto, requestContext(req));
  }

  // 计划监管
  @Get('plans')
  listPlans(@Query() query: ListPlansQueryDto) {
    return this.service.listPlans(query);
  }

  @Get('plans/:id/history')
  getPlanHistory(@Param('id', new ParseUUIDPipe()) id: string, @Query() query: PageQueryDto) {
    return this.service.getPlanHistory(id, query);
  }

  // 客服裁决
  @Get('disputes')
  listDisputes(@Query() query: ListDisputesQueryDto) {
    return this.service.listDisputes(query);
  }

  @Post('disputes/:id/resolve')
  @AdminRoles('cs_agent')
  resolveDispute(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveDisputeDto,
    @Req() req: Request,
  ) {
    return this.service.resolveDispute(admin, id, dto, requestContext(req));
  }

  // 审计
  @Get('audit-logs')
  listAuditLogs(@Query() query: ListAuditLogsQueryDto) {
    return this.service.listAuditLogs(query);
  }

  // 客户端版本
  @Get('app-versions')
  listAppVersions(@Query() query: ListAppVersionsQueryDto) {
    return this.service.listAppVersions(query);
  }

  @Post('app-versions')
  @AdminRoles('operator')
  createAppVersion(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CreateAppVersionDto,
    @Req() req: Request,
  ) {
    return this.service.createAppVersion(admin, dto, requestContext(req));
  }

  @Patch('app-versions/:id')
  @AdminRoles('operator')
  updateAppVersion(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAppVersionDto,
    @Req() req: Request,
  ) {
    return this.service.updateAppVersion(admin, id, dto, requestContext(req));
  }

  @Delete('app-versions/:id')
  @AdminRoles('operator')
  deleteAppVersion(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ) {
    return this.service.deleteAppVersion(admin, id, requestContext(req));
  }
}
