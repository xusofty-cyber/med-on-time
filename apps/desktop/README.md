# apps/desktop —— PC 客户端（Windows / Linux / macOS）

桌面端用户配置与提醒端，定位为**补充提醒**（托盘常驻 + 到点本地通知）。
技术选型已定版：**Electron 31**，复用 `apps/web` 构建产物，主进程 TypeScript（`src/` → `dist/`）。

## 结构

| 文件 | 职责 |
|---|---|
| `src/main.ts` | 单实例锁、窗口（尺寸/位置记忆）、托盘菜单、开机自启、导航守卫、IPC 注册、生命周期 |
| `src/config.ts` | 内容目标解析：`DESKTOP_WEB_URL`（远程）> `WEB_DEV_URL`（开发）> 本地打包产物（`medontime://app` 协议） |
| `src/reminders.ts` | 本地提醒调度：同步当日时间线、定时器到点发系统通知、点击聚焦窗口 |
| `src/store.ts` | userData JSON 状态（窗口边界 + 设置），原子写、坏文件回退默认 |
| `src/preload.ts` | contextBridge 白名单桥 `window.medontimeDesktop` |
| `src/types.ts` | IPC 通道与载荷契约（主/preload 共用） |
| `assets/error.html` | 加载失败重试页 |
| `assets/tray.png` / `build/icon.png` | 托盘与应用图标（医嘱绿 #0B6B4F） |
| `electron-builder.yml` | 打包：win NSIS / mac DMG / linux AppImage；`apps/web/dist` 经 extraResources 随包 |

## 内容加载

- 生产默认加载打包内 Web 产物：打包形态在 `resources/web`，未打包直跑回退 `../../web/dist`；
  经自定义协议 `medontime://app/` 承载（兼容 web 产物的绝对资源路径 + SPA 回退）。
- 部署形态可设环境变量 `DESKTOP_WEB_URL=https://<服务器 Web 地址>` 改为加载远程 URL。
- 加载失败（断网、地址不可达、产物缺失）展示重试页；本地已同步的提醒调度不受页面状态影响。

## 本地提醒契约（web 端接入点）

渲染层（apps/web）登录并拉到今日提醒后调用：

```ts
await window.medontimeDesktop?.syncReminders({
  localDate: '2026-10-23',
  showDrugDetail: careSettings.lockScreenShowDrugDetail, // 默认 false
  items: todayInstances.map(i => ({
    id: i.id,
    scheduledAtUtc: i.scheduledAtUtc,
    drugNameSnapshot: i.drugNameSnapshot,
    doseAmount: i.doseAmount,
    doseUnit: i.doseUnit,
    storageLocation: i.storageLocation,
  })),
});
```

- `showDrugDetail=false` 时系统通知正文**不含药名/剂量**（与锁屏口径一致，契约默认 OFF）。
- 登出/切换成员调用 `clearReminders()` 清空调度；通知点击经 `onReminderActivated(instanceId)` 回调渲染层。
- 同一实例只通知一次；过点 15 分钟内补发，更久不打扰。
- Web 端（`apps/web`）今日提醒页已完整接入该桥（`syncDesktopReminders` / `clearDesktopReminders`），实现 Web 页面与桌面端本地系统通知双向联动。

## 安全基线

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；preload 只暴露白名单桥。
- IPC 通道固定白名单，载荷在主进程做形状校验（条数上限、字段类型）；外部链接一律系统浏览器打开，窗口内导航仅允许应用来源。

## 命令

```bash
pnpm --filter @med-on-time/desktop build       # tsc 编译主进程
pnpm --filter @med-on-time/desktop typecheck
pnpm --filter @med-on-time/desktop dev         # 连 web Vite dev server（5174）
pnpm --filter @med-on-time/desktop start       # 加载本地 web 产物 / DESKTOP_WEB_URL
pnpm --filter @med-on-time/desktop dist        # electron-builder 出包（按当前平台）
```

已知后置项：深色/浅色仅做了窗口背景跟随系统（页面级主题由 web 端 `data-care-mode`/主题实现）；macOS 签名与公证、自动更新在发版阶段接入。
