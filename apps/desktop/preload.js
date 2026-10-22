// 预加载桥：只暴露最小桌面能力给渲染进程（web 应用），不开放 Node 能力。
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('medontimeDesktop', {
  platform: process.platform,
  isDesktop: true,
});
