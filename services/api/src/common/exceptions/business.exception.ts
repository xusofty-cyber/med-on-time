import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 统一业务异常（架构红线 2：业务错误必须抛统一封装异常，严禁静默吞掉）。
 * code 为业务码（集中维护于业务码表），与 HTTP 状态分离；全局过滤器输出
 * { code, message, traceId } 标准结构（架构 §3.3）。
 */
export class BusinessException extends HttpException {
  constructor(
    readonly businessCode: number,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(message, status);
  }
}

/** 通用业务码（按模块分段扩展，禁止复用） */
export const BusinessCode = {
  OK: 0,
  BadRequest: 40000,
  Unauthorized: 40100,
  Forbidden: 40300,
  NotFound: 40400,
  Conflict: 40900, // 乐观锁版本冲突（DB §2.2：version 不符返回 409）
  MemberAccessDenied: 40301, // 成员数据隔离拦截
  ReservedEnumValue: 40001, // 提交了预留枚举值（附录 B 纪律：拒绝并记审计）
  InternalError: 50000, // 服务端内部/配置错误
} as const;

/**
 * auth 段业务码（注册验证通道迭代，2026-10-23 定版；见 docs/dev/AUTH_CHANNELS.md）。
 * 40312 与 ai 段 40310（NotEnabled）同为「通道未开通」族，禁止复用其值。
 */
export const AuthBusinessCode = {
  WechatNotConfigured: 40312, // 微信小程序通道未配置（WECHAT_MINIAPP_APPID/SECRET 未配）
  PhoneNotVerified: 40320, // 手机号未验证：禁止开启短信提醒 / 走短信找回密码
  PhoneVerificationRequired: 40321, // 接受照护授权前须先完成手机号验证
  PhoneMismatch: 40910, // 微信核验手机号与账号登记手机号不一致（不静默覆盖账号根）
} as const;
