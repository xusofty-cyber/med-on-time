import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ListArticlesQueryDto } from './dto/content.dto';

/** 用户端内容接口（契约 content 一节）：仅返回 published 文章，按 locale 取文。 */
@ApiTags('content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('content')
export class ContentController {
  constructor(private readonly service: ContentService) {}

  @Get('articles')
  listArticles(@Query() query: ListArticlesQueryDto) {
    return this.service.listPublishedArticles(query);
  }

  @Get('articles/:id')
  getArticle(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getPublishedArticle(id);
  }
}
