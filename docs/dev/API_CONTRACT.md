# MedOnTime 开发契约（全端共同依据，2026-10-23）

依据：需求定稿（用户端 V1.8 / 后台 V1.5 / DB V1.2 / 技术架构 V1.5 冻结版）+ `services/api/prisma/schema.prisma`（数据模型权威）+ `packages/shared` 枚举。
红线：成员数据隔离（一切成员域查询必须经 MemberAccessGuard / accountId 作用域）；提醒实例幂等键；代操作双记录（operator_type + 前后值）；响应信封 {code, message, traceId, data}；错误用 BusinessException + 既有错误码风格。

## 通用约定
- 基路径 `/api`；JSON；时间统一 ISO 8601 UTC 存储，前端按 member.timezone 渲染；日期/时刻按成员本地墙钟（local_date/local_time + timezone 快照，见 schema reminder_instance）。
- 鉴权：JWT Bearer（access 2h + refresh 30d，refresh 存 user_session 可吊销）。用户端 token 主体=account；后台 token 主体=admin（独立守卫，role 区分）。
- **JWT 定版（2026-10-23 集成收口）**：全仓唯一实现 `services/api/src/common/utils/jwt.ts`（TokenService 与 admin 登录均经其签发）；payload.type 三分——用户 access=`user`、用户 refresh=`refresh`（另带 sid/jti 与会话存储对应）、后台=`admin` 且 aud=`admin`。用户端守卫统一定版 `common/guards/jwt-auth.guard`（验签 + 账号状态回查：注销/冻结/软删拒绝），全部用户端模块只用这一套；后台守卫 `common/guards/admin-auth.guard`（密钥 ADMIN_JWT_SECRET 优先，未配置回退 JWT_ACCESS_SECRET）。
- **响应信封定版**：成功统一 `{ code: 0, message: 'ok', traceId, data }`（全局 EnvelopeInterceptor）；错误 `{ code, message, traceId }`（AllExceptionsFilter）；traceId 取请求头 `x-trace-id`，无则服务端生成 UUID，成功/错误同口径。健康探针 /ops/health 等同样走信封。
- **入参校验定版**：全局 ValidationPipe `whitelist: true`（未声明字段剥离）、`forbidNonWhitelisted: false`（各端可先行发送新字段，后端补声明后生效，不因未知字段 400）。
- 分页：`?page=1&pageSize=20`，响应 data={items,total,page,pageSize}。
- 枚举一律取 `packages/shared` 的 enums.ts（与 DB 附录 B 对齐），禁止自创取值。
- DTO 用 class-validator；Controller 只做参数/权限，逻辑在 Service；Prisma 查询禁止跨成员泄漏（where 必带 memberId 且先过隔离校验）。

## frequency_rule 定版（plan_item.frequency_rule，JsonB；plan 写入侧校验与 reminder 生成器解析同口径，2026-10-23 定版）
- `daily`：`{ times: ["08:00", "20:00"] }`
- `times_per_day`：`{ times: [...] }`；`timesPerDay` 仅作展示计数，不单独构成排程（无 times 一律校验失败）。
- `weekly`：`{ weekdays: [1..7], times: [...] }`（1=周一 … 7=周日；生成器兼容 0=周日并归一为 7）。
- `interval_days`：`{ intervalDays: n, anchorDate?: "YYYY-MM-DD", times: [...] }`（anchorDate 缺省 = 计划 startDate，锚点起每 n 天）。
- `course_cycle`：`{ onDays: n, offDays?: n, anchorDate?: "YYYY-MM-DD", times: [...] }`（服 onDays 天、停 offDays 天循环；offDays 缺省 0）。旧口径 `cycleDays` 为兼容字段：必须与 onDays 并存且满足 cycleDays = onDays + offDays；offDays 缺省时生成器由 cycleDays − onDays 推导；cycleDays 单独出现校验失败。
- `on_demand`：`{}`（仅 PRN 计划，不生成实例）。
- 全部排程类型 `times` 必填，元素为本地墙钟 "HH:mm"。

