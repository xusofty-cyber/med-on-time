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
  'newpassword',
  'new_password',
  'oldpassword',
  'old_password',
  'token',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'push_token',
  'pushtoken',
  'authorization',
  'code',
  'smscode',
  'sms_code',
  'verifycode',
  'verify_code',
  'phonecode',
  'phone_code',
  'logincode',
  'login_code',
  'emailcode',
  'email_code',
  'phone',
  'phone_number',
  'phonenumber',
  'contactphone',
  'contact_phone',
  'emergencycontactphone',
  'emergency_contact_phone',
  'email',
  'realname',
  'real_name',
  'id_card',
  'idcard',
  'medical_record',
  'medicalrecord',
  'record_text',
  'recordtext',
  'summary',
  'content',
  'contentsource',
  'content_source',
  'contenthtml',
  'content_html',
  'reaction',
  'description',
  'imagebase64',
  'image_base64',
  'secret',
  'api_key',
  'apikey',
]);

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|api_?key|phone|(?:^|_)(?:sms|verify|login|email)_?code$|email|real_?name|id_?card|medical_?record|record_?text|summary|reaction|description|base64/i;

const MAX_LOG_STRING_LEN = 256;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.has(lower) || SENSITIVE_KEY_PATTERN.test(key);
}

export function maskSensitive(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_LOG_STRING_LEN
      ? `[truncated:${value.length}chars]`
      : value;
  }
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? '***' : maskSensitive(v, depth + 1);
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
