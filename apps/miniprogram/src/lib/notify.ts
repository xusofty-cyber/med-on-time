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

export type SubscribeResult = 'ok' | 'unconfigured' | 'denied' | 'error';

/** 拉起用药提醒订阅授权。templateIds 为空时走占位提示，返回 'unconfigured'。 */
export async function requestReminderSubscribe(): Promise<SubscribeResult> {
  if (SUBSCRIBE_TEMPLATE_IDS.length === 0) {
    await Taro.showModal({
      title: '微信提醒订阅',
      content:
        '微信订阅消息模板尚未在公众平台完成申请与配置（模板 ID 待填入 src/config.ts，后端须同步配置）。配置完成后即可在此一键订阅到点提醒；当前请以打开小程序查看今日提醒为准。',
      showCancel: false,
      confirmText: '知道了',
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
      Taro.showToast({ title: '未同意订阅，将无法收到微信到点提醒', icon: 'none', duration: 2400 });
      return 'denied';
    }
    Taro.showToast({ title: '已订阅用药提醒', icon: 'success' });
    return 'ok';
  } catch {
    Taro.showToast({ title: '订阅失败，请稍后重试', icon: 'none' });
    return 'error';
  }
}
