# 各端概要设计（实建版，2026-10-23）

> 本文件按**已落地代码**描述各端结构与关键流程，是概要设计层面的实建说明；详细设计以 `API_CONTRACT.md`（接口与口径）+ `services/api/prisma/schema.prisma`（数据模型权威）+ 各端代码为准。设计基线（需求/DB/UI/架构定稿）见 `docs/README.md` 索引。

## 一、后端 services/api（NestJS 10 + Prisma 5 + BullMQ/Redis 7）

- **分层红线**：Controller 只做参数与守卫，逻辑在 Service；成员域查询必须先过成员隔离（resolveMemberAccess / MemberAccessGuard 口径）；全局信封 `{code, message, traceId, data}`（EnvelopeInterceptor）、全局异常过滤、ValidationPipe（whitelist 剥离未声明字段）。
- **模块地图**（`src/modules/`）：
  - `auth`：注册/登录（密码 + 邮箱码 + 微信小程序）、JWT 签发与会话（user_session 现为内存实现 + access 2h 兜底，见 INTEGRATION_NOTES 候选清单）、手机号/邮箱加解密与哈希（PhoneCryptoService）、MailSender 抽象（SMTP 实发 / 未配时掩码日志桩）。
  - `account`：资料、注销申请（30 天冷静期）、登录会话列表（形状 `{items,total}`）。
  - `member`：成员 CRUD（上限 10/账号）、关怀设置（system_config KV：member_care_settings:<memberId>）、成员列表 `{own, authorized}` 分组口径。
  - `authorization`：照护授权全生命周期（上限 5 照护人/成员）、authorization_log 双记录、接受时 V1.3 三受限校验（40321/40910）。
  - `drug`：药品检索（trgm 模糊）、说明书详情、相互作用（说明书结构化字段 + ONC 硬检）；seed 为 `prisma/seeds/drug_seed_200.json`（182 approved / 18 pending_review）。
  - `plan`：计划与条目/阶段、frequency_rule 定版校验、变更历史（双记）、cycle 覆盖（KV plan_cycle_override:<planId>）与 strongAlertMode 强提醒覆盖。
  - `reminder`：实例生成（每小时 :05 节拍 + 启动补跑预生成次日实例，且计划变更时当日即时补生成 generateTodayUpcoming，幂等键 + 唯一约束兜底）、投递 Worker（cycle 重复提醒、snooze、missed 扫描）、实例视图含 R-1 字段（plan.storageLocation/additionalNote、planItem.mealRelation）。
  - `checkin` / `adherence`：打卡落 intake_record（扣库存 + 刷新依从）、汇总/日历口径（成员本地墙钟）。
  - `stock`：成员药品库存、adjust 流水、到期/低库存预警（视图字段 memberMedicationId/drug/alerts/expiryStatus/estimatedDaysLeft）。
  - `ehr`：过敏档案（GET/PUT 整体替换，drug/drug_category 结构化引用校验）、不适记录（关联服药事件**可选**）、紧急联系人（上限 3，电话加密存、明文回显本人视图）、健康概况（单条 upsert，summary 加密）。
  - `notification`：站内通知、渠道偏好（KV notification_prefs:<accountId>；开短信须手机号已验证 40320）、短信为 dev stub、微信小程序一次性订阅消息已实现真实下发。
  - `content`：文章（简/繁/英内容组）、协议版本。
  - `admin`：后台全域（登录、仪表盘、账号冻结/解冻、药品双人核验、计划监管、内容、公众号文章管理、大模型配置、纠纷裁决、审计、应用版本、seed 导入）。
  - `ai`：网关占位——未过 POC-2 评测与外部医学审校前一律返回「未开通」（40310）。
  - `wechat-oa`：微信公众号文章草稿管理与微信草稿箱同步（local/synced/dirty 三态）。
  - `ops`：/ops/health、/ops/ready、/ops/metrics。
- **数据**：Prisma schema 为模型权威（58 表）；迁移在 `prisma/migrations/`（基线 + 约束分区 + V1.3~V1.5 迁移，共 5 段，均已在生产实跑）。
- **构建/运行**：`pnpm --filter @med-on-time/api build` → `node dist/src/main.js`；生产镜像运行阶段须 `prisma generate`（pnpm deploy 产物不带生成客户端）。

## 二、后台管理 apps/admin（React 18 + Ant Design 5 + Vite）

