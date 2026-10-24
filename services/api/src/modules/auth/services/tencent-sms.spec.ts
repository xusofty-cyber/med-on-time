import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import {
  AuthBusinessCode,
  BusinessCode,
} from '../../../common/exceptions/business.exception';
import {
  DevStubSmsSender,
  InMemoryVerificationCodeStore,
  VerificationCodeService,
} from './verification-code.service';
import { DevStubMailSender } from './mail-sender.service';
import {
  TencentSmsSender,
  isTencentSmsConfigured,
} from './tencent-sms.service';

const FULL_CONFIG = {
  TENCENT_SMS_SECRET_ID: 'test-secret-id',
  TENCENT_SMS_SECRET_KEY: 'test-secret-key',
  TENCENT_SMS_SDK_APP_ID: '1400000000',
  TENCENT_SMS_SIGN_NAME: '药准时',
  TENCENT_SMS_TEMPLATE_ID_REGISTER: '1000001',
  TENCENT_SMS_TEMPLATE_ID_LOGIN: '1000002',
  TENCENT_SMS_TEMPLATE_ID_RESET: '1000003',
};

describe('Tencent SMS (P0 代码就绪、暂缓上线)', () => {
  describe('isTencentSmsConfigured', () => {
    it('四项配齐才算已配置', () => {
      expect(isTencentSmsConfigured(new ConfigService(FULL_CONFIG))).toBe(true);
      expect(isTencentSmsConfigured(new ConfigService({}))).toBe(false);
      expect(
        isTencentSmsConfigured(
          new ConfigService({ ...FULL_CONFIG, TENCENT_SMS_SIGN_NAME: undefined }),
        ),
      ).toBe(false);
    });
  });

  describe('DevStubSmsSender（未配置时的诚实失败）', () => {
    it('发码抛 40313，不再谎报成功', async () => {
      const stub = new DevStubSmsSender();
      await expect(
        stub.sendVerificationCode('13800138000', '123456', 'register'),
      ).rejects.toMatchObject({
        businessCode: AuthBusinessCode.SmsNotConfigured,
        status: HttpStatus.FORBIDDEN,
      });
    });
  });

  describe('TencentSmsSender', () => {
    it('未配置时抛 40313', async () => {
      const sender = new TencentSmsSender(
        new ConfigService({}),
        { isConfigured: () => false, sendSms: jest.fn() } as any,
      );
      await expect(
        sender.sendVerificationCode('13800138000', '123456', 'register'),
      ).rejects.toMatchObject({
        businessCode: AuthBusinessCode.SmsNotConfigured,
      });
    });

    it('已配置但场景模板未配时抛 40313', async () => {
      const { TENCENT_SMS_TEMPLATE_ID_REGISTER, ...rest } = FULL_CONFIG;
      void TENCENT_SMS_TEMPLATE_ID_REGISTER;
      const sender = new TencentSmsSender(
        new ConfigService(rest),
        { isConfigured: () => true, sendSms: jest.fn() } as any,
      );
      await expect(
        sender.sendVerificationCode('13800138000', '123456', 'register'),
      ).rejects.toMatchObject({
        businessCode: AuthBusinessCode.SmsNotConfigured,
      });
    });

    it('网关成功时 resolve，并按场景取模板、传 6 位码作唯一变量', async () => {
      const gateway = {
        isConfigured: () => true,
        sendSms: jest.fn().mockResolvedValue({ requestId: 'req-1' }),
      };
      const sender = new TencentSmsSender(new ConfigService(FULL_CONFIG), gateway as any);
      await expect(
        sender.sendVerificationCode('13800138000', '123456', 'login'),
      ).resolves.toBeUndefined();
      expect(gateway.sendSms).toHaveBeenCalledWith(
        '13800138000',
        '1000002',
        ['123456'],
      );
    });

    it('网关失败时抛 50000/502，不把原始错误透给前端', async () => {
      const gateway = {
        isConfigured: () => true,
        sendSms: jest.fn().mockRejectedValue(new Error('tencent 500')),
      };
      const sender = new TencentSmsSender(new ConfigService(FULL_CONFIG), gateway as any);
      await expect(
        sender.sendVerificationCode('13800138000', '123456', 'login'),
      ).rejects.toMatchObject({
        businessCode: BusinessCode.InternalError,
        status: HttpStatus.BAD_GATEWAY,
      });
    });
  });

  describe('VerificationCodeService 发码失败语义', () => {
    it('短信发送失败时接口 reject，且刚写入的码被删除（用户未收到的码不残留）', async () => {
      const store = new InMemoryVerificationCodeStore();
      const failingSender = {
        sendVerificationCode: jest.fn().mockRejectedValue(new Error('sms down')),
      } as any;
      const service = new VerificationCodeService(
        store,
        failingSender,
        new DevStubMailSender(),
      );
      await expect(service.send('13800138000', 'hash-1', 'login')).rejects.toThrow(
        'sms down',
      );
      expect(await store.get('sms:login:hash-1')).toBeNull();
    });

    it('邮箱通道（当前唯一可用验证码通道）发码与消费走通', async () => {
      const store = new InMemoryVerificationCodeStore();
      const service = new VerificationCodeService(
        store,
        new DevStubSmsSender(),
        new DevStubMailSender(),
      );
      const res = await service.sendEmail('user@example.com', 'mail-hash', 'login');
      expect(res.expiresInSeconds).toBe(300);
      const record = await store.get('mail:login:mail-hash');
      expect(record).not.toBeNull();
      await expect(
        service.verifyEmailAndConsume('mail-hash', 'login', record!.code),
      ).resolves.toBeUndefined();
      // 一次性消费：再次校验失败
      await expect(
        service.verifyEmailAndConsume('mail-hash', 'login', record!.code),
      ).rejects.toThrow();
    });
  });
});
