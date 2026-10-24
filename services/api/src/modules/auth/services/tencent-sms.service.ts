import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import {
  AuthBusinessCode,
  BusinessCode,
  BusinessException,
} from '../../../common/exceptions/business.exception';
import { PhoneCryptoService } from './phone-crypto.service';
import {
  SmsSender,
  type SmsScene,
} from './verification-code.service';

/**
 * 腾讯云短信网关（P0，2026-10-25 定版口径：代码就绪、暂缓上线）。
 *
 * 背景：用户为个人，腾讯云短信签名与模板需企业认证方可申请，个人无法开通，
 * 故当前生产不启用真实发送；本实现留在配置开关后（见 isTencentSmsConfigured），
 * 企业认证通过、凭据配齐后无需改代码即可启用。未配置时一律走 DevStubSmsSender
 * 的诚实失败（40313），绝不谎报成功；提醒短信同理（见 notification.providers）。
 *
 * 实现：腾讯云短信官方 SDK tencentcloud-sdk-nodejs-sms（SendSms，ap-guangzhou）。
 * 配置全走环境变量（deploy/.env.example 有完整注释）：
 * - TENCENT_SMS_SECRET_ID / TENCENT_SMS_SECRET_KEY：腾讯云 API 密钥对
 * - TENCENT_SMS_SDK_APP_ID：短信应用 SDKAppID
 * - TENCENT_SMS_SIGN_NAME：已审核通过的短信签名
 * - TENCENT_SMS_TEMPLATE_ID_REGISTER / _LOGIN / _RESET：各场景模板 ID
 *   （模板变量须为单个 {1}=6 位验证码；模板内容与签名须先在控制台过审）
 * - TENCENT_SMS_TEMPLATE_ID_REMINDER：提醒短信模板 ID（提醒渠道用）
 * 密钥绝不写进代码/测试/日志（日志只打掩码手机号与 RequestId）。
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const tencentcloud = require('tencentcloud-sdk-nodejs-sms');

const SMS_REGION = 'ap-guangzhou';

/** 各验证码场景 → 模板 ID 环境变量名 */
const SCENE_TEMPLATE_ENV: Record<SmsScene, string> = {
  register: 'TENCENT_SMS_TEMPLATE_ID_REGISTER',
  login: 'TENCENT_SMS_TEMPLATE_ID_LOGIN',
  reset: 'TENCENT_SMS_TEMPLATE_ID_RESET',
};

/** 腾讯云短信是否已配齐（签名 + 密钥对 + 应用 + 签名名，缺一即未启用） */
export function isTencentSmsConfigured(config: ConfigService): boolean {
  return Boolean(
    config.get<string>('TENCENT_SMS_SECRET_ID') &&
      config.get<string>('TENCENT_SMS_SECRET_KEY') &&
      config.get<string>('TENCENT_SMS_SDK_APP_ID') &&
      config.get<string>('TENCENT_SMS_SIGN_NAME'),
  );
}

/** 取某场景的模板 ID（未配返回 undefined，调用方按“通道未配齐”处理） */
export function getTencentSmsTemplateId(
  config: ConfigService,
  scene: SmsScene,
): string | undefined {
  return config.get<string>(SCENE_TEMPLATE_ENV[scene]);
}