## cycle（提醒周期）定版
- 预设三档：标准 standard=90/15、温和 gentle=120/30、严格 strict=60/10（窗口分钟/间隔分钟）。
- 成员级：`PUT /members/:memberId/care-settings` 写入，存储定版为 system_config 键 `member_care_settings:<memberId>`，JSON 形状 `{ careMode, lockScreenShowDrugDetail, cyclePreset, cycleWindowMinutes, cycleIntervalMinutes }`（后两项为显式数值覆盖，null=跟随预设）——写入侧（member 模块）与读取侧（reminder 引擎 NotificationPrefsService）同一实现。GET 响应中的 cycleWindowMinutes/cycleIntervalMinutes 为解析后生效值。通知偏好同理走 `notification_prefs:<accountId>`。
- 计划级覆盖：plan 创建/更新接受 `cycleOverride`（预设名字符串，或 `{ preset, windowMinutes, intervalMinutes }` 对象；显式 null=清除覆盖）或扁平字段 `cyclePreset/cycleWindowMinutes/cycleIntervalMinutes`（Web/小程序表单口径；二者并存时 cycleOverride 优先，PATCH 仅给扁平字段时与既有覆盖合并）。存储键 `plan_cycle_override:<planId>`，形状 `{ cyclePreset, cycleWindowMinutes, cycleIntervalMinutes }`（null=不覆盖该分量）。计划响应同名字段回显覆盖原值（皆 null=跟随成员）。
- 生效解析顺序（生成 missed 判定 / 投递重复 / snooze 统一）：成员设置打底 → 计划覆盖预设整组替换 → 计划覆盖显式数值逐项替换。

## 用户端接口（account 主体）
- auth: POST /auth/register（手机号+密码+短信验证码；验证码通道先走 dev stub：固定走 notification 短信接口抽象，生产接真实网关；注册即置 phone_verified_at）, POST /auth/login（{account, password}：account 含 @ 按邮箱查、否则按手机号查；旧 {phone, password} 兼容）, POST /auth/login/code（手机号+验证码）, POST /auth/refresh, POST /auth/logout, POST /auth/password/reset（验证码重置）, GET /auth/me
- auth（V1.3 注册验证通道，2026-10-23 定版，全文见 `docs/dev/AUTH_CHANNELS.md`）: POST /auth/email/send {email, scene}（scene: register/login/reset_password/bind；限频与短信同口径 60s/5 次每小时/5 分钟有效/5 次尝试）, POST /auth/register/email {email, code, password, nickname?, phone?}（邮箱已验证建号；phone 选填只登记不验证）, POST /auth/wechat/miniapp/login {code, phoneCode?}（code 换 openid 登录/建号；带 phoneCode 一并核验手机号；未配 appid/secret 返回 40312）, POST /auth/wechat/bind {code}（需登录；旧路径 POST /auth/bind/wechat 同实现）, POST /auth/phone/verify/wechat {phoneCode}（需登录；微信核验手机号落库/置验证，不一致返回 40910 不覆盖账号根）。账号视图（GET /auth/me、GET/PATCH /account/profile）含 phoneVerified/hasPhone/emailMasked/emailVerified/hasEmail/hasWechat。
- auth 段业务码（禁止复用）: 40312 WechatNotConfigured（微信通道未配置）, 40320 PhoneNotVerified（手机号未验证：禁开短信提醒、禁短信找回密码）, 40321 PhoneVerificationRequired（接受照护授权前须完成手机号验证）, 40910 PhoneMismatch（微信核验号与登记号不一致）。
- account: GET/PATCH /account/profile, POST /account/cancel（注销申请→30 天冷静期）, GET /account/sessions, DELETE /account/sessions/:id
- member: POST /members（上限 10/账号）, GET /members, GET/PATCH/DELETE /members/:memberId, PUT /members/:memberId/care-settings（关怀模式/提醒偏好：cycle 预设 标准90/15、温和120/30、严格60/10，可按计划覆盖；锁屏显示药品详情默认 OFF）
- authorization: POST /authorizations（发起照护授权）, GET /authorizations（我授权的/授权我的）, POST /authorizations/:id/accept|reject|revoke（上限 5 照护人/成员；一切代操作写 authorization_log 双记录）。V1.3：accept 要求接受者手机号已验证（未验证返回 40321），且其手机号哈希须与邀请的照护人手机号哈希一致（不一致返回 40910）；邀请创建不变。
- drug: GET /drugs/search?q=&page（名称/通用名 trgm 模糊）, GET /drugs/:id（说明书层字段）, GET /drugs/:id/interactions（相互作用：说明书结构化字段 + ONC 高优先硬检标记）, POST /members/:memberId/drugs/custom（自建药品）
- plan: POST /members/:memberId/plans（类型：常规/PRN 按需；含 course+dose phases 阶段数组、存放位置 storage_location、附加备注 note、cycle 覆盖）, GET /members/:memberId/plans, GET/PATCH/DELETE /plans/:planId, GET /plans/:planId/history（变更史）, POST /plans/:planId/pause|resume
- reminder: GET /members/:memberId/reminders/today, GET /members/:memberId/reminders?date=, POST /reminders/:instanceId/snooze（按 cycle 顺延）, POST /reminders/:instanceId/skip
- checkin: POST /reminders/:instanceId/checkin（服药打卡：一实例仅一条有效 intake_record）, GET /members/:memberId/checkins?from&to
- adherence: GET /members/:memberId/adherence/summary?range=week|month（应服/实服/按时率）, GET /members/:memberId/adherence/calendar?month=
- stock: GET /members/:memberId/stock（库存+到期预警）, POST /members/:memberId/stock/adjust（增减流水）, 服药打卡自动扣减
- ehr: 过敏档案 GET/PUT /members/:memberId/allergies；服药后不适记录 POST/GET /members/:memberId/adverse-records；紧急联系人 CRUD /members/:memberId/emergency-contacts；病历文本 POST/GET /members/:memberId/medical-records（正文字段加密存储，见需求口径）
- notification: GET /notifications（站内）, POST /notifications/:id/read, GET/PUT /notification-prefs（渠道：站内/短信（用户自选开启）/微信（占位））。V1.3：PUT 开启 sms 时账号手机号须已验证，未验证返回 40320；POST /auth/password/reset 同理（未验证返回 40320）。
- content: GET /content/articles?locale=, GET /content/articles/:id（简/繁/英 locale 内容组）
- ai: 全部返回「未开通」占位（POC-2 未评测 + 外部医学审校前入口不开）

