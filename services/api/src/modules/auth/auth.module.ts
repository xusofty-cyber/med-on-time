import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  RedisScanLoginTicketStore,
  ScanLoginTicketStore,
} from './scan-login-ticket.store';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PhoneCryptoService } from './services/phone-crypto.service';
import { TokenService } from './services/token.service';
import { WechatMiniappService } from './services/wechat-miniapp.service';
import { LoginThrottleService } from './services/login-throttle.service';
import {
  DevStubMailSender,
  MailSender,
  SmtpMailSender,
  isSmtpConfigured,
} from './services/mail-sender.service';
import {
  RefreshSessionStore,
  SessionService,
} from './services/session.service';
import { RedisRefreshSessionStore } from './services/redis-refresh-session.store';
import {
  DevStubSmsSender,
  SmsSender,
  VerificationCodeService,
  VerificationCodeStore,
} from './services/verification-code.service';
import { RedisVerificationCodeStore } from './services/redis-verification-code.store';
import {
  TencentSmsGateway,
  TencentSmsSender,
  isTencentSmsConfigured,
} from './services/tencent-sms.service';

/**
 * 身份线基础模块：手机号加解密、会话与验证码服务由本模块统一提供；JWT 守卫
 * 统一定版在 common/guards/jwt-auth.guard（本模块仅转发导出，保持各线引用稳定），
 * account/member/authorization 经 imports 复用（禁止各模块自建鉴权，防口径漂移）。
 * 存储绑定均为 Redis 实现（P1 迁移；内存实现仅留作测试），切换点集中在此文件。
 * Redis 客户端由全局 RedisModule 提供（common/redis）。
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
    LoginThrottleService,
    { provide: ScanLoginTicketStore, useClass: RedisScanLoginTicketStore },
    { provide: RefreshSessionStore, useClass: RedisRefreshSessionStore },
    { provide: VerificationCodeStore, useClass: RedisVerificationCodeStore },
    {
      // 腾讯云短信已配齐 → 真实发送；未配 → DevStubSmsSender（诚实抛 40313，
      // 不再谎报成功；个人暂无法申请签名/模板，需企业认证后配齐见 .env.example）。
      provide: SmsSender,
      useFactory: (config: ConfigService) =>
        isTencentSmsConfigured(config)
          ? new TencentSmsSender(config, new TencentSmsGateway(config))
          : new DevStubSmsSender(),
      inject: [ConfigService],
    },
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
    WechatMiniappService,
  ],
})
export class AuthModule {}
