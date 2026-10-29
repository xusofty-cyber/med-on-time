import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uuidv7 } from '../../common/utils/uuidv7';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WechatMiniappService } from '../auth/services/wechat-miniapp.service';
import { PhoneCryptoService } from '../auth/services/phone-crypto.service';
import {
  TencentSmsGateway,
  isTencentSmsConfigured,
} from '../auth/services/tencent-sms.service';

/**
* 通知渠道 Provider 抽象：投递器只面向本接口写 reminder_delivery_log，
* 各渠道的真实网关接入只替换对应实现，投递编排与日志口径不变。
*/

export interface ChannelSendResult {
/** success/failed 为真实投递结果；suppressed_* 为未下发的终局状态（去重/通道未配置等） */
result: 'success' | 'failed' | 'suppressed_dedup' | 'suppressed_not_configured';
providerMsgId?: string;
errorCode?: string;
}

export interface ReminderChannelContext {
instanceId: string;
memberId: string;
recipientAccountId: string;
/** 具体设备（app_push 时传入命中的设备行） */
deviceId?: string;
drugNameSnapshot: string;
doseText: string;
/** 成员本地时刻快照 HH:mm，供文案渲染 */
localTimeText: string;
}

export interface NotificationChannelProvider {
readonly channel: string;
send(ctx: ReminderChannelContext): Promise<ChannelSendResult>;
}

/**
* 站内通知：投递日志行本身即站内通知记录（channel=in_app 的行就是通知收件箱数据源），
* 故本 provider 恒定成功，落库动作由 NotificationService 统一完成。
*/
export class InAppProvider implements NotificationChannelProvider {
readonly channel = 'in_app';
async send(): Promise<ChannelSendResult> {
return { result: 'success', providerMsgId: `inapp:${uuidv7()}`};
}
}

/**
 * 短信渠道：腾讯云短信网关（TencentSmsGateway，配置开关后启用）+ 手机号解密。
 * 未配置 / 模板未配 / 手机号未验证 / 解密失败 / 网关失败时一律返回 failed
 * （errorCode 见下），绝不再像旧 LogSmsProvider 那样只打日志就记 success——
 * 失败行会如实落库（result='failed'），且站内通知列表默认不再展示失败行。
 * 提醒模板 TENCENT_SMS_TEMPLATE_ID_REMINDER 的变量须与此处 TemplateParamSet
 * 逐字对应：{1}=药品名 {2}=剂量 {3}=服药时间 HH:mm（企业认证过审后方可申请）。
 */
export class TencentSmsReminderProvider implements NotificationChannelProvider {
  readonly channel = 'sms';
  private readonly logger = new Logger(TencentSmsReminderProvider.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneCrypto: PhoneCryptoService,
    private readonly config: ConfigService,
    private readonly gateway: TencentSmsGateway,
  ) {}

  async send(ctx: ReminderChannelContext): Promise<ChannelSendResult> {
    if (!isTencentSmsConfigured(this.config)) {
      this.logger.warn(
        `[sms] 腾讯云短信未配置，提醒短信未发送 instance=${ctx.instanceId} recipient=${ctx.recipientAccountId}（SMS_NOT_CONFIGURED）`,
      );
      return { result: 'failed', errorCode: 'SMS_NOT_CONFIGURED' };
    }
    const templateId = this.config.get<string>('TENCENT_SMS_TEMPLATE_ID_REMINDER');
    if (!templateId) {
      return { result: 'failed', errorCode: 'SMS_TEMPLATE_NOT_CONFIGURED' };
    }
    const account = await this.prisma.userAccount.findUnique({
      where: { id: ctx.recipientAccountId },
      select: { phone: true, phoneVerifiedAt: true },
    });
    if (!account?.phone || !account.phoneVerifiedAt) {
      return { result: 'failed', errorCode: 'SMS_PHONE_NOT_VERIFIED' };
    }
    let phone: string;
    try {
      phone = this.phoneCrypto.decryptPhone(account.phone);
    } catch {
      return { result: 'failed', errorCode: 'SMS_PHONE_DECRYPT_FAILED' };
    }
    try {
      const { requestId } = await this.gateway.sendSms(
        phone,
        templateId,
        [ctx.drugNameSnapshot, ctx.doseText, ctx.localTimeText],
      );
      return { result: 'success', providerMsgId: `sms:${requestId}` };
    } catch (err) {
      this.logger.warn(
        `[sms] 提醒短信发送失败 instance=${ctx.instanceId} recipient=${ctx.recipientAccountId}: ${String(err)}`,
      );
      return { result: 'failed', errorCode: 'SMS_SEND_FAILED' };
    }
  }
}

