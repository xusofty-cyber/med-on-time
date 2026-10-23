import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { AuthService, type RequestContext } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  BindWechatDto,
  LoginByCodeDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SendSmsCodeDto,
} from './dto/auth.dto';

function requestContext(req: Request): RequestContext {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  /** 发送短信验证码（register/login/reset 三场景，限频见 VerificationCodeService） */
  @Post('sms/send')
  async sendSmsCode(@Body() dto: SendSmsCodeDto) {
    return this.service.sendSmsCode(dto.phone, dto.scene);
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.service.register(dto, requestContext(req));
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.service.login(dto, requestContext(req));
  }

  @Post('login/code')
  async loginByCode(@Body() dto: LoginByCodeDto, @Req() req: Request) {
    return this.service.loginByCode(dto, requestContext(req));
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.service.refresh(dto.refreshToken, requestContext(req));
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
  ) {
    await this.service.logout(user.accountId, dto.refreshToken);
    return { loggedOut: true };
  }

  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.service.resetPassword(dto);
    return { reset: true };
  }

  /** 占位：未接真实微信前返回未开通（契约） */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('bind/wechat')
  bindWechat(@Body() _dto: BindWechatDto) {
    return this.service.bindWechatPlaceholder();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMe(user.accountId);
  }
}
