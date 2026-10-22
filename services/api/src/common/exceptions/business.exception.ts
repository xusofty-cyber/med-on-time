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
} as const;