- 路由：/dashboard /accounts /members /drugs /plans /content（文章/协议/公众号文章多页签）/disputes /audit /system/app-versions /system/ai-providers；React Router + 受保护布局。
- 接口层：`src/api/admin.ts` + `src/services/request.ts`——全程 PageData `{items,total}` 口径消费（与后端口径一致），ProTable 适配在 request 层完成。
- 权限：管理员独立 JWT（aud=admin），角色 super_admin/operator/cs_agent/medical_reviewer；药品核验为双人两段（reviewer ≠ verifier）。
- 构建：独立 Dockerfile，nginx 静态站 + /api 反代（透传路径不剥前缀）。

## 三、Web 用户门户 apps/web（React 18 + Tailwind + 自研轻状态层）

- 路由：hash 路由（lib/router）——/（今日提醒）/members /plans /adherence /stock /ehr /authorizations /notifications /settings + /login /register 公共页；App 级启动装载（token 存在时拉 me + members）、**登录/注册成功后立即装载成员**（2026-10-23 修复）、页面级 ErrorBoundary 兜底。
- 接口层：`src/lib/endpoints.ts` 为**契约归一化层**——后端列表形状不统一（分组/分页/字段名差异），全部适配集中在此，页面只消费定版类型（`src/lib/types.ts`）；http 层（`src/lib/api.ts`）负责信封解包、Bearer 注入、401 单飞刷新。
- 状态：`src/lib/store.ts` 轻量发布订阅（account/members/currentMemberId/careMode/unread 等）；关怀模式经 data-care-mode 属性切换度量。
- 健康档案页四页签：过敏档案 / 服药后不适 / 紧急联系人 / **健康概况**（单条档案表单，2026-10-23 按后端模型重写，原「病历条目」模型无 DB 落点已废弃）。
- 构建：Dockerfile（Vite 构建 → nginx 静态站）；桌面端复用同一构建产物。

## 四、微信小程序 apps/miniprogram（Taro 4）

- 四 tab：今日提醒 / 计划 / 成员 / 我的 + 打卡与计划编辑页；登录走 wx.login + getPhoneNumber（微信核验手机号 = 真验证，见 AUTH_CHANNELS.md）；已支持扫码确认登录 Web（pages/scan-login）与拍照识药入口。
- 状态：体验版 1.0.6 已上线（正式 AppID `wxfc47179d51798ba2` 与一次性订阅消息模板已配齐）；真机登录/扫码/打卡提醒联调通过，待正式提审发布。

## 五、桌面端 apps/desktop（Electron）

- 主进程加载 Web 构建产物（或远程 URL），托盘 + 到点本地通知桥；图标资源（tray.png / build/icon.png）为本地二进制资产，未入 GitHub 快照推送（见 SESSION_STATE）。
- 状态（2026-10-23 补验）：**Linux AppImage 已打包成功（107 MB）并启动冒烟通过**——Xvfb 下运行解包产物，内嵌 Web 经 medontime:// 协议加载至登录页（标题「药准时 MedOnTime」）。Windows NSIS 在 Linux 上交叉构建失败（exe 元数据/签名需 wine），macOS DMG 无法在 Linux 构建——两者改由 `.github/workflows/release.yml` 的原生 runner 打包（待首跑验证）。小瑕疵：Linux 解包可执行文件名取自包名（@med-on-timedesktop），AppImage 文件名正常；可在 electron-builder.yml 设 linux.executableName 修正。

## 六、Android（Kotlin + Jetpack Compose）/ iOS（Swift + SwiftUI）

- 五模块：登录 / 今日提醒 / 打卡 / 计划 / 我的；Retrofit（Android）/ URLSession（iOS）调同一套 /api；本地提醒兜底（WorkManager / 本地通知），安卓端支持 AlarmRingActivity 全屏闹钟与 VoiceAnnouncer 强提醒。
- 状态：两端源码已在 GitHub Actions（`.github/workflows/release.yml`）跑通 Release 构建与编译验证；真机运行时环境下的业务端到端联调待安排。

## 七、跨端共同口径

- 时间：成员本地墙钟（local_date/local_time + timezone 快照），服务端存 UTC。
- 枚举：`packages/shared` 为唯一来源，与 DB 附录 B 对齐，禁止各端自创。
- 代操作双记、成员数据硬隔离、提醒幂等：见 PROJECT_CONTEXT 红线与 API_CONTRACT。
- AI：各端只调后端 ai 网关，入口开通前置条件见需求红线（POC-2 + 外部医学审校）。
