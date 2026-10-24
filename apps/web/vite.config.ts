import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // @med-on-time/shared 是 pnpm workspace 软链包：解析后落到 packages/shared/dist（不在 node_modules 内），
  // 默认 commonjs 插件只处理 node_modules，跳过它后 Rollup 无法追踪 CJS __exportStar 重导出，导致“枚举未导出”报错。
  // 显式纳入后由 commonjs 插件转换，Web/Admin 才能直接复用 shared 的 CJS dist。
  build: {
    commonjsOptions: {
      include: [/packages\/shared\//, /node_modules/],
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
