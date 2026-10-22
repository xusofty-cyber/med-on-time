// Electron 主进程（桌面端定位：补充提醒，复用 apps/web 构建产物）
// 开发：WEB_DEV_URL 指向 web 的 Vite dev server；生产：加载 ../web/dist/index.html
// 自动更新包签名校验在打包阶段接入（通信安全口径，架构 §五）。
const { app, BrowserWindow, Notification } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.WEB_DEV_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../web/dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 供渲染进程经 preload 桥调用的系统通知占位（提醒浮层形态以 web 端实现为准）
global.__medontimeNotify = (title, body) => {
  if (Notification.isSupported()) new Notification({ title, body }).show();
};
