/**
 * 微信订阅消息与本地提醒（占位实现，平台规则约束如下）：
 *
 * 1. 订阅消息必须由用户主动点击触发 Taro.requestSubscribeMessage，且只能使用
 *    在微信公众平台「功能 → 订阅消息」选用/申请并审核通过的模板 ID
 *    （配置在 src/config.ts 的 SUBSCRIBE_TEMPLATE_IDS，当前为空 = 尚未申请）。
 *    后端 wechat_subscribe 投递通道须同步配置同一批模板 ID 才能真正下发。
 * 2. 小程序没有 App 式本地定时通知 API：程序退到后台或关闭后无法本地到点提醒。
 *    到点触达的正式链路 = 服务端生成提醒实例后，按用户的订阅授权下发订阅消息；
 *    程序打开期间的前台兜底 = 今日页 30 秒轮询 + 到点横幅 + 震动（见 pages/index）。
 */
import Taro from '@tarojs/taro';
import { SUBSCRIBE_TEMPLATE_IDS } from '../config';
import { tr } from './i18n';

export type SubscribeResult = 'ok' | 'unconfigured' | 'denied' | 'error';

/** 拉起用药提醒订阅授权。templateIds 为空时走占位提示，返回 'unconfigured'。 */
export async function requestReminderSubscribe(): Promise<SubscribeResult> {
  if (SUBSCRIBE_TEMPLATE_IDS.length === 0) {
    await Taro.showModal({
      title: tr('notify.modalTitle'),
      content: tr('notify.unconfigured'),
      showCancel: false,
      confirmText: tr('notify.gotIt'),
    });
    return 'unconfigured';
  }
  try {
    // @tarojs/taro 4.0.4 的 requestSubscribeMessage 类型定义与微信实际 API 不符
    // （误标 entityIds 必填、结果无索引签名），此处按微信官方签名做最小类型收窄。
    const requestSubscribe = Taro.requestSubscribeMessage as unknown as (opt: {
      tmplIds: string[];
    }) => Promise<Record<string, string>>;
    const res = await requestSubscribe({ tmplIds: SUBSCRIBE_TEMPLATE_IDS });
    const accepted = SUBSCRIBE_TEMPLATE_IDS.some((id) => res[id] === 'accept');
    if (!accepted) {
      Taro.showToast({ title: tr('notify.denied'), icon: 'none', duration: 2400 });
      return 'denied';
    }
    Taro.showToast({ title: tr('notify.subscribed'), icon: 'success' });
    return 'ok';
  } catch {
    Taro.showToast({ title: tr('notify.failed'), icon: 'none' });
    return 'error';
  }
}
