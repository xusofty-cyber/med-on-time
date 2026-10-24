# apps/miniprogram —— 微信小程序（Taro 4 + React）

用户在微信内的用药配置与提醒入口，接口与交互口径与 Web 用户端一致
（依据 `docs/dev/API_CONTRACT.md`，请求层/类型/字典镜像 `apps/web/src/lib`）。

## 页面（4 tab + 子页）

- tab：`pages/index` 今日提醒（时间线、打卡/稍后/跳过、下拉刷新、30 秒轮询到点横幅）、
  `pages/plans` 用药计划（含拍照识药入口）、`pages/adherence` 依从统计（周/月汇总 + 月历热力）、`pages/me` 我的
- 子页：`pages/login` 登录（密码/验证码 + 忘记密码重置）、`pages/register` 注册、
  `pages/plan-edit` 计划新建/编辑（含周期与强提醒覆盖 strongAlertModeOverride）、`pages/members` 成员管理与关怀设置（含 strongAlertMode none/alarm/voice）、
  `pages/authorizations` 照护授权、`pages/notifications` 消息中心与提醒偏好、
  `pages/settings` 设置（资料/会话/订阅/注销说明）、`pages/scan-login` 扫码确认登录 Web

## 构建

```bash
pnpm --filter @med-on-time/miniprogram build      # taro build --type weapp → dist/
pnpm --filter @med-on-time/miniprogram typecheck  # tsc --noEmit
```

用微信开发者工具导入 `dist/`（`project.config.json` 的 `miniprogramRoot` 已指向 dist）。

## 当前配置与上线实况（体验版已上线）

1. **正式 AppID**：已配置正式小程序 AppID `wxfc47179d51798ba2`（仓库内 `project.config.json` 保持 `touristappid` 占位以防个人开发者环境冲突，CI/上传脚本按环境变量或本地注入）。
2. **request 合法域名**：`src/config.ts` 已配置生产地址 `API_BASE = 'https://mot.ulife.vip/api'`，并在微信公众平台服务器域名白名单登记。
3. **订阅消息模板**：已在公众平台申请单次用药提醒模板，模板 ID 已填入 `src/config.ts` 的 `SUBSCRIBE_TEMPLATE_IDS`（`2S6XZXrPDUFeIK0TEhQo91bZDvgbPt31bqW7Y1vXgLg`），后端已对齐实发。
4. **功能集成**：已支持小程序一键登录、微信手机号补验、扫码确认登录 Web（`pages/scan-login`）、药品拍照识药以及强提醒配置。体验版 1.0.6 已上传待审。
