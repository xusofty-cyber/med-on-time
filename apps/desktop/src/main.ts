/**
 * 药准时桌面端主进程（Electron）。
 * 定位：补充提醒 —— 承载 apps/web 构建产物（或远程 Web URL），托盘常驻 + 到点本地通知。
 */
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  Notification,
  protocol,
  screen,
  shell,
  Tray,
} from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { APP_HOST, APP_SCHEME, allowedNavigationPrefixes, localBundleExists, resolveContentTarget } from './config';
import type { ContentTarget } from './config';
import { ReminderScheduler, sanitizePayload } from './reminders';
import { flushState, getState, updateState } from './store';
import { IPC_CHANNELS } from './types';
import type { DesktopSettings } from './types';

// 自定义协议须在 app ready 前登记为特权协议
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const target: ContentTarget = resolveContentTarget();
const errorPagePath = path.join(__dirname, '..', 'assets', 'error.html');
const preloadPath = path.join(__dirname, 'preload.js');
const trayIconPath = path.join(__dirname, '..', 'assets', 'tray.png');
const buildIconPath = path.join(
  __dirname,
  '..',
  'build',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
);
const windowIconPath = fs.existsSync(buildIconPath) ? buildIconPath : trayIconPath;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// ---------------------------------------------------------------- 提醒调度
const scheduler = new ReminderScheduler(
  (instanceId) => {
    showMainWindow();
    mainWindow?.webContents.send(IPC_CHANNELS.reminderActivated, instanceId);
  },
  () => refreshTrayMenu(),
);

// ---------------------------------------------------------------- 内容协议
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const API_UPSTREAM_ORIGIN = 'https://mot.ulife.vip';

function registerLocalProtocol(webRoot: string): void {
  const rootResolved = path.resolve(webRoot);
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== APP_HOST) return new Response('not found', { status: 404 });

      // 协议层转发 /api 请求至生产后端，透传方法、请求头、请求体，异常时返回 502
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const targetUrl = `${API_UPSTREAM_ORIGIN}${url.pathname}${url.search}`;
        const method = request.method;
        const headers = new Headers();
        request.headers.forEach((value, key) => {
          if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            headers.set(key, value);
          }
        });

        const isBodyAllowed = method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD';
        const body = isBodyAllowed ? await request.arrayBuffer() : undefined;

        try {
          return await net.fetch(targetUrl, {
            method,
            headers,
            body,
          });
        } catch {
          return new Response(
            JSON.stringify({ code: 502, message: '网络不可用，请稍后重试', data: null }),
            {
              status: 502,
              headers: { 'content-type': 'application/json; charset=utf-8' },
            },
          );
        }
      }

      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      let filePath = path.resolve(rootResolved, rel);
      if (filePath !== rootResolved && !filePath.startsWith(rootResolved + path.sep)) {
        return new Response('forbidden', { status: 403 });
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        // SPA 回退：无扩展名的路由路径回 index.html；静态资源缺失则 404
        if (path.extname(rel)) return new Response('not found', { status: 404 });
        filePath = path.join(rootResolved, 'index.html');
      }
      const data = await fs.promises.readFile(filePath);
      const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': type } });
    } catch {
      return new Response('internal error', { status: 500 });
    }
  });
}

// ---------------------------------------------------------------- 窗口
function isVisibleOnSomeDisplay(b: { x?: number; y?: number; width: number; height: number }): boolean {
  if (b.x == null || b.y == null) return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    const overlapX = Math.min(b.x! + b.width, a.x + a.width) - Math.max(b.x!, a.x);
    const overlapY = Math.min(b.y! + b.height, a.y + a.height) - Math.max(b.y!, a.y);
    return overlapX >= 100 && overlapY >= 60;
  });
}

function themedBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#0f1512' : '#ffffff';
}

function createWindow(): BrowserWindow {
  const saved = getState().window;
  const usable = isVisibleOnSomeDisplay(saved);
  const win = new BrowserWindow({
    x: usable ? saved.x : undefined,
    y: usable ? saved.y : undefined,
    width: saved.width,
    height: saved.height,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: themedBackground(),
    title: '药准时 MedOnTime',
    icon: process.platform !== 'darwin' ? windowIconPath : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (saved.isMaximized) win.maximize();

  const persistBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    updateState((s) => {
      s.window = { ...b, isMaximized: win.isMaximized() };
    });
  };
  win.on('resize', persistBounds);
  win.on('move', persistBounds);

  // 关闭 = 隐藏到托盘（提醒常驻），真正退出走托盘菜单 / 系统退出
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
    persistBounds();
    flushState();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  guardNavigation(win);
  void loadContent(win, true);
  return win;
}

async function loadContent(win: BrowserWindow, first = false): Promise<void> {
  if (!localBundleExists(target)) {
    console.warn('[desktop] local web bundle missing, showing error page');
    await win.loadFile(errorPagePath).catch(() => undefined);
    return;
  }
  try {
    await win.loadURL(target.url);
  } catch (err) {
    console.warn(`[desktop] load failed (${first ? 'initial' : 'retry'}): ${String(err)}`);
    await win.loadFile(errorPagePath).catch(() => undefined);
  }
}

function guardNavigation(win: BrowserWindow): void {
  const prefixes = allowedNavigationPrefixes(target, errorPagePath);
  const isInternal = (url: string) => prefixes.some((p) => url.startsWith(p));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isInternal(url)) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) void win.loadFile(errorPagePath).catch(() => undefined);
  });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------------------------------------------------------------- 开机自启
