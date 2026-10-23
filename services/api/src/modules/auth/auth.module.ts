import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PhoneCryptoService } from './services/phone-crypto.service';
import { TokenService } from './services/token.service';
import { WechatMiniappService } from './services/wechat-miniapp.service';
import {
  DevStubMailSender,
  MailSender,
  SmtpMailSender,
  isSmtpConfigured,
} from './services/mail-sender.service';
import {
  InMemoryRefreshSessionStore,
  RefreshSessionStore,
  SessionService,
} from './services/session.service';
import {
  DevStubSmsSender,
  InMemoryVerificationCodeStore,
  SmsSender,
  VerificationCodeService,
  VerificationCodeStore,
} from './services/verification-code.service';

/**
 * 身份线基础模块：手机号加解密、会话与验证码服务由本模块统一提供；JWT 守卫
 * 统一定版在 common/guards/jwt-auth.guard（本模块仅转发导出，保持各线引用稳定），
 * account/member/authorization 经 imports 复用（禁止各模块自建鉴权，防口径漂移）。
 * 存储绑定均为内存实现（schema 无 user_session/验证码表），切换点集中在此文件。
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    PhoneCryptoService,
    TokenService,
    SessionService,
    VerificationCodeService,
    WechatMiniappService,
    { provide: RefreshSessionStore, useClass: InMemoryRefreshSessionStore },
    { provide: VerificationCodeStore, useClass: InMemoryVerificationCodeStore },
    { provide: SmsSender, useClass: DevStubSmsSender },
    {
      // SMTP 已配置 → 真实发送；未配置 → dev stub（掩码日志 + 启动警告），与短信 stub 同口径。
      provide: MailSender,
      useFactory: (config: ConfigService) =>
        isSmtpConfigured(config) ? new SmtpMailSender(config) : new DevStubMailSender(),
      inject: [ConfigService],
    },
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    PhoneCryptoService,
    TokenService,
    SessionService,
    VerificationCodeService,
  ],
})
export class AuthModule {}
