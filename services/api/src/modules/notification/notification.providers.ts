import { Logger} from '@nestjs/common';
import { uuidv7} from '../../common/utils/uuidv7';

/**
* 通知渠道 Provider 抽象：投递器只面向本接口写 reminder_delivery_log，
* 各渠道的真实网关接入只替换对应实现，投递编排与日志口径不变。
*/

export interface ChannelSendResult {
result: 'success' | 'failed';
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
* 短信渠道：与 auth 验证码 dev stub 同口径——当前只写日志并返回
* 桩消息号，不真实下发。生产环境替换为真实短信网关（腾讯云/阿里云短信）
* 实现同一接口即可，须同时提供手机号解密能力（user_account.phone 为密文）。
*/
export class LogSmsProvider implements NotificationChannelProvider {
readonly channel = 'sms';
private readonly logger = new Logger(LogSmsProvider.name);

async send(ctx: ReminderChannelContext): Promise<ChannelSendResult> {
const providerMsgId = `log-stub:${uuidv7()}`;
this.logger.log(
`[sms-stub] would send reminder sms instance=${ctx.instanceId} recipient=${ctx.recipientAccountId} msg=${providerMsgId}`,
);
return { result: 'success', providerMsgId};
}
}

/**
* App 推送：命中设备（pushToken 非空且 pushEnabled）时调用。
* 生产环境替换为 APNs / FCM / 极光聚合实现同一接口。
*/
export class LogPushProvider implements NotificationChannelProvider {
readonly channel = 'app_push';
private readonly logger = new Logger(LogPushProvider.name);

async send(ctx: ReminderChannelContext): Promise<ChannelSendResult> {
const providerMsgId = `log-stub:${uuidv7()}`;
this.logger.log(
`[push-stub] would push reminder instance=${ctx.instanceId} device=${ctx.deviceId?? '-'} msg=${providerMsgId}`,
);
return { result: 'success', providerMsgId};
}
}

/**
* 微信订阅消息：未接微信订阅消息能力前恒失败留痕（契约口径：微信渠道占位），
* 用户端不应据此判定提醒失败——站内渠道为必达兜底。
*/
export class WechatSubscribePlaceholderProvider
implements NotificationChannelProvider
{
readonly channel = 'wechat_subscribe';

async send(): Promise<ChannelSendResult> {
return { result: 'failed', errorCode: 'WECHAT_SUBSCRIBE_NOT_CONNECTED'};
}
}
