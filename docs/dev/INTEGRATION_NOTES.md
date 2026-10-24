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
- 关怀设置 JSON 形状定版（写入侧与 reminder 引擎读取侧同一实现 `NotificationPrefsService`）：`{ careMode, lockScreenShowDrugDetail, cyclePreset, cycleWindowMinutes, cycleIntervalMinutes, strongAlertMode }`，后两项为显式数值覆盖、null=跟随预设；`strongAlertMode` 三态单选（none/alarm/voice，默认 none，弹窗打底）；预设三档 standard 90/15、gentle 120/30、strict 60/10。
- member 模块原内存实现 `CareSettingsStore` 已整体移除，MemberService 改经 NotificationPrefsService 落盘；成员删除时同步软删设置键。取舍说明：成员其余操作本就强依赖 DB，内存回退只会形成第二数据源且重启即丢，不保留。GET care-settings 响应保持各端既有口径（cycleWindowMinutes/cycleIntervalMinutes 为解析后的生效数值）。

### 3. frequency_rule 定版对齐
- 定版形状（写入侧 plan DTO/校验与生成器解析同口径，全文已写入 API_CONTRACT「frequency_rule 定版」节）：
  - daily：`{times}`；times_per_day：`{times}`（timesPerDay 降为展示计数，无 times 校验失败——此前写入侧允许只给 timesPerDay 而生成器无法排程的缝已消除）；
  - weekly：`{weekdays[1..7], times}`（生成器兼容 0=周日）；
  - interval_days：`{intervalDays, anchorDate?, times}`（anchor 新增入写入侧校验，缺省=计划 startDate）；
  - course_cycle：以 `{onDays, offDays?, anchorDate?, times}` 为规范形状（此前写入侧的 cycleDays 生成器根本不读，属静默失效）；cycleDays 保留为兼容字段，须与 onDays 并存且满足 cycleDays=onDays+offDays，生成器在 offDays 缺省时由差值推导；
  - on_demand：`{}`。

### 4. 计划级 cycle 与 strongAlertMode 覆盖落地
- 输入：plan 创建/更新接受 `cycleOverride`（预设名字符串 / `{preset, windowMinutes, intervalMinutes}` 对象 / 显式 null=清除）或扁平字段 `cyclePreset/cycleWindowMinutes/cycleIntervalMinutes`（Web/小程序表单实际口径）；强提醒接受 `strongAlertModeOverride`（none/alarm/voice/null）；并存时 cycleOverride 优先，PATCH 仅给扁平字段时与既有覆盖合并。
- 存储：system_config 键 `plan_cycle_override:<planId>`，形状 `{cyclePreset, cycleWindowMinutes, cycleIntervalMinutes}`（null=不覆盖该分量）；强提醒存储键 `plan_strong_alert_override:<planId>`（值 none/alarm/voice）；计划删除时同步清理。计划响应同名字段回显覆盖原值（皆 null=跟随成员）。
- 生效解析（`NotificationPrefsService.getResolvedCycleForPlan`）：成员设置打底 → 计划预设整组替换 → 计划显式数值逐项替换；强提醒同理以成员 strongAlertMode 打底、计划 strongAlertModeOverride 优先覆盖；提醒域全部消费点已切换为计划感知解析——投递重复、missed 兜底扫描、snooze、打卡补记判定、依从统计按时口径。
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

## 2026-10-23 线上巡检修复（白屏 + 契约对齐，实测口径）

上线后逐页巡检发现 Web 门户多处前后端契约不一致（页面按数组消费、后端返回包装对象），其中两处致整页白屏。修复口径：**形状适配集中在 Web 端 `apps/web/src/lib/endpoints.ts` 归一化层，后端形状不迁就前端改动**（后端形状与 DB 定版一致，且小程序/原生端按后端口径开发）。逐项：

| 接口 | 后端实际形状 | 修复 |
|---|---|---|
| GET /members | `{own, authorized}`（own 带 `access:'owner'`，authorized 带 `level`） | 前端合并为数组：own→accessLevel='owner'，authorized→accessLevel=level |
| GET /authorizations | `{granted, received}`，字段 `memberDisplayName`/`grantedByNickname` | 前端按分组消费并映射字段名为 memberName/grantorNickname |
| GET /account/sessions | `{items, total}` | 前端解包 items |
| GET /members/:id/plans、GET /plans/:id/history、GET /members/:id/stock、GET /members/:id/checkins、GET /members/:id/adverse-records | 分页 `{items,total,page,pageSize}`（stock 条目主键为 memberMedicationId，含 drug 对象/alerts/expiryStatus/estimatedDaysLeft） | 前端 unpage；stock 逐字段映射为 StockItem（id/drugName/daysLeftEstimate/lowStock/expiringSoon/expired） |
| GET /members/:id/reminders/today、/reminders?date | `{date, timezone, items}` | 前端取 items |
| GET /members/:id/adherence/summary、/calendar | summary 计数字段无 Count 后缀；calendar 为 `{month, timezone, days}` | 前端重命名 scheduled→scheduledCount 等并取 days |
| GET/POST /members/:id/medical-records | **单条健康概况**（血型/身高/体重/常去医院/摘要，upsert） | 前端原「病历条目列表」与后端模型冲突，按后端模型重写 Web 页签为「健康概况」表单（原条目模型无 DB 落点，废弃） |

