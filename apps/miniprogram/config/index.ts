import { defineConfig } from '@tarojs/cli';

/**
 * Taro 4 配置（React 写法编译到微信小程序）。
 * appid 在 project.config.json 中配置为正式值后，用微信开发者工具导入 dist/。
 * 订阅消息须用户主动订阅（平台规则），提醒链路细节见架构 §3.2。
 */
export default defineConfig({
  projectName: 'med-on-time-miniprogram',
  date: '2026-10-20',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'vite',
  mini: {},
});