/**
* App 推送（日志桩，真实通道未接入）：
* 诚实口径（2026-10-30 审查 H-5）——APNs / FCM / 极光均未接入，本提供方
* 并未真正下发任何推送，禁止再记 success 假成功（会污染送达统计并触发
* 跨渠道去重误判）。固定返回 suppressed_not_configured；接入真实通道时
* 替换本实现并恢复 success 语义（同一接口）。
*/
export class LogPushProvider implements NotificationChannelProvider {
readonly channel = 'app_push';
private readonly logger = new Logger(LogPushProvider.name);

async send(ctx: ReminderChannelContext): Promise<ChannelSendResult> {
this.logger.warn(
`[push-not-configured] no real push provider configured; suppressed instance=${ctx.instanceId} device=${ctx.deviceId?? '-'}`,
);
return { result: 'suppressed_not_configured', errorCode: 'PUSH_NOT_CONFIGURED' };
}
}

/**
* 微信订阅消息（真实实现，2026-10-23 接入）：模板「服药提醒」
* （priTmplId 见环境变量 WECHAT_SUBSCRIBE_TEMPLATE_ID；字段 thing1=服药人、
* time2=服药时间 HH:mm——与公众平台选用模板的关键词参数逐字对应）。
* 收件人 openid 取 user_oauth_binding(provider='wechat')；未绑定/未订阅
* （一次性订阅额度不足，微信 errcode 43101）均以业务码失败留痕，
* 用户端不应据此判定提醒失败——站内渠道为必达兜底。
* miniprogram_state 由 WECHAT_SUBSCRIBE_MP_STATE 控制（体验期 trial，发布后 formal）。
*/
export class WechatSubscribeProvider implements NotificationChannelProvider {
readonly channel = 'wechat_subscribe';
private readonly logger = new Logger(WechatSubscribeProvider.name);

constructor(
private readonly prisma: PrismaService,
private readonly wechat: WechatMiniappService,
private readonly templateId: string | undefined,
private readonly mpState: string,
) {}

async send(ctx: ReminderChannelContext): Promise<ChannelSendResult> {
if (!this.templateId) {
return { result: 'failed', errorCode: 'WECHAT_SUBSCRIBE_NOT_CONFIGURED'};
}
if (!this.wechat.isConfigured()) {
return { result: 'failed', errorCode: 'WECHAT_NOT_CONFIGURED'};
}
const binding = await this.prisma.userOauthBinding.findFirst({
where: {
accountId: ctx.recipientAccountId,
provider: 'wechat',
unboundAt: null,
deletedAt: null,
},
});
if (!binding) {
return { result: 'failed', errorCode: 'WECHAT_NOT_BOUND'};
}
const member = await this.prisma.member.findUnique({
where: { id: ctx.memberId},
select: { displayName: true},
});
const who = (member?.displayName ?? '家人').slice(0, 20);
const res = await this.wechat.sendSubscribeMessage({
openid: binding.openid,
templateId: this.templateId,
page: 'pages/index/index',
mpState: this.mpState,
data: {
thing1: { value: who},
time2: { value: ctx.localTimeText},
},
});
if (res.errcode === 0) {
return {
result: 'success',
providerMsgId: res.msgid ? `wx:${res.msgid}` : `wx:${uuidv7()}`,
};
}
if (res.errcode === 43101) {
return { result: 'failed', errorCode: 'WECHAT_SUBSCRIBE_NO_CREDIT'};
}
if (res.errcode === 47003) {
return { result: 'failed', errorCode: 'WECHAT_SUBSCRIBE_BAD_ARGS'};
}
if (res.errcode === 40037) {
return { result: 'failed', errorCode: 'WECHAT_SUBSCRIBE_BAD_TEMPLATE'};
}
this.logger.warn(
`订阅消息发送失败 errcode=${res.errcode} errmsg=${res.errmsg ?? ''} instance=${ctx.instanceId}`,
);
return { result: 'failed', errorCode: `WECHAT_ERR_${res.errcode}`};
}
}
