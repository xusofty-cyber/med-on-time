import { Body, Controller, Get, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import {
  clearRefreshCookie,
  hasCookieClientHeader,
  parseTtlSeconds,
  readRefreshCookie,
  setRefreshCookie,
  type RefreshCookieOptions,
} from './auth-cookie';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { AuthService, type RequestContext } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  BindWechatConfirmDto,
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
  constructor(
    private readonly service: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** refresh cookie 参数（经 ConfigService 取值，配置隔离红线）。 */
  private cookieOptions(): RefreshCookieOptions {
    return {
      secure: this.config.get<string>('NODE_ENV') === 'production',
      maxAgeSeconds: parseTtlSeconds(this.config.get<string>('jwt.refreshTtl') ?? '30d'),
    };
  }

  /** 令牌签发后同步下发 httpOnly refresh cookie（Web/Admin 浏览器通道）。 */
  private withCookie<T extends { refreshToken: string }>(req: Request, pair: T): T {
    setRefreshCookie(req, pair.refreshToken, this.cookieOptions());
    return pair;
  }

  /** 发送短信验证码（register/login/reset 三场景，限频见 VerificationCodeService） */
  @Post('sms/send')
  async sendSmsCode(@Body() dto: SendSmsCodeDto, @Req() req: Request) {
    return this.service.sendSmsCode(dto.phone, dto.scene, requestContext(req));
  }

  /** 发送邮箱验证码（register/login/reset_password/bind 四场景，限频同短信） */
  @Post('email/send')
  async sendEmailCode(@Body() dto: SendEmailCodeDto, @Req() req: Request) {
    return this.service.sendEmailCode(dto.email, dto.scene, requestContext(req));
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.withCookie(req, await this.service.register(dto, requestContext(req)));
  }

  /** 邮箱验证码注册（V1.3 先行通道；手机号选填、登记不验证） */
  @Post('register/email')
  async registerByEmail(@Body() dto: RegisterByEmailDto, @Req() req: Request) {
    return this.withCookie(req, await this.service.registerByEmail(dto, requestContext(req)));
  }

  /** 微信小程序登录（V1.3 先行通道；未配置 appid/secret 返回 40312） */
  @Post('wechat/miniapp/login')
  async wechatMiniappLogin(@Body() dto: WechatMiniappLoginDto, @Req() req: Request) {
    return this.withCookie(req, await this.service.wechatMiniappLogin(dto, requestContext(req)));
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.withCookie(req, await this.service.login(dto, requestContext(req)));
  }

  @Post('login/code')
  async loginByCode(@Body() dto: LoginByCodeDto, @Req() req: Request) {
    return this.withCookie(req, await this.service.loginByCode(dto, requestContext(req)));
  }

  /**
   * 刷新令牌（双模）：body 传 refreshToken（原生/小程序/桌面）；
   * 或浏览器凭 httpOnly cookie 自动携带（Web/Admin，refresh 不落 localStorage）——
   * cookie 模式必须带 X-Mot-Client: web 自定义头作 CSRF 门槛。成功后轮换并重下发 cookie。
   */
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    let token = dto.refreshToken;
    if (!token) {
      token = readRefreshCookie(req) ?? undefined;
      if (token && !hasCookieClientHeader(req)) {
        throw new BusinessException(
          BusinessCode.Forbidden,
          'cookie 刷新缺少客户端标识头',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    const pair = await this.service.refresh(token ?? '', requestContext(req));
    return this.withCookie(req, pair);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
    @Req() req: Request,
  ) {
    await this.service.logout(
      user.accountId,
      dto.refreshToken ?? readRefreshCookie(req) ?? undefined,
    );
    clearRefreshCookie(req, this.cookieOptions());
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
    const result = await this.service.pollScanTicket(id, requestContext(req));
    if (result.status === 'confirmed') this.withCookie(req, result);
    return result;
  }

  /** 扫码登录：小程序确认页预览发起端信息（需登录态，不含令牌） */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('scan-login/tickets/:id/preview')
  async previewScanTicket(@Param('id') id: string) {
    return this.service.previewScanTicket(id);
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

  /** 微信绑定：Web 建票（需登录态，返回绑定票据及二维码内容，5分钟过期） */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('wechat/bind-tickets')
  async createBindTicket(@CurrentUser() user: AuthenticatedUser) {
    return this.service.createBindTicket(user.accountId);
  }

  /** 微信绑定：Web 轮询票据状态（需登录态且仅建票本人） */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('wechat/bind-tickets/:id')
  async getBindTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.getBindTicket(id, user.accountId);
  }

  /** 微信绑定：小程序确认页预览目标账号脱敏信息（需登录态） */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('wechat/bind-tickets/:id/preview')
  async previewBindTicket(@Param('id') id: string) {
    return this.service.previewBindTicket(id);
  }

  /** 微信绑定：小程序端扫码确认（需登录态，携带绑定票据与 wx.login 的 code） */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('wechat/bind-confirm')
  async confirmBindTicket(
    @CurrentUser() _user: AuthenticatedUser,
    @Body() dto: BindWechatConfirmDto,
  ) {
    return this.service.confirmBindTicket(dto.ticketId, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getMe(user.accountId);
  }
}