function applyAutoLaunch(enabled: boolean): void {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
    }
    return;
  }
  // Linux：写 ~/.config/autostart 桌面项（仅打包形态有稳定可执行路径）
  try {
    const dir = path.join(app.getPath('home'), '.config', 'autostart');
    const file = path.join(dir, 'medontime.desktop');
    if (enabled && app.isPackaged) {
      const escapedExec = `"${process.execPath.replace(/"/g, '\\"')}"`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        file,
        `[Desktop Entry]\nType=Application\nName=MedOnTime\nExec=${escapedExec}\nX-GNOME-Autostart-enabled=true\n`,
        'utf-8',
      );
    } else if (fs.existsSync(file)) {
      fs.rmSync(file);
    }
  } catch {
    // 自启设置失败不阻断主流程
  }
}

function currentSettings(): DesktopSettings {
  return { autoLaunch: getState().settings.autoLaunch, platform: process.platform, version: app.getVersion() };
}

// ---------------------------------------------------------------- 托盘
function refreshTrayMenu(): void {
  if (!tray) return;
  const s = scheduler.summary();
  const overview = !s.synced
    ? '今日提醒概览（登录后同步）'
    : s.total === 0
      ? '今日暂无服药提醒'
      : `今日提醒：共 ${s.total} 次，待服 ${s.remaining} 次`;
  const nextLine = s.nextLocalTime ? `下一次提醒：${s.nextLocalTime}` : '下一次提醒：无';
  const menu = Menu.buildFromTemplate([
    { label: '打开药准时', click: () => showMainWindow() },
    { type: 'separator' },
    { label: overview, enabled: false },
    { label: nextLine, enabled: false },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: getState().settings.autoLaunch,
      click: (item) => {
        updateState((st) => {
          st.settings.autoLaunch = item.checked;
        });
        applyAutoLaunch(item.checked);
        refreshTrayMenu();
      },
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(s.remaining > 0 ? `药准时：今日待服 ${s.remaining} 次` : '药准时 MedOnTime');
}

function createTray(): void {
  tray = new Tray(trayIconPath);
  tray.on('click', () => showMainWindow());
  refreshTrayMenu();
}

// ---------------------------------------------------------------- IPC（白名单）
function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.syncReminders, (_e, payload: unknown) => {
    const clean = sanitizePayload(payload);
    if (!clean) throw new Error('invalid reminders payload');
    return { accepted: scheduler.sync(clean) };
  });
  ipcMain.handle(IPC_CHANNELS.clearReminders, () => scheduler.clear());
  ipcMain.handle(IPC_CHANNELS.reminderSummary, () => scheduler.summary());
  ipcMain.handle(IPC_CHANNELS.getSettings, () => currentSettings());
  ipcMain.handle(IPC_CHANNELS.setAutoLaunch, (_e, enabled: unknown) => {
    const on = enabled === true;
    updateState((s) => {
      s.settings.autoLaunch = on;
    });
    flushState();
    applyAutoLaunch(on);
    refreshTrayMenu();
    return currentSettings();
  });
  ipcMain.handle(IPC_CHANNELS.retryLoad, async () => {
    if (mainWindow) await loadContent(mainWindow);
  });
}

// ---------------------------------------------------------------- 生命周期
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    if (target.kind === 'local') registerLocalProtocol(target.webRoot);
    registerIpc();
    applyAutoLaunch(getState().settings.autoLaunch);
    scheduler.restore();
    mainWindow = createWindow();
    createTray();
    nativeTheme.on('updated', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(themedBackground());
    });
    app.on('activate', () => showMainWindow());
    console.info(
      `[desktop] ready, content=${target.kind}, notifications=${Notification.isSupported()}`,
    );
  });

  app.on('before-quit', () => {
    isQuitting = true;
    flushState();
  });
  // 常驻托盘：所有窗口关闭也不退出（退出走托盘菜单）
  app.on('window-all-closed', () => undefined);
}
