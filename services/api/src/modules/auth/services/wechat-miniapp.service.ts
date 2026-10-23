import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpsRequest } from 'https';
import {
  AuthBusinessCode,
  BusinessCode,
  BusinessException,
} from '../../../common/exceptions/business.exception';

export interface WechatSession {
  openid: string;
  unionid?: string;
}

interface WechatErrorBody {
  errcode?: number;
  errmsg?: string;
  [key: string]: unknown;
}

/**
 * 微信小程序服务端对接（V1.3 注册验证通道）。
 * 配置经环境变量注入：WECHAT_MINIAPP_APPID / WECHAT_MINIAPP_SECRET（公众平台
 * 「开发管理 → 开发设置」获取，须与小程序 appid 同一主体）。未配置时全部入口
 * 抛 WechatNotConfigured(40312)，不伪造登录态（配置隔离与日志脱敏红线：
 * secret 只进请求 URL，不落任何日志）。
 * access_token 内存缓存（带过期，提前 300 秒刷新）；多实例部署时各实例独立
 * 缓存会互相顶号，生产多副本前须改集中式 token 中控（见 AUTH_CHANNELS.md）。
 */
@Injectable()
export class WechatMiniappService {
  private readonly logger = new Logger(WechatMiniappService.name);
  private readonly appid: string | undefined;
  private readonly secret: string | undefined;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.appid = this.config.get<string>('WECHAT_MINIAPP_APPID');
    this.secret = this.config.get<string>('WECHAT_MINIAPP_SECRET');
    if (!this.isConfigured()) {
      this.logger.warn(
        'WECHAT_MINIAPP_APPID / WECHAT_MINIAPP_SECRET 未配置，微信登录与微信手机号验证未开通（调用返回 40312）',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.appid && this.secret);
  }

  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new BusinessException(
        AuthBusinessCode.WechatNotConfigured,
        '微信登录尚未开通（服务端未配置小程序 appid/secret）',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** wx.login 的 code 换 openid/unionid（sns/jscode2session）。 */
  async jscode2session(code: string): Promise<WechatSession> {
    this.assertConfigured();
    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${encodeURIComponent(this.appid as string)}` +
      `&secret=${encodeURIComponent(this.secret as string)}` +
      `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const data = (await this.requestJson('GET', url)) as WechatErrorBody & {
      openid?: string;
      unionid?: string;
    };
    if (data.errcode || !data.openid) {
      this.logger.warn(`jscode2session 失败 errcode=${data.errcode} errmsg=${data.errmsg}`);
      throw new BusinessException(BusinessCode.BadRequest, '微信登录失败，请重试');
    }
    return { openid: data.openid, unionid: data.unionid };
  }

  /**
   * getPhoneNumber 的 phoneCode 换微信核验手机号（wxa/business/getuserphonenumber）。
   * 返回无区号的 11 位号码（优先 purePhoneNumber；仅 phoneNumber 时剥 +86 前缀）。
   */
  async getPhoneNumber(phoneCode: string): Promise<string> {
    this.assertConfigured();
    const token = await this.getAccessToken();
    const url =
      'https://api.weixin.qq.com/wxa/business/getuserphonenumber' +
      `?access_token=${encodeURIComponent(token)}`;
    const data = (await this.requestJson('POST', url, { code: phoneCode })) as WechatErrorBody & {
      phone_info?: { phoneNumber?: string; purePhoneNumber?: string; countryCode?: string };
    };
    if (data.errcode || !data.phone_info) {
      this.logger.warn(`getuserphonenumber 失败 errcode=${data.errcode} errmsg=${data.errmsg}`);
      throw new BusinessException(BusinessCode.BadRequest, '微信手机号获取失败，请重试');
    }
    const raw = data.phone_info.purePhoneNumber ?? data.phone_info.phoneNumber ?? '';
    const digits = raw.replace(/\D/g, '');
    const phone = digits.length === 13 && digits.startsWith('86') ? digits.slice(2) : digits;
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      throw new BusinessException(BusinessCode.BadRequest, '微信返回的手机号格式异常，请重试');
    }
    return phone;
  }

  /**
   * 发送订阅消息（cgi-bin/message/subscribe/send）。不抛业务异常：
   * 返回微信 errcode 由调用方（通知渠道）映射为投递结果留痕
   * （43101=用户未订阅/一次性额度不足，47003=参数不符，40037=模板无效）。
   */
  async sendSubscribeMessage(params: {
    openid: string;
    templateId: string;
    page?: string;
    mpState?: string;
    data: Record<string, { value: string }>;
  }): Promise<{ errcode: number; errmsg?: string; msgid?: number }> {
    this.assertConfigured();
    const token = await this.getAccessToken();
    const url =
      'https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=' +
      encodeURIComponent(token);
    const res = (await this.requestJson('POST', url, {
      touser: params.openid,
      template_id: params.templateId,
      page: params.page,
      miniprogram_state: params.mpState ?? 'formal',
      lang: 'zh_CN',
      data: params.data,
    })) as WechatErrorBody & { msgid?: number };
    return { errcode: res.errcode ?? 0, errmsg: res.errmsg, msgid: res.msgid };
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }
    const url =
      'https://api.weixin.qq.com/cgi-bin/token' +
      `?grant_type=client_credential&appid=${encodeURIComponent(this.appid as string)}` +
      `&secret=${encodeURIComponent(this.secret as string)}`;
    const data = (await this.requestJson('GET', url)) as WechatErrorBody & {
      access_token?: string;
      expires_in?: number;
    };
    if (data.errcode || !data.access_token) {
      this.logger.warn(`cgi-bin/token 失败 errcode=${data.errcode} errmsg=${data.errmsg}`);
      throw new BusinessException(BusinessCode.BadRequest, '微信服务暂不可用，请稍后重试');
    }
    const ttlSeconds = Math.max(60, (data.expires_in ?? 7200) - 300);
    this.tokenCache = { token: data.access_token, expiresAt: Date.now() + ttlSeconds * 1000 };
    return data.access_token;
  }

  private requestJson(
    method: 'GET' | 'POST',
    url: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const req = httpsRequest(
        url,
        {
          method,
          timeout: 10_000,
          headers: payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : undefined,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
            } catch {
              reject(new BusinessException(BusinessCode.BadRequest, '微信服务响应异常，请稍后重试'));
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('wechat request timeout')));
      req.on('error', (err) => {
        this.logger.warn(`微信接口请求失败：${err.message}`);
        reject(new BusinessException(BusinessCode.BadRequest, '微信服务暂不可用，请稍后重试'));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }
}
