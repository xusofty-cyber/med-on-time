import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** 请求对象上挂的链路 ID（与 AllExceptionsFilter 共用同一取值口径）。 */
export interface TraceCarrier {
  traceId?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * 全局成功信封拦截器（契约口径，2026-10-23 集成收口定版）：
 * 成功响应统一包装为 { code: 0, message: 'ok', traceId, data }。
 * traceId 取请求头 x-trace-id（无则生成 UUID），同时写入 request.traceId，
 * 使异常路径下 AllExceptionsFilter 输出同一个 traceId，前后端可串联排查。
 * 错误响应不经本拦截器（异常过滤器直出 { code, message, traceId }）。
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<TraceCarrier>();
    const headerTrace = request.headers['x-trace-id'];
    const traceId =
      (typeof headerTrace === 'string' && headerTrace.length > 0
        ? headerTrace
        : undefined) ?? randomUUID();
    request.traceId = traceId;
    return next.handle().pipe(
      map((data: unknown) => ({
        code: 0,
        message: 'ok',
        traceId,
        data: data ?? null,
      })),
    );
  }
}
