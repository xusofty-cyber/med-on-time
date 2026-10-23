import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountStatus } from '@med-on-time/shared';
import type { UserAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { PhoneCryptoService } from './services/phone-crypto.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import {
  VerificationCodeService,
  type SmsScene,
} from './services/verification-code.service';
import type {
  DeviceInfoDto,
  LoginByCodeDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneCrypto: PhoneCryptoService,
    private readonly tokenService: TokenService,
    private readonly sessions: SessionService,
    private readonly codes: VerificationCodeService,
  ) {}

  async sendSmsCode(phone: string, scene: SmsScene): Promise<{ expiresInSeconds: number }> {
    return this.codes.send(phone, this.phoneCrypto.hashPhone(phone), scene);
  }

  async register(dto: RegisterDto, ctx: RequestContext): Promise<TokenPair> {
    const phoneHash = this.phoneCrypto.hashPhone(dto.phone);
    await this.codes.verifyAndConsume(phoneHash, 'register', dto.smsCode);

    const existing = await this.findAccountByPhoneHash(phoneHash);
    if (existing) {
      throw new BusinessException(
        BusinessCode.Conflict,
        '该手机号已注册，请直接登录',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const now = new Date();
    const accountId = uuidv7();
    const nickname = dto.nickname ?? `用户${dto.phone.slice(-4)}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.create({
        data: {
          id: accountId,
          phone: this.phoneCrypto.encryptPhone(dto.phone),
          phoneHash,
          passwordHash,
          nickname,
          registerChannel: dto.registerChannel,
          registeredAt: now,
          status: AccountStatus.Active,
          lastLoginAt: now,
        },
      });
      // 账号持有人本人即一名 member（schema member 表口径：relationship=self）
      await tx.member.create({
        data: {
          id: uuidv7(),
          accountId,
          displayName: nickname,
          relationship: 'self',
          status: 'active',
        },
      });
    });

    const account = await this.findAccountById(accountId);
    return this.issueTokens(account as UserAccount, dto, ctx);
  }

  async login(dto: LoginDto, ctx: RequestContext): Promise<TokenPair> {
    const account = await this.findAccountByPhoneHash(
      this.phoneCrypto.hashPhone(dto.phone),
    );
    if (!account || !account.passwordHash) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        '手机号或密码不正确',
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.assertAccountUsable(account);
    const ok = await argon2.verify(account.passwordHash, dto.password);
    if (!ok) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        '手机号或密码不正确',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.touchLogin(account.id);
    return this.issueTokens(account, dto, ctx);
  }

  async loginByCode(dto: LoginByCodeDto, ctx: RequestContext): Promise<TokenPair> {
    const phoneHash = this.phoneCrypto.hashPhone(dto.phone);
    await this.codes.verifyAndConsume(phoneHash, 'login', dto.smsCode);
    const account = await this.findAccountByPhoneHash(phoneHash);
    if (!account) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '该手机号未注册，请先注册',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertAccountUsable(account);
    await this.touchLogin(account.id);
    return this.issueTokens(account, dto, ctx);
  }

  /** refresh 轮换：旧会话吊销后发新对（token rotation，防 refresh 重放）。 */
  async refresh(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    const payload = this.tokenService.verify(refreshToken, 'refresh');
    if (!payload) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        'refresh token 无效或已过期',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const session = await this.sessions.findValidSession(payload.sid, payload.jti);
    if (!session) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        '会话已失效，请重新登录',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const account = await this.findAccountById(payload.sub);
    if (!account) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        '账号不存在',
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.assertAccountUsable(account);
    await this.sessions.revokeSession(session.id);
    return this.issueTokens(
      account,
      { platform: session.platform, deviceName: session.deviceName },
      ctx,
    );
  }

  async logout(accountId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const payload = this.tokenService.verify(refreshToken, 'refresh');
      if (payload && payload.sub === accountId) {
        await this.sessions.revokeSession(payload.sid);
        return;
      }
    }
    // 未带 refresh token 时吊销当前账号全部会话（保守口径：退出即全端下线需客户端配合传 refresh）
    await this.sessions.revokeAllSessions(accountId);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const phoneHash = this.phoneCrypto.hashPhone(dto.phone);
    await this.codes.verifyAndConsume(phoneHash, 'reset', dto.smsCode);
    const account = await this.findAccountByPhoneHash(phoneHash);
    if (!account) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '该手机号未注册',
        HttpStatus.NOT_FOUND,
      );
    }
    const passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    await this.prisma.userAccount.update({
      where: { id: account.id },
      data: { passwordHash },
    });
    // 改密后全部会话吊销，强制各端重新登录
    await this.sessions.revokeAllSessions(account.id);
  }

  /** 微信绑定占位（契约：未接真实微信前返回未开通，不写 oauth 绑定表）。 */
  bindWechatPlaceholder(): { provider: string; available: boolean; bound: boolean; message: string } {
    return {
      provider: 'wechat',
      available: false,
      bound: false,
      message: '微信绑定尚未开通',
    };
  }

  async getMe(accountId: string): Promise<Record<string, unknown>> {
    const account = await this.findAccountById(accountId);
    if (!account) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '账号不存在',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.toAccountView(account);
  }

  toAccountView(account: UserAccount): Record<string, unknown> {
    let phoneMasked: string | null = null;
    if (account.phone) {
      try {
        phoneMasked = PhoneCryptoService.maskPhone(
          this.phoneCrypto.decryptPhone(account.phone),
        );
      } catch {
        phoneMasked = null;
      }
    }
    return {
      id: account.id,
      phoneMasked,
      nickname: account.nickname,
      avatarFileId: account.avatarFileId,
      registerChannel: account.registerChannel,
      status: account.status,
      timezone: account.timezone,
      registeredAt: account.registeredAt,
      lastLoginAt: account.lastLoginAt,
      cancelApplyAt: account.cancelApplyAt,
    };
  }

  private async issueTokens(
    account: UserAccount,
    device: DeviceInfoDto,
    ctx: RequestContext,
  ): Promise<TokenPair> {
    // sid 先生成 → 以真实 sid 签 refresh 拿到 jti → 再落会话记录（sid/jti 与 token 一致）
    const sessionId = uuidv7();
    const { token: refreshToken, jti } = this.tokenService.signRefreshToken(
      account.id,
      sessionId,
    );
    await this.sessions.createSession({
      id: sessionId,
      accountId: account.id,
      refreshJti: jti,
      refreshTtlSeconds: this.tokenService.refreshTtlSeconds,
      platform: device.platform,
      deviceName: device.deviceName,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    const accessToken = this.tokenService.signAccessToken(account.id, sessionId);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.accessTtlSeconds,
    };
  }

  private async touchLogin(accountId: string): Promise<void> {
    await this.prisma.userAccount.update({
      where: { id: accountId },
      data: { lastLoginAt: new Date() },
    });
  }

  private assertAccountUsable(account: UserAccount): void {
    if (account.status === AccountStatus.Frozen) {
      throw new BusinessException(
        BusinessCode.Forbidden,
        '账号已被冻结',
        HttpStatus.FORBIDDEN,
      );
    }
    if (account.status === AccountStatus.Cancelled) {
      throw new BusinessException(
        BusinessCode.Forbidden,
        '账号已注销',
        HttpStatus.FORBIDDEN,
      );
    }
    // cancelling（冷静期）允许登录：用户可经 /account/cancel/withdraw 撤销注销
  }

  private async findAccountByPhoneHash(phoneHash: string): Promise<UserAccount | null> {
    return this.prisma.userAccount.findFirst({
      where: { phoneHash, deletedAt: null },
    });
  }

  private async findAccountById(id: string): Promise<UserAccount | null> {
    return this.prisma.userAccount.findFirst({
      where: { id, deletedAt: null },
    });
  }
}
