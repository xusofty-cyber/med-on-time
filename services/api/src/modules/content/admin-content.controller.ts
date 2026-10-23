import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import {
  AdminRoles,
  CurrentAdmin,
  type AuthenticatedAdmin,
} from '../../common/decorators/admin.decorator';
import {
  AdminListArticlesQueryDto,
  CreateArticleDto,
  CreateConsentDto,
  ListConsentsQueryDto,
  UpdateArticleDto,
  UpdateConsentDto,
} from './dto/content.dto';

/**
 * 后台内容接口（契约「内容」一节）：文章多语言组 CRUD + 协议/同意文档版本 CRUD。
 * 路径 /api/admin/content/*；写操作限 operator / super_admin（守卫恒放行）。
 */
@ApiTags('admin-content')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/content')
export class AdminContentController {
  constructor(private readonly service: ContentService) {}

  // 文章
  @Get('articles')
  listArticles(@Query() query: AdminListArticlesQueryDto) {
    return this.service.listArticlesAdmin(query);
  }

  @Post('articles')
  @AdminRoles('operator')
  createArticle(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: CreateArticleDto) {
    return this.service.createArticle(admin.adminId, dto);
  }

  @Patch('articles/:id')
  @AdminRoles('operator')
  updateArticle(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.service.updateArticle(id, dto);
  }

  @Delete('articles/:id')
  @AdminRoles('operator')
  deleteArticle(@Param('id') id: string) {
    return this.service.deleteArticle(id);
  }

  // 协议 / 同意文档版本
  @Get('consents')
  listConsents(@Query() query: ListConsentsQueryDto) {
    return this.service.listConsents(query);
  }

  @Post('consents')
  @AdminRoles('operator')
  createConsent(@Body() dto: CreateConsentDto) {
    return this.service.createConsent(dto);
  }

  @Patch('consents/:id')
  @AdminRoles('operator')
  updateConsent(
    @Param('id') id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UpdateConsentDto,
  ) {
    return this.service.updateConsent(id, admin.adminId, dto);
  }

  @Delete('consents/:id')
  @AdminRoles('operator')
  deleteConsent(@Param('id') id: string) {
    return this.service.deleteConsent(id);
  }
}
