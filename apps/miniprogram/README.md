# apps/miniprogram —— 微信小程序（Taro 4 + React）

用户在微信内的用药配置与提醒入口，接口与交互口径与 Web 用户端一致
（依据 `docs/dev/API_CONTRACT.md`，请求层/类型/字典镜像 `apps/web/src/lib`）。

## 页面（4 tab + 子页）

- tab：`pages/index` 今日提醒（时间线、打卡/稍后/跳过、下拉刷新、30 秒轮询到点横幅）、
  `pages/plans` 用药计划、`pages/adherence` 依从统计（周/月汇总 + 月历热力）、`pages/me` 我的
- 子页：`pages/login` 登录（密码/验证码 + 忘记密码重置）、`pages/register` 注册、
  `pages/plan-edit` 计划新建/编辑、`pages/members` 成员管理与关怀设置、
  `pages/authorizations` 照护授权、`pages/notifications` 消息中心与提醒偏好、
  `pages/settings` 设置（资料/会话/订阅/注销说明）

## 构建

```bash
pnpm --filter @med-on-time/miniprogram build      # taro build --type weapp → dist/
pnpm --filter @med-on-time/miniprogram typecheck  # tsc --noEmit
```

用微信开发者工具导入 `dist/`（`project.config.json` 的 `miniprogramRoot` 已指向 dist）。

## 上线前待配置（微信平台侧）

1. **appid**：`project.config.json` 当前为 `touristappid` 占位，换正式小程序 appid。
2. **request 合法域名**：`src/config.ts` 的 `API_BASE` 生产值须为 HTTPS 域名，
   并在公众平台「开发管理 → 开发设置 → 服务器域名」登记；本地联调可勾选「不校验合法域名」。
3. **订阅消息模板**：在公众平台「功能 → 订阅消息」申请用药提醒模板，把模板 ID 填入
   `src/config.ts` 的 `SUBSCRIBE_TEMPLATE_IDS`，且后端 `wechat_subscribe` 通道须同步
   配置同一批模板 ID。未配置前订阅入口走占位提示（见 `src/lib/notify.ts`）。
   注意平台规则：订阅消息必须由用户主动点击触发；小程序无本地定时通知 API，
   程序关闭后的到点触达依赖服务端按订阅授权下发，前台由今日页轮询 + 震动兜底。
4. **tab 图标**：`src/app.config.ts` 的 tabBar 当前为纯文字，UI 图标资源到位后补 `iconPath`。
5. **微信登录与手机号验证**：正式 appid 填 `project.config.json`（与第 1 项为同一 appid）；
   后端 env 须配 `WECHAT_MINIAPP_APPID` / `WECHAT_MINIAPP_SECRET`（在微信公众平台
   「开发管理 → 开发设置」获取，须与小程序 appid 为同一主体）；未配置时微信登录
   返回业务码 40312（微信未配置），前端直接透出后端 message。手机号验证走
   `getPhoneNumber`（微信核验真号，无需短信网关）：登录页微信一键登录后未验证时
   先引导验证，设置页账号资料区也可随时补验。
