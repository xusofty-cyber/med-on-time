# MedOnTime 集成说明（全仓集成收口定版，2026-10-23）

背景：十条并行开发线各自交付后，跨线接缝统一收口。本文记录每项接缝的定版结论、部署环境变量清单、DB V1.3 候选与生产待接项。接口口径以 `docs/dev/API_CONTRACT.md` 为准（本次已同步写入 JWT / 信封 / frequency_rule / cycle 四节定版）。

## 一、逐项定版结论

### 1. JWT 统一
- 全仓唯一实现：`services/api/src/common/utils/jwt.ts`（HS256）。auth 的 `TokenService` 改为其薄封装（只管用户端密钥/TTL/sid/jti），admin 登录同样经 `signJwt` 签发；原 auth 模块自建签名实现与自有守卫已删除。
- payload 定版：用户 access `type='user'`、refresh `type='refresh'`（密钥分别为 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET，refresh 另带 sid/jti 与会话存储对应，支持吊销与轮换）、后台 `type='admin'` 且 `aud='admin'`。
- 用户端守卫统一定版 `common/guards/jwt-auth.guard`（严格版）：验签 + type 校验 + 账号状态回查（不存在/软删/注销 cancelled/冻结 frozen 一律 401）。auth/account/member/authorization/ehr/ai/content 及本次补齐的 drug/plan/reminder/checkin/adherence/stock/notification 全部只用这一套。此前 drug/plan/reminder/checkin/adherence/stock/notification 控制器只有 MemberAccessGuard 而无人写入 request.user，实际处于不可用状态，本次一并补齐类级 JwtAuthGuard 并在各模块注册。
- 后台守卫 `common/guards/admin-auth.guard` 保持自洽：密钥 ADMIN_JWT_SECRET 优先、未配置回退 JWT_ACCESS_SECRET、再未配置非生产用开发默认值；签发侧 `AdminService.adminSecret()` 同口径。
- 运行时往返自检已过：access/refresh/admin 三型签发→校验、跨型/跨密钥拒绝均符合预期。

### 2. 关怀设置 / 通知偏好存储统一
- 定版存储：system_config KV（DB V1.3 补专表前的过渡口径）——`member_care_settings:<memberId>`（关怀设置）、`notification_prefs:<accountId>`（通知偏好）、`notification_read_ids:<accountId>`（已读集合）。
- 关怀设置 JSON 形状定版（写入侧与 reminder 引擎读取侧同一实现 `NotificationPrefsService`）：`{ careMode, lockScreenShowDrugDetail, cyclePreset, cycleWindowMinutes, cycleIntervalMinutes }`，后两项为显式数值覆盖、null=跟随预设；预设三档 standard 90/15、gentle 120/30、strict 60/10。
- member 模块原内存实现 `CareSettingsStore` 已整体移除，MemberService 改经 NotificationPrefsService 落盘；成员删除时同步软删设置键。取舍说明：成员其余操作本就强依赖 DB，内存回退只会形成第二数据源且重启即丢，不保留。GET care-settings 响应保持各端既有口径（cycleWindowMinutes/cycleIntervalMinutes 为解析后的生效数值）。

### 3. frequency_rule 定版对齐
- 定版形状（写入侧 plan DTO/校验与生成器解析同口径，全文已写入 API_CONTRACT「frequency_rule 定版」节）：
  - daily：`{times}`；times_per_day：`{times}`（timesPerDay 降为展示计数，无 times 校验失败——此前写入侧允许只给 timesPerDay 而生成器无法排程的缝已消除）；
  - weekly：`{weekdays[1..7], times}`（生成器兼容 0=周日）；
  - interval_days：`{intervalDays, anchorDate?, times}`（anchor 新增入写入侧校验，缺省=计划 startDate）；
  - course_cycle：以 `{onDays, offDays?, anchorDate?, times}` 为规范形状（此前写入侧的 cycleDays 生成器根本不读，属静默失效）；cycleDays 保留为兼容字段，须与 onDays 并存且满足 cycleDays=onDays+offDays，生成器在 offDays 缺省时由差值推导；
  - on_demand：`{}`。