后端侧两处修正：
1. **手机号注册对齐 V1.3 裁定**（此前 DTO 强制 smsCode + registerChannel 且前端未对齐，Web 手机号注册 100% 失败）：smsCode 改可选（带码校验并置 phoneVerifiedAt，无码未验证注册、三受限照常），registerChannel 可选默认 'web'；Web 注册页去掉短信验证码字段。
2. **不适记录关联改为可选**：ehr.service 曾硬性要求 intakeRecordId/reminderInstanceId/prnIntakeId 至少其一，但 DB V1.2 三列均可空、DTO 亦为可选——删除该硬校验，传了关联仍逐项校验归属。
3. **提醒实例视图补 R-1 字段**：toInstanceView 增加 plan.storageLocation / plan.additionalNote / planItem.mealRelation（listByDate 装载 plan/planItem 关系），详细提醒可展示存放位置与备注。

另：Web App 增加页面级 ErrorBoundary（按路由 key 重挂载），单页渲染异常降级为错误卡片而非整站白屏。成员装载失败曾连带启动 catch 清空登录态（表现为刷新即掉登录），归一化后消除。已知小瑕疵：会话列表无 `current` 标记，本人当前会话也显示「退出该设备」按钮（后端未返回 currentSessionId，待后端补字段后前端再禁用自踢）。

### 2026-10-23 后台巡检修复（同日第二轮，hotfix5/5b 已上线并探针复验）

| # | 问题 | 修复 |
| --- | --- | --- |
| 1 | 仪表盘整页崩溃 `reading 'deliveredToday'`（后端 dashboard 返回 `deliveriesToday` 自有形状，页面按 DashboardData 读 `reminders.*`） | 后端 dashboard() 形状对齐前端类型：accounts{total,active,frozen,cancelling,newToday,newThisWeek}、members{total,active}、reminders{deliveredToday（result=success 计数）,failedToday,missedToday,deliveryRateToday}、drugs{total,pendingReview,approved,rejected}、disputes{pending,open}；探针核对全字段有值 |
| 2 | 账号列表/详情手机号恒为「-」（后端从未回脱敏手机号；前端读 phoneMasked） | AdminService 注入 PhoneCryptoService：select 密文列 phone → 解密 + maskPhone 脱敏回 phoneMasked，密文剥离不出接口；纯邮箱注册无手机号的账号为 null 属正确 |
| 3 | 后台关键字搜索恒不生效（账号/药品） | 双因：前端 ProTable 参数名 keyword 与后端 DTO 的 q 不一致 → apps/admin api 层单点映射 withQ（accounts/members/drugs）；后端账号 q 此前仅匹配昵称 → 扩为昵称模糊 OR 完整手机号哈希精确 OR 邮箱哈希精确（部分号码模糊检索因哈希不可逆不支持，隐私设计） |
| 4 | 用户侧操作不进平台审计（后台按操作者类型=用户账号筛选恒空；授权创建无记录） | 授权域本有 caregiver_authorization_log 双记录（合规口径不变）；在 AuthorizationService.writeLog 单点加 audit_log 镜像：actorType='account'（设计枚举 admin/account/system）、action=care:authorization:<invited\|accepted\|rejected\|revoked\>；实测 invited+revoked 两条落库可查；误写的一条 'user' 已 SQL 更正 |
| 5 | 药品详情「用法用量」直显原始 JSON（usageDefault 为 {text} 对象被 prettyJson 直印） | 页面改为优先展示 usageDefault.text 正文，其余形状回退 prettyJson |

## 生产待接项与已知缺口
- 短信网关（腾讯云/阿里云）：现为 DevStubSmsSender 只记掩码日志，验证码不实际下发；普通用户当前可使用邮箱验证码或手机号免验证码直接注册；短信验证码登录与短信找密待接入真实网关。
- 微信：小程序登录/绑定与一次性订阅消息下发已于 2026-10-23 接入并实测通过；后续待扩展长期订阅消息模板申请。
- 推送：APNs/FCM/厂商推送未接，客户端以本地排程兜底。
- ops 队列深度指标为占位结构，待 BullMQ 队列对象导出后回填。
- 账号注销 30 天冷静期终局清理定时任务：当前 ops 仅有 health/ready/metrics 探针，扫描 `cancel_apply_at <= now - 30d` 并执行可识别信息物理删除与健康明细不可逆匿名化的定时任务在代码中尚未实现，待后续补齐。
