import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import { LoggingMaskInterceptor } from './common/interceptors/logging-mask.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 安全响应头（审查 07 H2：此前 API 与前端 nginx 均无安全头）：
  // JSON API 不下发 CSP（页面级 CSP 在 web/admin 的 nginx 配置里），
  // 这里给所有响应加防嗅探/防点击劫持/来源收敛/HSTS（生产经 HTTPS nginx 反代）。
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    next();
  });
  // 拍照录入走 base64 JSON 直传（单张 ≤5MB → body ≤ ~7MB）；仅放大 JSON 上限，
  // 其余端点本就无大 body 场景，超限由 express 直接 413。
  app.useBodyParser('json', { limit: '8mb' });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    // 定版：whitelist 剥离未声明字段；forbidNonWhitelisted 不开——各端可先行
    // 发送新字段（如计划 cycle 覆盖），后端补声明后即生效，不因未知字段 400。
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // 信封拦截器在最外层：成功响应统一 { code: 0, message: 'ok', traceId, data }
  app.useGlobalInterceptors(new EnvelopeInterceptor(), new LoggingMaskInterceptor());
  app.enableShutdownHooks();

  // OpenAPI 为前后端唯一契约（架构 §四）：仅非生产环境或显式开启 ENABLE_SWAGGER=true 时挂载
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('药准时 MedOnTime API')
      .setDescription('全平台用药提醒系统后端接口契约')
      .setVersion('0.3.4')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
}

void bootstrap();