### 4. 计划级 cycle 覆盖落地
- 输入：plan 创建/更新接受 `cycleOverride`（预设名字符串 / `{preset, windowMinutes, intervalMinutes}` 对象 / 显式 null=清除）或扁平字段 `cyclePreset/cycleWindowMinutes/cycleIntervalMinutes`（Web/小程序表单实际口径）；并存时 cycleOverride 优先，PATCH 仅给扁平字段时与既有覆盖合并。
- 存储：system_config 键 `plan_cycle_override:<planId>`，形状 `{cyclePreset, cycleWindowMinutes, cycleIntervalMinutes}`（null=不覆盖该分量）；计划删除时同步清理。计划响应同名三字段回显覆盖原值（皆 null=跟随成员）。
- 生效解析（`NotificationPrefsService.getResolvedCycleForPlan`）：成员设置打底 → 计划预设整组替换 → 计划显式数值逐项替换；提醒域全部消费点已切换为计划感知解析——投递重复、missed 兜底扫描、snooze、打卡补记判定、依从统计按时口径（此前均为成员级）。
- 全局 ValidationPipe 定版：`whitelist: true` + `forbidNonWhitelisted: false`（main.ts 已显式写明），未知字段剥离不报 400，各端可先行发送新字段。

### 5. 全局成功信封拦截器
- 新增 `common/interceptors/envelope.interceptor.ts` 并在 main.ts 注册为最外层全局拦截器：成功响应统一 `{code: 0, message: 'ok', traceId, data}`（data 为空时 null）。traceId 取请求头 `x-trace-id`，无则生成 UUID 并写入 request.traceId；`AllExceptionsFilter` 改为优先读 request.traceId，错误响应 `{code, message, traceId}` 与成功同 ID 口径串联。拦截器只包成功路径，与异常过滤器不冲突；/ops/health、/ops/ready、/ops/metrics 同走信封（部署探针按信封解析 code=0）。

### 6. 启动路径修复
- 根因：api 的 tsconfig paths 把 `@med-on-time/shared` 指向其 src 源码，tsc 将 monorepo 根推定为 rootDir，产物落在 `dist/services/api/src/main.js`，与 `start` 脚本的 `dist/main.js` 不符。
- 定版：`tsconfig.build.json` 固定 `rootDir: "."` 且构建期 paths 改指 shared 的发布声明 `../../packages/shared/dist/index.d.ts`（shared 本就以 dist 发布），产物定版为 `dist/src/main.js`（seed 脚本同出 `dist/prisma/seeds/*.js`）；`start`/`start:prod` 已改为 `node dist/src/main.js`。开发/typecheck 的 tsconfig.json 不变（仍走源码映射）。
- 验证：`node dist/src/main.js` 无 DB 时终局失败为 Prisma P1001（PrismaService.onModuleInit 连接失败），模块解析与 DI 全图（20 模块）初始化正常。

### 7. Web 接桌面提醒桥
- 新增 `apps/web/src/lib/desktop.ts`：`window.medontimeDesktop` 同形声明（以 apps/desktop preload/types 为权威契约）+ 无桥自动跳过的 `syncDesktopReminders`/`clearDesktopReminders`。
- 今日提醒页：每次数据加载成功后同步当日时间线（localDate/showDrugDetail/条目最小集含 memberDisplayName）；showDrugDetail 取当前成员 care-
...[truncated 1886 chars]
> 注：本文件初版写入时在 §7 处截断，以下 §7 余部与 §8–§12 据集成回报于 2026-10-23 补录定版。

- 今日提醒页在 care-settings 晚到或变更时重同步；登出（resetSession）与切换成员（setCurrentMember）调用 `clearReminders` 清空调度。载荷形状以 apps/desktop 的 preload/types 为权威。

### 8. 管理员播种脚本
- 新增 `services/api/prisma/seeds/create-admin.ts`：从 env 读 ADMIN_USERNAME / ADMIN_PASSWORD（≥8 位，argon2id 哈希）/ ADMIN_DISPLAY_NAME；按 username 幂等创建或刷新（密码/展示名/状态 active/撤销软删）；四个基础角色 super_admin / operator / cs_agent / medical_reviewer 缺失才建（isSystem=true），并全量授予该管理员（软删授权可恢复）。用法见文件头注释。

