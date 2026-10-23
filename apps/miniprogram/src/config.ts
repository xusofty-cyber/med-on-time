/**
 * 小程序运行配置（统一从此处读取，禁止在业务代码里散落硬编码）。
 *
 * API_BASE：后端 API 基地址（契约基路径 /api，后端默认端口 3000）。
 * - 本地联调：微信开发者工具勾选「不校验合法域名」后可指向本机后端。
 * - 生产环境：必须是 HTTPS 域名，且已在微信公众平台「开发管理 → 开发设置 →
 *   服务器域名」中登记为 request 合法域名，否则真机请求会被平台拦截。
 */
export const API_BASE = 'https://mot.ulife.vip/api';

/**
 * 微信订阅消息模板 ID（用药提醒）。
 *
 * 平台侧待配置（缺一不可）：
 * 1. 在微信公众平台「功能 → 订阅消息」选用/申请用药提醒类模板并审核通过；
 * 2. 把模板 ID 填入下方列表；
 * 3. 后端 wechat_subscribe 投递通道须同步配置同一批模板 ID 才可下发。
 * 列表为空时，订阅入口走占位提示（见 lib/notify.ts）。
 */
export const SUBSCRIBE_TEMPLATE_IDS: string[] = ['2S6XZXrPDUFeIK0TEhQo91bZDvgbPt31bqW7Y1vXgLg'];

export const APP_VERSION = '0.1.0';
