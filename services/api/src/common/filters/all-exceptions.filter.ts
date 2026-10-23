import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';

/** 全局异常过滤器：统一输出 { code, message, traceId }（架构 §3.3）。 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId =
      (request as { traceId?: string }).traceId ??
      (request.headers['x-trace-id'] as string | undefined) ??
      randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 50000;
    let message = 'Internal server error';

    if (exception instanceof BusinessException) {
      status = exception.getStatus();
      code = exception.businessCode;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status * 100;
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : ((res as { message?: string }).message ?? exception.message);
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error [${traceId}]`, exception.stack);
    }

    response.status(status).json({ code, message, traceId });
  }
}
