import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PhoneCryptoService } from './services/phone-crypto.service';
import { TokenService } from './services/token.service';
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
    { provide: RefreshSessionStore, useClass: InMemoryRefreshSessionStore },
    { provide: VerificationCodeStore, useClass: InMemoryVerificationCodeStore },
    { provide: SmsSender, useClass: DevStubSmsSender },
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
