import { defineConfig } from 'orval';

/**
 * OpenAPI 是前后端唯一契约（架构 §四）：后端 services/api 以 @nestjs/swagger
 * 在 /api/docs-json 暴露契约，本包据此生成 TS 客户端。
 * 使用：先启动 api（pnpm --filter @med-on-time/api dev），再在根目录执行
 *   pnpm --filter @med-on-time/api-client generate
 * 生成物写入 src/generated/，禁止手改。
 */
export default defineConfig({
  medontime: {
    input: {
      target: 'http://localhost:3000/api/docs-json',
    },
    output: {
      target: './src/generated/api.ts',
      schemas: './src/generated/model',
      client: 'axios',
      mode: 'tags-split',
      clean: true,
    },
  },
});
