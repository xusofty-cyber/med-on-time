import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  ConfirmScanTicketDto,
  CreateScanTicketDto,
  LoginByCodeDto,
  LoginDto,
  LogoutDto,
  RefreshDto,
  RegisterByEmailDto,
  RegisterDto,
  ResetPasswordDto,
  SendEmailCodeDto,
  SendSmsCodeDto,
  WechatMiniappLoginDto,
  WechatPhoneVerifyDto,
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

  /** 发送邮箱验证码（register/login/reset_password/bind 四场景，限频同短信） */
  @Post('email/send')
  async sendEmailCode(@Body() dto: SendEmailCodeDto) {
    return this.service.sendEmailCode(dto.email, dto.scene);
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.service.register(dto, requestContext(req));
  }

  /** 邮箱验证码注册（V1.3 先行通道；手机号选填、登记不验证） */
  @Post('register/email')
  async registerByEmail(@Body() dto: RegisterByEmailDto, @Req() req: Request) {
    return this.service.registerByEmail(dto, requestContext(req));
  }

  /** 微信小程序登录（V1.3 先行通道；未配置 appid/secret 返回 40312） */
  @Post('wechat/miniapp/login')
  async wechatMiniappLogin(@Body() dto: WechatMiniappLoginDto, @Req() req: Request) {
    return this.service.wechatMiniappLogin(dto, requestContext(req));
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

  /** 微信绑定（V1.3 实接：code 换 openid 落 user_oauth_binding；旧路径保留同实现） */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('bind/wechat')
  async bindWechatLegacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BindWechatDto,
  ) {
    return this.service.bindWechat(user.accountId, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('wechat/bind')
  async bindWechat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BindWechatDto,
  ) {
    return this.service.bindWechat(user.accountId, dto.code);
  }

  /** 扫码登录：Web 建票（返回二维码内容，Web 侧渲染并轮询） */
  @Post('scan-login/tickets')
  async createScanTicket(@Body() dto: CreateScanTicketDto) {
    return this.service.createScanTicket(dto);
  }

  /** 扫码登录：Web 轮询取票（confirmed 时一次性返回令牌） */
  @Get('scan-login/tickets/:id')
  async pollScanTicket(@Param('id') id: string, @Req() req: Request) {
    return this.service.pollScanTicket(id, requestContext(req));
  }

  /** 扫码登录：小程序端确认（需登录态，确认本人登录网页版） */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('scan-login/confirm')
  async confirmScanTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmScanTicketDto,
  ) {
    return this.service.confirmScanTicket(dto.ticketId, user.accountId);
  }

  /** 微信手机号验证（需登录）：getPhoneNumber 的 code 换真号落库/置验证 */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('phone/verify/wechat')
  async verifyPhoneByWechat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WechatPhoneVerifyDto,
  ) {
    return this.service.verifyPhoneByWechat(user.accountId, dto.phoneCode);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMe(user.accountId);
  }
}