@Injectable()
export class TencentSmsGateway {
  private readonly logger = new Logger(TencentSmsGateway.name);
  private client: any;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return isTencentSmsConfigured(this.config);
  }

  /**
   * 发送一条模板短信。phone 为国内 11 位手机号（自动补 +86）。
   * 成功返回腾讯云 RequestId；任一环节失败抛 Error（调用方转业务异常，
   * 不得把失败吞成成功）。失败信息只含腾讯云返回码，不含密钥与手机号明文。
   */
  async sendSms(
    phone: string,
    templateId: string,
    params: string[],
  ): Promise<{ requestId: string }> {
    const secretId = this.config.get<string>('TENCENT_SMS_SECRET_ID');
    const secretKey = this.config.get<string>('TENCENT_SMS_SECRET_KEY');
    const sdkAppId = this.config.get<string>('TENCENT_SMS_SDK_APP_ID');
    const signName = this.config.get<string>('TENCENT_SMS_SIGN_NAME');
    if (!secretId || !secretKey || !sdkAppId || !signName) {
      throw new Error('TENCENT_SMS_* 未配齐，短信通道未启用');
    }
    if (!this.client) {
      // SDK v4（tencentcloud-sdk-nodejs-sms@4.x）：Client 以 ClientConfig 对象构造，
      // SendSms 入参为普通对象（Models 仅为 TS 类型，无运行时类）。
      const { Client } = tencentcloud.sms.v20210111;
      this.client = new Client({
        credential: { secretId, secretKey },
        region: SMS_REGION,
        profile: {
          httpProfile: {
            reqMethod: 'POST',
            reqTimeout: 10,
            endpoint: 'sms.tencentcloudapi.com',
          },
        },
      });
    }
    let resp: any;
    try {
      resp = await this.client.SendSms({
        SmsSdkAppId: sdkAppId,
        SignName: signName,
        TemplateId: templateId,
        PhoneNumberSet: [`+86${phone.replace(/^\+86/, '')}`],
        TemplateParamSet: params,
      });
    } catch (err) {
      throw new Error(`腾讯云短信调用失败: ${String(err)}`);
    }
    const status = resp?.SendStatusSet?.[0];
    if (!status || status.Code !== 'Ok') {
      throw new Error(
        `腾讯云短信发送失败: code=${status?.Code ?? 'unknown'} message=${status?.Message ?? ''}`,
      );
    }
    this.logger.log(
      `[SMS] phone=${PhoneCryptoService.maskPhone(phone)} template=${templateId} requestId=${resp.RequestId ?? ''} 已发送`,
    );
    return { requestId: resp.RequestId ?? '' };
  }
}

/**
 * 验证码短信发送器（真实实现，配置开关后启用）。
 * 未配置/模板未配 → 抛 40313（通道未开通），不在此静默降级；
 * 网关调用失败 → 抛 50000/502（上游失败），由 VerificationCodeService
 * 删码重抛，发码接口明确返回失败。
 */
@Injectable()
export class TencentSmsSender extends SmsSender {
  private readonly logger = new Logger(TencentSmsSender.name);

  constructor(
    private readonly config: ConfigService,
    private readonly gateway: TencentSmsGateway,
  ) {
    super();
  }

  async sendVerificationCode(
    phone: string,
    code: string,
    scene: SmsScene,
  ): Promise<void> {
    if (!this.gateway.isConfigured()) {
      throw new BusinessException(
        AuthBusinessCode.SmsNotConfigured,
        '短信验证码尚未开通（服务端未配置腾讯云短信），请使用邮箱验证码',
        HttpStatus.FORBIDDEN,
      );
    }
    const templateId = getTencentSmsTemplateId(this.config, scene);
    if (!templateId) {
      this.logger.warn(`短信模板未配置 scene=${scene}（${SCENE_TEMPLATE_ENV[scene]} 为空）`);
      throw new BusinessException(
        AuthBusinessCode.SmsNotConfigured,
        '短信验证码尚未开通（短信模板未配置），请使用邮箱验证码',
        HttpStatus.FORBIDDEN,
      );
    }
    try {
      await this.gateway.sendSms(phone, templateId, [code]);
    } catch (err) {
      // 网关异常已在 gateway 内脱敏；此处转统一业务码，不把原始错误透给前端。
      this.logger.warn(
        `[SMS] scene=${scene} phone=${PhoneCryptoService.maskPhone(phone)} 发送失败: ${String(err)}`,
      );
      throw new BusinessException(
        BusinessCode.InternalError,
        '短信发送失败，请稍后重试或使用邮箱验证码',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
