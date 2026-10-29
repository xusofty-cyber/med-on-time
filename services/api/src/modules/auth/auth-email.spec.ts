import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HttpStatus } from '@nestjs/common';
import { LoginByCodeDto, ResetPasswordDto } from './dto/auth.dto';
import { AuthService } from './auth.service';
import {
  VerificationCodeService,
  InMemoryVerificationCodeStore,
  DevStubSmsSender,
} from './services/verification-code.service';
import { DevStubMailSender } from './services/mail-sender.service';
import { PhoneCryptoService } from './services/phone-crypto.service';
import { ConfigService } from '@nestjs/config';
import {
  BusinessCode,
  BusinessException,
} from '../../common/exceptions/business.exception';

describe('Auth Email Dual-Channel Extensions', () => {
  describe('LoginByCodeDto validation', () => {
    it('accepts valid phone and smsCode', async () => {
      const dto = plainToInstance(LoginByCodeDto, {
        phone: '13800138000',
        smsCode: '123456',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts valid email and code', async () => {
      const dto = plainToInstance(LoginByCodeDto, {
        email: 'user@example.com',
        code: '123456',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid email when email provided', async () => {
      const dto = plainToInstance(LoginByCodeDto, {
        email: 'not-an-email',
        code: '123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'email')).toBe(true);
    });

    it('rejects non-6-digit code when email provided', async () => {
      const dto = plainToInstance(LoginByCodeDto, {
        email: 'user@example.com',
        code: '12345',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'code')).toBe(true);
    });

    it('rejects invalid phone when phone provided', async () => {
      const dto = plainToInstance(LoginByCodeDto, {
        phone: '123',
        smsCode: '123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });
  });

  describe('ResetPasswordDto validation', () => {
    it('accepts valid phone and smsCode with newPassword', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        phone: '13800138000',
        smsCode: '123456',
        newPassword: 'Password123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts valid email and code with newPassword', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        email: 'user@example.com',
        code: '123456',
        newPassword: 'Password123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects weak password', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        email: 'user@example.com',
        code: '123456',
        newPassword: 'simple',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'newPassword')).toBe(true);
    });
  });

  describe('VerificationCodeService scene normalization', () => {
    let service: VerificationCodeService;
    let mailSender: DevStubMailSender;

    beforeEach(() => {
      const store = new InMemoryVerificationCodeStore();
      const smsSender = new DevStubSmsSender();
      mailSender = new DevStubMailSender();
      service = new VerificationCodeService(store, smsSender, mailSender);
    });

    it('normalizes reset and reset_password consistently for email', async () => {
      const emailHash = 'test-email-hash';
      const sendResult = await service.sendEmail('test@example.com', emailHash, 'reset_password');
      expect(sendResult.expiresInSeconds).toBeGreaterThan(0);

      // Verify and consume using 'reset' should succeed because it maps to 'reset_password'
      // First get generated code by inspecting store via consume attempt or spying
      const storeGet = (service as any).store.get(`mail:reset_password:${emailHash}`);
      const record = await storeGet;
      expect(record).not.toBeNull();
      const generatedCode = record.code;

      // Consume with 'reset'
      await expect(
        service.verifyEmailAndConsume(emailHash, 'reset', generatedCode),
      ).resolves.toBeUndefined();
    });

    it('can send with scene reset and consume with reset_password', async () => {
      const emailHash = 'test-email-hash-2';
      await service.sendEmail('test@example.com', emailHash, 'reset');
      const record = await (service as any).store.get(`mail:reset_password:${emailHash}`);
      expect(record).not.toBeNull();
      const generatedCode = record.code;

      // Consume with 'reset_password'
      await expect(
        service.verifyEmailAndConsume(emailHash, 'reset_password', generatedCode),
      ).resolves.toBeUndefined();
    });
  });

  describe('AuthService loginByCode & resetPassword channels', () => {
    let authService: AuthService;
    let mockPrisma: any;
    let phoneCrypto: PhoneCryptoService;
    let codeService: VerificationCodeService;
    let tokenService: any;
    let sessionService: any;

    beforeEach(() => {
      const config = new ConfigService({
        PHONE_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        PHONE_HMAC_KEY: 'test-hmac-key',
      });
      phoneCrypto = new PhoneCryptoService(config);

      const store = new InMemoryVerificationCodeStore();
      codeService = new VerificationCodeService(
        store,
        new DevStubSmsSender(),
        new DevStubMailSender(),
      );

      mockPrisma = {
        userAccount: {
          findFirst: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
      };

      tokenService = {
        accessTtlSeconds: 900,
        refreshTtlSeconds: 86400 * 30,
        signRefreshToken: jest.fn().mockReturnValue({ token: 'mock-refresh-token', jti: 'mock-jti' }),
        signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
      };

      sessionService = {
        createSession: jest.fn().mockResolvedValue({}),
        revokeAllSessions: jest.fn().mockResolvedValue(undefined),
      };

      authService = new AuthService(
        mockPrisma as any,
        phoneCrypto,
        tokenService as any,
        sessionService as any,
        codeService,
        {} as any,
        {} as any,
        {
          lockedSeconds: jest.fn().mockResolvedValue(0),
          recordFailure: jest.fn().mockResolvedValue(undefined),
          clear: jest.fn().mockResolvedValue(undefined),
        } as any,
        config,
      );
    });

    it('loginByCode throws BusinessException when neither channel is complete', async () => {
      await expect(authService.loginByCode({} as any, {})).rejects.toThrow(
        new BusinessException(
          BusinessCode.BadRequest,
          '请提供手机号与短信验证码，或邮箱与邮箱验证码',
        ),
      );

      await expect(
        authService.loginByCode({ phone: '13800138000' } as any, {}),
      ).rejects.toThrow('请提供手机号与短信验证码，或邮箱与邮箱验证码');

      await expect(
        authService.loginByCode({ email: 'user@example.com' } as any, {}),
      ).rejects.toThrow('请提供手机号与短信验证码，或邮箱与邮箱验证码');
    });

    it('loginByCode succeeds with email channel and marks emailVerifiedAt if not set', async () => {
      const email = 'login-test@example.com';
      const emailHash = phoneCrypto.hashEmail(email);

      // Issue code
      await codeService.sendEmail(email, emailHash, 'login');
      const record = await (codeService as any).store.get(`mail:login:${emailHash}`);
      const code = record.code;

      const mockAccount = {
        id: 'acc-uuid-1',
        email: phoneCrypto.encryptEmail(email),
        emailHash,
        emailVerifiedAt: null,
        status: 'active',
      };
      mockPrisma.userAccount.findFirst.mockResolvedValue(mockAccount);

      const tokens = await authService.loginByCode(
        { email, code, platform: 'web' },
        { ipAddress: '127.0.0.1' },
      );

      expect(tokens).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 900,
      });

      // Verify emailVerifiedAt was updated
      expect(mockPrisma.userAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-uuid-1' },
          data: expect.objectContaining({ emailVerifiedAt: expect.any(Date) }),
        }),
      );
    });

    it('loginByCode email path throws 404 when email not registered', async () => {
      const email = 'not-found@example.com';
      const emailHash = phoneCrypto.hashEmail(email);
      await codeService.sendEmail(email, emailHash, 'login');
      const record = await (codeService as any).store.get(`mail:login:${emailHash}`);
      const code = record.code;

      mockPrisma.userAccount.findFirst.mockResolvedValue(null);

      await expect(
        authService.loginByCode({ email, code }, {}),
      ).rejects.toThrow(
        new BusinessException(
          BusinessCode.NotFound,
          '该邮箱未注册，请先注册',
          HttpStatus.NOT_FOUND,
        ),
      );
    });

    it('resetPassword throws BusinessException when neither channel is complete', async () => {
      await expect(
        authService.resetPassword({ newPassword: 'Password123' } as any),
      ).rejects.toThrow('请提供手机号与短信验证码，或邮箱与邮箱验证码');
    });

    it('resetPassword succeeds with email channel, updates password and revokes sessions', async () => {
      const email = 'reset-test@example.com';
      const emailHash = phoneCrypto.hashEmail(email);

      await codeService.sendEmail(email, emailHash, 'reset_password');
      const record = await (codeService as any).store.get(`mail:reset_password:${emailHash}`);
      const code = record.code;

      const mockAccount = {
        id: 'acc-uuid-2',
        emailHash,
        emailVerifiedAt: new Date(),
        status: 'active',
      };
      mockPrisma.userAccount.findFirst.mockResolvedValue(mockAccount);

      await authService.resetPassword({
        email,
        code,
        newPassword: 'NewPassword123',
      });

      expect(mockPrisma.userAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-uuid-2' },
          data: expect.objectContaining({ passwordHash: expect.any(String) }),
        }),
      );
      expect(sessionService.revokeAllSessions).toHaveBeenCalledWith('acc-uuid-2');
    });

    it('resetPassword email path throws 404 when email not registered', async () => {
      const email = 'not-found-reset@example.com';
      const emailHash = phoneCrypto.hashEmail(email);
      await codeService.sendEmail(email, emailHash, 'reset');
      const record = await (codeService as any).store.get(`mail:reset_password:${emailHash}`);
      const code = record.code;

      mockPrisma.userAccount.findFirst.mockResolvedValue(null);

      await expect(
        authService.resetPassword({
          email,
          code,
          newPassword: 'NewPassword123',
        }),
      ).rejects.toThrow(
        new BusinessException(
          BusinessCode.NotFound,
          '该邮箱未注册',
          HttpStatus.NOT_FOUND,
        ),
      );
    });
  });
});
