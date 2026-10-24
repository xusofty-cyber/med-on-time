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
      .setVersion('0.1.0')
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
