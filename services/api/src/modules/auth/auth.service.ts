import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { AccountStatus } from '@med-on-time/shared';
import type { UserAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { uuidv7 } from '../../common/utils/uuidv7';
import {
  AuthBusinessCode,
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';
import { PhoneCryptoService } from './services/phone-crypto.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import {
  VerificationCodeService,
  type CodeScene,
  type SmsScene,
} from './services/verification-code.service';
import { WechatMiniappService } from './services/wechat-miniapp.service';
import {
  ScanLoginTicketStore,
  SCAN_TICKET_TTL_MS,
} from './scan-login-ticket.store';
import type {
  DeviceInfoDto,
  LoginByCodeDto,
  LoginDto,
  RegisterByEmailDto,
  RegisterDto,
  ResetPasswordDto,
  WechatMiniappLoginDto,
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
    private readonly wechat: WechatMiniappService,
    private readonly scanTickets: ScanLoginTicketStore,
    private readonly config: ConfigService,
  ) {}

  async sendSmsCode(phone: string, scene: SmsScene): Promise<{ expiresInSeconds: number }> {
    return this.codes.send(phone, this.phoneCrypto.hashPhone(phone), scene);
  }

  async sendEmailCode(email: string, scene: CodeScene): Promise<{ expiresInSeconds: number }> {
    const normalized = PhoneCryptoService.normalizeEmail(email);
    return this.codes.sendEmail(normalized, this.phoneCrypto.hashEmail(normalized), scene);
  }

  async register(dto: RegisterDto, ctx: RequestContext): Promise<TokenPair> {
    const phoneHash = this.phoneCrypto.hashPhone(dto.phone);
    // V1.3 裁定：带短信验证码则校验并置已验证；不带码未验证注册（三受限生效，见 AUTH_CHANNELS.md）。
    if (dto.smsCode) {
      await this.codes.verifyAndConsume(phoneHash, 'register', dto.smsCode);
    }

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
          // 带码注册即完成手机号核验；无码注册 phoneVerifiedAt=null（未验证，三受限）
          phoneVerifiedAt: dto.smsCode ? now : null,
          passwordHash,
          nickname,
          registerChannel: dto.registerChannel ?? 'web',
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

  /**
   * 邮箱验证码注册（V1.3 先行通道）：邮箱经验证码核验即置 emailVerifiedAt；
   * 选填手机号只登记不验证（phoneVerifiedAt=null，三受限生效，见 AUTH_CHANNELS.md）。
   */
  async registerByEmail(dto: RegisterByEmailDto, ctx: RequestContext): Promise<TokenPair> {
    const email = PhoneCryptoService.normalizeEmail(dto.email);
    const emailHash = this.phoneCrypto.hashEmail(email);
    await this.codes.verifyEmailAndConsume(emailHash, 'register', dto.code);

    const byEmail = await this.prisma.userAccount.findFirst({
      where: { emailHash, deletedAt: null },
    });
    if (byEmail) {
      throw new BusinessException(
        BusinessCode.Conflict,
        '该邮箱已注册，请直接登录',
        HttpStatus.CONFLICT,
      );
    }

    let phoneHash: string | null = null;
    if (dto.phone) {
      phoneHash = this.phoneCrypto.hashPhone(dto.phone);
      const byPhone = await this.findAccountByPhoneHash(phoneHash);
      if (byPhone) {
        throw new BusinessException(
          BusinessCode.Conflict,
          '该手机号已被注册',
          HttpStatus.CONFLICT,
        );
      }
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const now = new Date();
    const accountId = uuidv7();
    const nickname =
      dto.nickname ??
      (dto.phone ? `用户${dto.phone.slice(-4)}` : `用户${email.slice(0, email.indexOf('@')).slice(0, 20)}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.userAccount.create({
        data: {
          id: accountId,
          email: this.phoneCrypto.encryptEmail(email),
          emailHash,
          emailVerifiedAt: now,
          phone: dto.phone ? this.phoneCrypto.encryptPhone(dto.phone) : null,
          phoneHash,
          phoneVerifiedAt: null,
          passwordHash,
          nickname,
          registerChannel: dto.registerChannel ?? 'web',
          registeredAt: now,
          status: AccountStatus.Active,
          lastLoginAt: now,
        },
      });
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
    // V1.3：account 可为手机号或邮箱（含 @ 按邮箱查）；旧 {phone} 形状保持兼容。
    const identifier = dto.account ?? dto.phone;
    if (!identifier) {
      throw new BusinessException(BusinessCode.BadRequest, '账号不能为空');
    }
    const account = identifier.includes('@')
      ? await this.findAccountByEmailHash(this.phoneCrypto.hashEmail(identifier))
      : await this.findAccountByPhoneHash(this.phoneCrypto.hashPhone(identifier));
    if (!account || !account.passwordHash) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        '账号或密码不正确',
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.assertAccountUsable(account);
    const ok = await argon2.verify(account.passwordHash, dto.password);
    if (!ok) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        '账号或密码不正确',
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
    // V1.3 三受限之二：手机号未验证的账号不得走短信找回密码（防冒用号码改密）。
    if (!account.phoneVerifiedAt) {
      throw new BusinessException(
        AuthBusinessCode.PhoneNotVerified,
        '该账号手机号未验证，暂不能通过短信重置密码',
        HttpStatus.FORBIDDEN,
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

  /**
   * 微信小程序登录（V1.3 先行通道）：code 换 openid → 按 user_oauth_binding 找账号，
   * 无则建号（register_channel=wechat_miniapp，无手机无密码）+ 绑定 + self 成员。
   * 带 phoneCode 时一并走微信核验手机号登记（规则见 applyWechatVerifiedPhone）。
   * 未配置 appid/secret 时由 WechatMiniappService 抛 WechatNotConfigured(40312)。
   */
  async wechatMiniappLogin(
    dto: WechatMiniappLoginDto,
    ctx: RequestContext,
  ): Promise<TokenPair & { account: Record<string, unknown> }> {
    const session = await this.wechat.jscode2session(dto.code);
    let account: UserAccount | null = null;
    const binding = await this.prisma.userOauthBinding.findFirst({
      where: { provider: 'wechat', openid: session.openid, unboundAt: null, deletedAt: null },
    });
    if (binding) {
      account = await this.findAccountById(binding.accountId);
    }
    if (!account) {
      const now = new Date();
      const accountId = uuidv7();
      const nickname = `微信用户${session.openid.slice(-4)}`;
      await this.prisma.$transaction(async (tx) => {
        await tx.userAccount.create({
          data: {
            id: accountId,
            nickname,
            registerChannel: 'wechat_miniapp',
            registeredAt: now,
            status: AccountStatus.Active,
            lastLoginAt: now,
          },
        });
        await tx.userOauthBinding.create({
          data: {
            id: uuidv7(),
            accountId,
            provider: 'wechat',
            openid: session.openid,
            unionid: session.unionid ?? null,
            boundAt: now,
          },
        });
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
      account = await this.findAccountById(accountId);
    }
    const acc = account as UserAccount;
    this.assertAccountUsable(acc);
    let current = acc;
    if (dto.phoneCode) {
      const phone = await this.wechat.getPhoneNumber(dto.phoneCode);
      current = await this.applyWechatVerifiedPhone(acc, phone);
    }
    await this.touchLogin(acc.id);
    const tokens = await this.issueTokens(current, dto, ctx);
    return { ...tokens, account: await this.buildAccountView(current) };
  }

  /** 微信绑定（需登录）：openid 已绑他人 → 冲突；已绑本人 → 幂等返回。 */
  async bindWechat(
    accountId: string,
    code: string,
  ): Promise<{ provider: string; bound: boolean }> {
    const session = await this.wechat.jscode2session(code);
    const existing = await this.prisma.userOauthBinding.findFirst({
      where: { provider: 'wechat', openid: session.openid, unboundAt: null, deletedAt: null },
    });
    if (existing) {
      if (existing.accountId !== accountId) {
        throw new BusinessException(
          BusinessCode.Conflict,
          '该微信已绑定其他账号',
          HttpStatus.CONFLICT,
        );
      }
      return { provider: 'wechat', bound: true };
    }
    await this.prisma.userOauthBinding.create({
      data: {
        id: uuidv7(),
        accountId,
        provider: 'wechat',
        openid: session.openid,
        unionid: session.unionid ?? null,
        boundAt: new Date(),
      },
    });
    return { provider: 'wechat', bound: true };
  }

  /** 微信手机号验证（需登录）：getPhoneNumber 的 code 换真号后按统一规则落库/置验证。 */
  async verifyPhoneByWechat(
    accountId: string,
    phoneCode: string,
  ): Promise<Record<string, unknown>> {
    const account = await this.findAccountById(accountId);
    if (!account) {
      throw new BusinessException(BusinessCode.NotFound, '账号不存在', HttpStatus.NOT_FOUND);
    }
    const phone = await this.wechat.getPhoneNumber(phoneCode);
    const updated = await this.applyWechatVerifiedPhone(account, phone);
    return this.buildAccountView(updated);
  }

  /**
   * 微信核验手机号落库规则（账号根不可静默覆盖）：
   * - 账号无手机号：落库并置已验证（号码被他人占用 → 冲突）；
   * - 已有手机号且哈希一致：仅置已验证；
   * - 已有手机号且不一致：PhoneMismatch(40910) 拒绝，不覆盖。
   */
  private async applyWechatVerifiedPhone(
    account: UserAccount,
    phone: string,
  ): Promise<UserAccount> {
    const phoneHash = this.phoneCrypto.hashPhone(phone);
    if (account.phoneHash && account.phoneHash !== phoneHash) {
      throw new BusinessException(
        AuthBusinessCode.PhoneMismatch,
        '微信手机号与账号登记手机号不一致，未做变更；如需更换手机号请联系客服',
        HttpStatus.CONFLICT,
      );
    }
    if (!account.phoneHash) {
      const owner = await this.findAccountByPhoneHash(phoneHash);
      if (owner && owner.id !== account.id) {
        throw new BusinessException(
          BusinessCode.Conflict,
          '该手机号已被其他账号注册',
          HttpStatus.CONFLICT,
        );
      }
      return this.prisma.userAccount.update({
        where: { id: account.id },
        data: {
          phone: this.phoneCrypto.encryptPhone(phone),
          phoneHash,
          phoneVerifiedAt: new Date(),
        },
      });
    }
    if (!account.phoneVerifiedAt) {
      return this.prisma.userAccount.update({
        where: { id: account.id },
        data: { phoneVerifiedAt: new Date() },
      });
    }
    return account;
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
    return this.buildAccountView(account);
  }

  /** 账号视图 + hasWechat（查有效微信绑定；me/profile 共用）。 */
  async buildAccountView(account: UserAccount): Promise<Record<string, unknown>> {
    const binding = await this.prisma.userOauthBinding.findFirst({
      where: { accountId: account.id, provider: 'wechat', unboundAt: null, deletedAt: null },
      select: { id: true },
    });
    return { ...this.toAccountView(account), hasWechat: Boolean(binding) };
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
    let emailMasked: string | null = null;
    if (account.email) {
      try {
        emailMasked = PhoneCryptoService.maskEmail(
          this.phoneCrypto.decryptEmail(account.email),
        );
      } catch {
        emailMasked = null;
      }
    }
    return {
      id: account.id,
      phoneMasked,
      // V1.3 验证状态（hasWechat 由 buildAccountView 异步补齐）
      hasPhone: Boolean(account.phone),
      phoneVerified: Boolean(account.phoneVerifiedAt),
      phoneVerifiedAt: account.phoneVerifiedAt,
      emailMasked,
      hasEmail: Boolean(account.email),
      emailVerified: Boolean(account.emailVerifiedAt),
      emailVerifiedAt: account.emailVerifiedAt,
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

  /* ---------------- 小程序扫码确认登录 Web（2026-10-23 裁定路线） ----------------
   * Web 建票并出示二维码 → 用户在小程序内扫码进入确认页 → 以小程序登录态确认
   * → Web 轮询取票，确认后一次性换发正式会话令牌（与密码登录同路径落会话）。 */

  async createScanTicket(device: DeviceInfoDto): Promise<{
    ticketId: string;
    qrContent: string;
    expiresIn: number;
  }> {
    const ticketId = randomUUID();
    const now = Date.now();
    this.scanTickets.create({
      id: ticketId,
      status: 'pending',
      createdAt: now,
      expiresAt: now + SCAN_TICKET_TTL_MS,
      platform: device.platform ?? 'web',
      deviceName: device.deviceName,
    });
    const webBase = (
      this.config.get<string>('WEB_PUBLIC_URL') ?? 'https://mot.ulife.vip'
    ).replace(/\/$/, '');
    return {
      ticketId,
      // Web 为 hash 路由：落地页 #/scan-login 引导用户在小程序内扫码确认
      qrContent: `${webBase}/#/scan-login?t=${ticketId}`,
      expiresIn: Math.floor(SCAN_TICKET_TTL_MS / 1000),
    };
  }

  /** Web 轮询取票：pending 只报状态；confirmed 一次性换发令牌并销票 */
  async pollScanTicket(
    ticketId: string,
    ctx: RequestContext,
  ): Promise<{ status: 'pending' } | ({ status: 'confirmed' } & TokenPair)> {
    const ticket = this.scanTickets.get(ticketId);
    if (!ticket) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '登录二维码不存在或已过期，请刷新',
        HttpStatus.NOT_FOUND,
      );
    }
    if (ticket.status === 'pending') return { status: 'pending' };
    const account = await this.prisma.userAccount.findFirst({
      where: { id: ticket.accountId!, deletedAt: null },
    });
    if (!account) {
      this.scanTickets.delete(ticketId);
      throw new BusinessException(
        BusinessCode.NotFound,
        '确认账号不可用，请重新扫码',
        HttpStatus.NOT_FOUND,
      );
    }
    this.assertAccountUsable(account);
    const tokens = await this.issueTokens(
      account,
      { platform: ticket.platform ?? 'web', deviceName: ticket.deviceName },
      ctx,
    );
    await this.touchLogin(account.id);
    this.scanTickets.delete(ticketId);
    return { status: 'confirmed', ...tokens };
  }

  /** 小程序端确认：调用者为小程序登录态账号，确认其本人登录网页版 */
  async confirmScanTicket(
    ticketId: string,
    accountId: string,
  ): Promise<{ status: 'confirmed'; nickname: string }> {
    const ticket = this.scanTickets.get(ticketId);
    if (!ticket) {
      throw new BusinessException(
        BusinessCode.NotFound,
        '登录二维码不存在或已过期，请在网页端刷新',
        HttpStatus.NOT_FOUND,
      );
    }
    if (ticket.status === 'confirmed' && ticket.accountId !== accountId) {
      throw new BusinessException(
        BusinessCode.Forbidden,
        '该二维码已被其他账号确认',
        HttpStatus.FORBIDDEN,
      );
    }
    const account = await this.prisma.userAccount.findFirst({
      where: { id: accountId, deletedAt: null },
    });
    if (!account) {
      throw new BusinessException(
        BusinessCode.Unauthorized,
        '账号不存在',
        HttpStatus.UNAUTHORIZED,
      );
    }
    this.assertAccountUsable(account);
    ticket.status = 'confirmed';
    ticket.accountId = accountId;
    return { status: 'confirmed', nickname: account.nickname };
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

  private async findAccountByEmailHash(emailHash: string): Promise<UserAccount | null> {
    return this.prisma.userAccount.findFirst({
      where: { emailHash, deletedAt: null },
    });
  }

  private async findAccountById(id: string): Promise<UserAccount | null> {
    return this.prisma.userAccount.findFirst({
      where: { id, deletedAt: null },
    });
  }
}
