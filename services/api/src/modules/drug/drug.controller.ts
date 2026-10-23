import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MemberAccessGuard } from '../../common/guards/member-access.guard';
import { BusinessCode, BusinessException } from '../../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';
import { DrugService } from './drug.service';
import { DrugPhotoService } from './drug-photo.service';
import { CreateCustomDrugDto } from './dto/create-custom-drug.dto';
import { SearchDrugsQueryDto } from './dto/search-drugs.query';
import { PhotoRecognizeDto } from './dto/photo-recognize.dto';

/**
 * 药品接口（契约 drug 组）。注意路由声明顺序：search 必须在 :id 之前，
 * 否则会被 :id 吞掉。成员自建走 members/:memberId 前缀并挂成员隔离守卫
 * （守卫按 params.memberId 校验；drugs/:id 的 :id 不是 memberId，故字典
 * 查询类接口不挂该守卫，可见性由 DrugService 统一收口）。
 */
@ApiTags('drug')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class DrugController {
  constructor(
    private readonly service: DrugService,
    private readonly photo: DrugPhotoService,
  ) {}

  @Get('drugs/search')
  search(@Query() query: SearchDrugsQueryDto, @CurrentUser() user?: AuthenticatedUser) {
    return this.service.search(query, user);
  }

  /**
   * 拍照录入：识别药盒照片中的药名候选，并附药品库命中项。
   * 红线：识别结果只作搜索回填，须用户点选命中项确认；照片不落盘不留存。
   */
  @Post('drugs/photo-recognize')
  photoRecognize(
    @Body() dto: PhotoRecognizeDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.photo.recognize(dto, user);
  }

  @Get('drugs/:id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.getById(id, user);
  }

  @Get('drugs/:id/interactions')
  getInteractions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.getInteractions(id, user);
  }

  @Post('members/:memberId/drugs/custom')
  @UseGuards(MemberAccessGuard)
  createCustom(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: CreateCustomDrugDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (!user) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        'missing authenticated user',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.service.createCustomDrug(memberId, dto, user);
  }
}
