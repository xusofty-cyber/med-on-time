import { ConfigService } from '@nestjs/config';
import { TencentSmsReminderProvider } from './notification.providers';
import { PhoneCryptoService } from '../auth/services/phone-crypto.service';

function makeProvider(configValues: Record<string, string>, account: any, gateway: any) {
  const config = new ConfigService(configValues);
  const phoneCrypto = new PhoneCryptoService(config);
  const prisma: any = {
    userAccount: { findUnique: jest.fn().mockResolvedValue(account) },
  };
  return {
    provider: new TencentSmsReminderProvider(prisma, phoneCrypto, config, gateway),
    prisma,
    phoneCrypto,
  };
}

const CTX: any = {
  instanceId: 'inst-1',
  memberId: 'mem-1',
  recipientAccountId: 'acc-1',
  drugNameSnapshot: '阿莫西林',
  doseText: '500mg',
  localTimeText: '08:00',
};

describe('TencentSmsReminderProvider（提醒短信诚实化）', () => {
  it('未配置时返回 failed/SMS_NOT_CONFIGURED，不再记 success', async () => {
    const { provider } = makeProvider({}, { phone: 'x', phoneVerifiedAt: new Date() }, {});
    const res = await provider.send(CTX);
    expect(res).toEqual({ result: 'failed', errorCode: 'SMS_NOT_CONFIGURED' });
  });

  it('手机号未验证时返回 failed/SMS_PHONE_NOT_VERIFIED', async () => {
    const { provider } = makeProvider(
      {
        TENCENT_SMS_SECRET_ID: 'id',
        TENCENT_SMS_SECRET_KEY: 'key',
        TENCENT_SMS_SDK_APP_ID: '1400000000',
        TENCENT_SMS_SIGN_NAME: '药准时',
        TENCENT_SMS_TEMPLATE_ID_REMINDER: '2000001',
      },
      { phone: 'enc', phoneVerifiedAt: null },
      {},
    );
    const res = await provider.send(CTX);
    expect(res).toEqual({ result: 'failed', errorCode: 'SMS_PHONE_NOT_VERIFIED' });
  });

  it('网关成功时返回 success 与短信 RequestId', async () => {
    const configValues = {
      PHONE_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      PHONE_HMAC_KEY: 'test-hmac-key',
      TENCENT_SMS_SECRET_ID: 'id',
      TENCENT_SMS_SECRET_KEY: 'key',
      TENCENT_SMS_SDK_APP_ID: '1400000000',
      TENCENT_SMS_SIGN_NAME: '药准时',
      TENCENT_SMS_TEMPLATE_ID_REMINDER: '2000001',
    };
    const config = new ConfigService(configValues);
    const phoneCrypto = new PhoneCryptoService(config);
    const gateway = { sendSms: jest.fn().mockResolvedValue({ requestId: 'req-9' }) };
    const prisma: any = {
      userAccount: {
        findUnique: jest.fn().mockResolvedValue({
          phone: phoneCrypto.encryptPhone('13800138000'),
          phoneVerifiedAt: new Date(),
        }),
      },
    };
    const provider = new TencentSmsReminderProvider(prisma, phoneCrypto, config, gateway as any);
    const res = await provider.send(CTX);
    expect(res).toEqual({ result: 'success', providerMsgId: 'sms:req-9' });
    expect(gateway.sendSms).toHaveBeenCalledWith(
      '13800138000',
      '2000001',
      ['阿莫西林', '500mg', '08:00'],
    );
  });

  it('网关失败时返回 failed/SMS_SEND_FAILED', async () => {
    const configValues = {
      PHONE_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      PHONE_HMAC_KEY: 'test-hmac-key',
      TENCENT_SMS_SECRET_ID: 'id',
      TENCENT_SMS_SECRET_KEY: 'key',
      TENCENT_SMS_SDK_APP_ID: '1400000000',
      TENCENT_SMS_SIGN_NAME: '药准时',
      TENCENT_SMS_TEMPLATE_ID_REMINDER: '2000001',
    };
    const config = new ConfigService(configValues);
    const phoneCrypto = new PhoneCryptoService(config);
    const gateway = { sendSms: jest.fn().mockRejectedValue(new Error('boom')) };
    const prisma: any = {
      userAccount: {
        findUnique: jest.fn().mockResolvedValue({
          phone: phoneCrypto.encryptPhone('13800138000'),
          phoneVerifiedAt: new Date(),
        }),
      },
    };
    const provider = new TencentSmsReminderProvider(prisma, phoneCrypto, config, gateway as any);
    const res = await provider.send(CTX);
    expect(res).toEqual({ result: 'failed', errorCode: 'SMS_SEND_FAILED' });
  });
});
