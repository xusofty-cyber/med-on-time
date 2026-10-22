import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * 日志脱敏拦截器（架构红线 4）：病历、用药记录、PII、Token、密码等敏感字段
 * 在日志中必须掩码。请求日志只记 method/path/status/耗时与脱敏后的参数摘要。
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'phone',
  'phone_number',
  'id_card',
  'medical_record',
  'record_text',
  'secret',
  'api_key',
  'apikey',
]);

export function maskSensitive(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '***' : maskSensitive(v, depth + 1);
  }
  return out;
}

@Injectable()
export class LoggingMaskInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      body?: unknown;
    }>();
    const startedAt = Date.now();
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${req.method} ${req.url} ${Date.now() - startedAt}ms body=${JSON.stringify(
            maskSensitive(req.body ?? {}),
          )}`,
        );
      }),
    );
  }
}