## 后台接口（admin 主体，/api/admin 前缀）
- POST /admin/auth/login；GET /admin/dashboard（注册/活跃/提醒投递/待核验药品计数）
- 账号与成员：GET /admin/accounts, GET /admin/accounts/:id, POST /admin/accounts/:id/freeze|unfreeze；GET /admin/members
- 药品库：GET /admin/drugs（按 review_status 过滤）, GET /admin/drugs/:id, PATCH /admin/drugs/:id/review（核验通过/驳回，双人核验：reviewer 与 verifier 两段）, POST /admin/drugs/import-seed（导入 drug_seed_200.json，pending 条目置未发布）
- 计划监管：GET /admin/plans?memberId=, GET /admin/plans/:id/history
- 内容：CRUD /admin/content/articles（多语言内容组）, 协议文档版本 CRUD /admin/content/consents（consent versioning）
- 客服裁决：GET /admin/disputes, POST /admin/disputes/:id/resolve（客服全权裁决，双记录前后值）
- 审计：GET /admin/audit-logs（audit_log 分区表查询）
- 系统：GET /admin/app-versions, POST /admin/app-versions

## 提醒引擎（reminder 模块内，BullMQ）
- 生成器：每日为活跃 plan 按成员本地时区生成次日 reminder_instance（scheduled_at_utc + local_date/local_time + timezone 快照；幂等键 = plan_item_id + local_date + local_time + dose_index，唯一约束兜底）。
- 投递器：到点按 notification 渠道投递并写 reminder_delivery_log；未确认按 cycle（默认标准 90 分钟内每 15 分钟）重复提醒，超窗记 missed。
- 打卡回写：intake_record 落库后更新 instance 状态、扣库存、刷新依从统计。

## 前端结构口径
- 后台（apps/admin，AntD Pro）：src/pages 下 dashboard/accounts/members/drugs/plans/content/disputes/audit/system；统一 request 封装走 /api/admin；医嘱绿 #0B6B4F。
- Web（apps/web）：路由 /login /register /（今日提醒）/members /plans /adherence /stock /ehr /settings；data-care-mode 关怀模式（≥18pt/对比度≥7:1/点击区≥56）。
- 小程序（apps/miniprogram，Taro）：pages/index（今日提醒）/plans/members/me 四 tab + 打卡与计划编辑页。
- 桌面（apps/desktop，Electron）：主进程加载 Web 构建产物（或远程 URL 配置），托盘 + 到点本地通知。
- Android（apps/android，Kotlin+Jetpack Compose）：登录/今日提醒/打卡/计划/我的 五模块，Retrofit 调 /api，WorkManager 本地提醒兜底。
- iOS（apps/ios，Swift+SwiftUI）：同上五模块，URLSession 调 /api，本地通知兜底。
