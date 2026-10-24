import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // 与 apps/web 同理：workspace 软链的 @med-on-time/shared 需显式纳入 commonjs 转换，见 web 侧注释。
  build: {
    commonjsOptions: {
      include: [/packages\/shared\//, /node_modules/],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