### 9. seed 导入双实现对齐
- 以脚本 `prisma/seeds/import-drug-seed.ts` 为准对齐后台端点（脚本是 POC-1 定版交付物，且具列宽截断、review_status 只升不降两项保护）：去重键（批准文号 unique；无文号用通用名+商品名+文号为空）、命中更新而非跳过、review_status 三值映射（异常值→draft）且只升不降、占位文案统一「未录入」、usageDefault 为空时 JsonNull、文件内文号去重；端点结果新增 `updated` 计数（前端类型全可选，兼容）。

### 10. 集成说明（本文件）
- 本文件即 §10 交付物；契约 `docs/dev/API_CONTRACT.md` 已同步 JWT / 信封 / frequency_rule / cycle 四节定版结论。

## 部署环境变量清单（权威口径另见 deploy/.env.example 与 src/config/configuration.ts）

| 变量 | 用途 | 未配置后果 |
|---|---|---|
| DATABASE_URL | Prisma 连接串（postgresql://medontime:…@nexasx-postgres:5432/medontime） | API 无法启动 |
| REDIS_URL | BullMQ 提醒引擎 | 引擎报错（API 本体不阻断，提醒不生成/不投递） |
| PORT | API 监听端口（默认 3000） | 用默认值 |
| JWT_ACCESS_SECRET / JWT_REFRESH_SECRET | 用户端令牌签名（access 2h / refresh 30d） | 必须配置；未配走开发回退值，生产严禁 |
| ADMIN_JWT_SECRET | 后台令牌签名（优先于用户密钥） | 回退用户密钥，隔离性下降，生产应独立配置 |
| PHONE_ENCRYPTION_KEY | 手机号 AES-256-GCM 密钥（32B hex） | 开发回退值；生产严禁，且上线后不可更换（换则历史密文不可解） |
| PHONE_HMAC_KEY | 手机号 HMAC-SHA256 查找哈希密钥 | 同上 |
| EHR_ENC_KEY | 病历正文/紧急联系人字段加密密钥（32B hex） | 未配则明文降级 + 启动警告；上线后不可更换，须异地留档 |
| AI_ENABLED | AI 总开关（默认 false） | AI 端点统一返回未开通 40310 |
| NODE_ENV | 运行环境（production） | 影响日志与开发回退行为 |
| ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_DISPLAY_NAME | 管理员播种（仅播种时用） | 无初始管理员，后台无法登录 |

## DB V1.3 候选清单（本次未动 schema，待升版统一处理）
> 2026-10-23 追记：`user_account` 的 **email / email_hash / email_verified_at / phone_verified_at 四列已由 V1.3 迁移 `20261023110000_v13_auth_channels` 先行落地**（用户拍板注册验证通道先行，不等 V1.3 整批；含 email_hash 部分唯一索引与存量 phone_verified_at 回填，详见 `docs/dev/AUTH_CHANNELS.md`）。下列其余候选仍待升版统一处理。
1. `user_session` 表：refresh 会话落库（现为内存实现，进程重启会话吊销失效，access 2h 兜底）。
2. `member_care_setting` / `notification_pref` 专表：现以 system_config KV 过渡（键 member_care_settings:<memberId> / notification_prefs:<accountId>）。
3. `medication_plan` 增加 cycle 覆盖列：现以 system_config 键 plan_cycle_override:<planId> 过渡。
4. `drug.precautions` 独立列：现并入 usageDefault JSON 的 precautions 键。
5. 独立纠纷（dispute）表：现以 feedback_ticket 为载体、前后值双记录落 audit_log.detail。
6. drug 表 `member_id` 列或自建药归属优化：现按 created_by_account_id 归属。

## 生产待接项
- 短信网关（腾讯云/阿里云）：现为 DevStubSmsSender 只记掩码日志，验证码不实际下发——**接入前普通用户无法自助注册/验证码登录**，临时开户办法见 docs/DEPLOY.md。
- 微信：bind/wechat 已于 2026-10-23 注册验证通道迭代实接（jscode2session + user_oauth_binding 落点，未配 appid/secret 返回 40312，见 `docs/dev/AUTH_CHANNELS.md`）；订阅消息通道仍占位（WECHAT_SUBSCRIBE_NOT_CONNECTED 留痕）。
- 推送：APNs/FCM/厂商推送未接，客户端以本地排程兜底。
- ops 队列深度指标为占位结构，待 BullMQ 队列对象导出后回填。
