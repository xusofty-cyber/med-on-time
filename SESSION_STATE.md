# 当前会话状态与断点记录 (SESSION_STATE.md)

> **定位说明**：本文件记录当前会话的执行断点、已完成改动、真实验证证据及未完成事项，确保跨会话与跨工具切换时上下文无缝衔接。在有意义的任务/会话边界更新，及时清除已完成或过期的历史内容。
>
> 最后更新：2026-10-24（微信绑定改走小程序扫码确认完成：后端票据三端点 + Web 设置页扫码弹窗轮询 + 小程序扫码与确认页，构建三连 Exit 0，FIXLOG 已落盘）

---

## 一、当前任务概览

- **关联需求 / Issue**：微信绑定改走小程序扫码确认（后端票据 + Web 设置页 + 小程序确认页）
- **会话目标**：修复 Web 设置页绑定微信向旧端点发空 body 的缺陷，改走小程序扫码确认方案；后端新增绑定票据三端点（内存 store 模式，不改 schema/迁移），Web 弹窗展示 `bind:` 前缀二维码并 2 秒轮询，小程序扫码跳转确认页并用 `wx.login` code 提交绑定，全中文报错与校验。
- **当前状态（2026-10-24 晚）**：后端、Web、小程序三端全部完成并自测，单元测试通过（24/24 passed），三端生产构建全部 Exit 0，FIXLOG 已落盘至 `~/workspace/agy-delegate/fixlogs/v021-bind-scan.md`。

---

## 二、问题根因定位 / 方案设计

1. **桌面端 (4 项)**：
   - 协议兄弟目录穿越：通过 `rootResolved` 严格限制必须为根目录子路径（带路径分隔符边界）。
   - 载荷清洗：补充 `DesktopReminderItem` 运行时属性及字符串长度截断。
   - 自启配置：Windows/macOS 加 `app.isPackaged` 守卫，Linux `.desktop` 文件转义并包裹引号。
   - 图标路径：非 macOS 平台 BrowserWindow 显式绑定 `build/icon.ico` / `icon.png`，`electron-builder.yml` 修正 `win.icon`。
2. **Android 端 (7 项)**：
   - 明文流量拦截：配置 `network_security_config.xml` 放行本地/调试明文，关闭 `allowBackup`。
   - BAL 拦截与全屏闹钟：挂载 `CATEGORY_ALARM` 与 `fullScreenIntent`，强提醒闹钟由系统在锁屏及后台拉起。
   - 闹钟与时间线清理：维护 `scheduled_instance_ids`，切换成员/退登/删改计划时同时注销 WorkManager 与 AlarmManager 精确闹钟。
   - 时区/时间变更广播：监听 `TIMEZONE_CHANGED` 与 `TIME_SET` 触发重排。
   - AlarmRingActivity onNewIntent 与 TTS 泄漏：覆写 `onNewIntent` 响应新提醒，先设监听再 speak，失败分支 shutdown。
   - 非法基地址崩溃：URL 校验与非法回退默认值。
   - 冗余权限与图标：移除 `ACCESS_NETWORK_STATE`/`WAKE_LOCK`，补齐 `ic_launcher_round.xml`。
3. **iOS 端 (6 项)**：
   - DTO 契约对齐：统一 `smsCode`、`ReminderDayDTO`、`PageResult<T>`、`AdherenceSummaryDTO`/`AdherenceCalendarResponse`、`MedicalRecordDTO`/`UpsertMedicalRecordRequest`。
   - 生命周期与隔离：退出登录清理本地通知，确保关怀设置拉取完毕再排程，深链路由支持 `memberId` 切换活动成员。
   - 强提醒契约：补齐 `StrongAlertMode`（`none`/`alarm`/`voice`），支持设置与前台 AVSpeechSynthesizer 播报。
   - URL Scheme 与网络配置：Info.plist 注册 `medontime` scheme 与 `NSAllowsLocalNetworking`，RootView 校验合法 UUID。
   - 401 自动重试：匹配 `httpStatus == 401 || header.code == 401 || header.code == 40100`。
   - 密码校验与倒计时：8-64 位字母数字复杂度校验，倒计时 `!Task.isCancelled` 检查。

---

## 三、代码修改与落地清单

- **FIXLOG 记录**：`~/workspace/medontime-review/code-review-2026-10-24/FIXLOG-native.md`（含 17 条逐条判定与说明，末尾四类判定统计与严重级别分布）。
- **受影响工程源码**：
  - 桌面端：`apps/desktop/src/main.ts`、`apps/desktop/src/reminders.ts`、`apps/desktop/electron-builder.yml`
  - Android：`apps/android/app/src/main/AndroidManifest.xml`、`network_security_config.xml`、`ic_launcher_round.xml`、`NotificationHelper.kt`、`StrongAlert.kt`、`ReminderScheduler.kt`、`SessionStore.kt`、`Receivers.kt`、`ApiProvider.kt`、`TodayScreens.kt`、`PlanListScreens.kt`、`MembersScreens.kt`、`SettingsScreens.kt`
  - iOS：`apps/ios/MedOnTime/Models/AuthDTOs.swift`、`ReminderDTOs.swift`、`StatsDTOs.swift`、`EhrDTOs.swift`、`SharedEnums.swift`、`MemberDTOs.swift`、`PlanDTOs.swift`、`Services/AuthService.swift`、`ReminderService.swift`、`PlanService.swift`、`StockService.swift`、`AdherenceService.swift`、`EhrService.swift`、`Core/AuthSession.swift`、`Core/APIClient.swift`、`Core/DeepLinkRouter.swift`、`Notifications/LocalNotificationManager.swift`、`App/RootView.swift`、`Resources/Info.plist`、`Features/Today/TodayViewModel.swift`、`Features/Profile/CareSettingsView.swift`、`Features/Profile/EhrView.swift`、`Features/Auth/AuthViewModel.swift`、`Features/Auth/RegisterView.swift`、`Features/Auth/ResetPasswordView.swift`

---

## 四、严格验证证据门 (Verification Evidence Gate)

1. **桌面端构建与类型检查**：
   - `pnpm --filter @med-on-time/desktop build`：`tsc -p tsconfig.json` 退出码 0，成功生成 `dist/`。
   - `pnpm --filter @med-on-time/desktop typecheck`：`tsc --noEmit -p tsconfig.json` 退出码 0，0 错误。
2. **移动端代码级静态核验**：
   - 依据 `fix-common.md` 规则，本机无 Android SDK / Xcode 环境，不强制编译；逐条代码核查并在 FIXLOG 标注「未编译验证」。

---

## 五、当前断点与后续待执行事项

1. **当前断点（2026-10-24 晚 · 微信绑定改走小程序扫码确认完成）**：
   - 后端新增绑定票据三端点（`POST /auth/wechat/bind-tickets`、`GET /auth/wechat/bind-tickets/:id`、`POST /auth/wechat/bind-confirm`），复用内存 store，与既有 scan-login 登录严格隔离，全中文 DTO 校验与冲突提示；
   - Web 设置页绑定微信改为扫码弹窗，渲染 `bind:` 前缀二维码，2 秒轮询状态并在 confirmed 时刷新账号信息与提示；
   - 小程序扫码入口扩展支持识别 `bind:` 前缀，无缝跳转至新增绑定确认页，调用 `Taro.login()` 获取 code 确认绑定；
   - 构建三连全部 Exit 0，FIXLOG 落盘于 `/home/hatch/workspace/agy-delegate/fixlogs/v021-bind-scan.md`。
   **SMTP 已接通（2026-10-23 中午）**：系统发信 = 用户 QQ 邮箱（smtp.qq.com:465，SMTP_URL + SMTP_FROM 已写入服务器 deploy/.env，授权码只存在该文件、未入任何记录）；实发测试成功，用户已用邮箱验证码完成注册登录。注册邮箱不限服务商（代码仅 @IsEmail 格式校验，无域名白名单）。
   **线上巡检与契约修复（2026-10-23 下午，用户报障触发）**：用户报 Web 门户点「照护授权」「设置」白屏，下令逐页逐功能验证。浏览器实测复现：两页均在异步数据返回后整树崩溃；连带发现成员装载失败（今日页误报「还没有成员」、整页刷新即掉登录——启动 catch 因 members 形状抛错清空了登录态）与 Web 手机号注册 100% 失败（registerChannel/强制短信码与 V1.3 裁定脱节，此前交付验收只覆盖邮箱通道，系助手验收疏漏）。根因统一为前后端契约不一致，修复已全部上线并逐项实测：前端 endpoints 建归一化层（members 分组、authorizations 分组+字段映射、sessions/plans/history/stock/checkins/adverse 分页解包、reminders 取 items、adherence 字段重命名+days、stock 逐字段映射、病历页签按后端单条健康概况模型重写为「健康概况」表单）；后端三修（手机号注册 smsCode/registerChannel 改可选并默认 web；不适记录关联服药事件改可选——DB 三列可空、原服务硬校验与定版冲突；提醒实例视图补 R-1 存放位置/附加备注/餐前餐后）；App 加页面级 ErrorBoundary 兜底。实测证据：探针账号带数据逐接口验形状与字段全对齐、不适独立记录创建成功、浏览器全页复验（含授权发起、设置静置、刷新不掉登录、未验证账号接受授权被 40321 拦截的提示）——复验结果见本节后续追记。细节全文见 `docs/dev/INTEGRATION_NOTES.md`「2026-10-23 线上巡检修复」节。残留小瑕疵：会话列表无 current 标记（当前会话亦显示退出按钮）；短信验证码登录/重置仍为网关未接的占位失败；api 包无单元测试文件（jest 零匹配为仓库现状）。
   **巡检追记（2026-10-23 晚）**：客户端全页复验通过（白屏全清、预置数据恢复、授权发起/双账号查看、设置页会话与改名、刷新保活；未验证接受授权被 40321 正确拦截）；复验中新发现「初次登录不装载成员」已修（Login/Register 成功路径补 memberApi.list 装载；同源解释用户最初的「还没有成员」截图），后台巡检第 0 项回归通过。提醒实例经查为次日生成口径（每小时 :05 + 启动补跑，只生成次日实例，幂等实证 10-24 实例存在），非缺陷；「当日新建计划当日未过时刻是否即时生效」待用户拍板是否改口径。后台全页巡检完成（admin 登录初期因浏览器自动填充串号客户端测试账号密码多次失败，用户直接提供 admin 密码后完成）：新发现并已修复上线（hotfix5/5b）——仪表盘形状崩溃（后端 dashboard 对齐 DashboardData）、账号手机号脱敏缺失（补 phoneMasked + 完整号码哈希搜索）、后台关键字搜索参数名 keyword→q 映射、用户侧授权动作镜像落 audit_log（actorType=account）、药品详情用法用量 JSON 直显改 text 正文；冻结/解冻与客户端联动实测通过（拒登提示「账号已被冻结」）。同日完成文档完善轮：新建 docs/HANDOVER.md（接手指南）、docs/dev/ENDS_OVERVIEW.md（各端概要·实建版）、docs/dev/TEST_CASES.md（用例与验证证据），修订文档索引/README/API_CONTRACT 过期口径，DEPLOY.md 补附录 B 生产实况。测试账号（13912345678/13912345679 及探针数据）已于本轮收尾时软删清理。
**强提醒 / 大模型配置 / 拍照录入三件套（2026-10-24 用户发令实现，develop `26c4616`，已部署上线）**：① 强提醒（备忘 N-1）：关怀设置 `strongAlertMode`（none/alarm/voice，弹窗恒为基础层）+ 计划级覆盖（system_config 键 `plan_strong_alert_override:<planId>`，视图字段 `strongAlertModeOverride`）；Web/小程序关怀设置与计划表单已接线；安卓端调度时把生效模式定格进剂量载荷、WorkManager+精确闹钟双通道呈现（90 秒去重防双响），AlarmRingActivity 全屏响铃至处理、VoiceAnnouncer TTS 播报（药名/剂量显隐从 lockScreenShowDrugDetail 口径），Actions Run #6 编译通过；桌面端呈现层、iOS 呈现层未做（iOS 按降级口径：重复通知+声音）。② 后台大模型配置（2026-10-24 用户新增要求）：新表 `ai_provider_config`（迁移 `20261024100000_v14_ai_provider_config`，已在生产 PG 应用）存模型名/base_url/能力域/启停，API key 以 FieldCrypto 密文存（enc:v1:）+ last4 掩码展示，EHR_ENC_KEY 未配置时拒绝保存；管理端「系统 → 大模型配置」页（增删改、单能力域单启用、测试连接）；`AiGatewayService` 为 OpenAI 兼容调用层（仅传输，健康问答开放口径 AI_ENABLED+医学审校不变）。③ 拍照录入（备忘 N-2）：`POST /drugs/photo-recognize`——视觉模型只提取药名候选（≤3），逐个回药品库检索返回命中，**用户必须点选库内条目才建计划，识别永不生成药品数据**；图片不落盘；通道选型稿 `docs/research/PHOTO_ENTRY_OPTIONS.md`（推荐 GLM-4V-Flash 免费多模态为主通道，待用户终审）。线上验证：三容器重建完成、`deploy_106c` 链全过、`/api/admin/ai-providers` 与 `/api/drugs/photo-recognize` 未登录均 401（路由实存）、admin 站 200、根盘 56%。小程序 1.0.6 已上传（含拍照入口与强提醒设置），待用户控制台切换体验版指针。部署注记：覆盖包内个别文件权限 600 曾致容器非 root 用户读 package.json 失败（EACCES），已以「跳过 node_modules 的 a+r 修正」解决，今后覆盖打包须注意文件权限。**公众号需求分析（2026-10-24）**：`docs/dev/OA_REQUIREMENTS.md` V1.0 定版口径——个人订阅号只做入口/教学/公告（每日群发 1 次走审批、AI 不得代发），不承担到点提醒，身份不做自动归一；「管理后台代发公众号文章」（草稿箱/发布接口）用户裁定**先验权限**：待取得公众号 AppID/AppSecret 并把服务器公网 IP 加白名单后实测接口权限，通过再建功能；公众号后台其余配置（关联小程序/菜单/欢迎回复）待负责人以公众号管理员微信登录后执行（素材包 `~/workspace/medontime-oa/`，助手侧目录不入仓）。
**正式 Logo 接入各端（2026-10-24 用户拍板，本地完成、待随下个里程碑合并推送）**：素材源 `~/workspace/medontime-logo/exports/`。Android：五档 mipmap ic_launcher(+round) PNG 落位；自适应图标前景改用透明母版合成的位图（五档 drawable-*/ic_launcher_foreground.png， glyph 占画布 72% 安全区），删除原手绘矢量占位前景，原白底 @color 背景不变。iOS：新建 Resources/Assets.xcassets/AppIcon.appiconset（14 槽位/10 文件同尺寸复用，透明像素已合成白底），project.yml 的 ASSETCATALOG_COMPILER_APPICON_NAME 设为 AppIcon（工程为 XcodeGen 生成，无 pbxproj 入仓）。桌面：build/icon.png 换 512 版 + 新增 build/icon.ico（electron-builder 原配置即指向 build/icon.png）。Web/管理端：新建 public/ 放 favicon 16/32/48+apple-touch+.ico，两端 index.html 补 link 标签，vite 构建验证 favicon 进 dist。小程序：工程内无图标位（对外头像为控制台账号头像，已是正式 Logo），exports/miniprogram 三尺寸未用——tabBar 图标需各 tab 独立字形，不以应用图标充数，待 UI 资源另行到位。
**公众号发文权限实测 + 草稿同步版上线（2026-10-24 上午续）**：用户提「管理后台加给订阅号发文章功能」→ 裁定先验权限。经浏览器拿到公众号 AppID（wx41b98a1a6b729034）并重置 AppSecret（仅存服务器 deploy/.env 的 WECHAT_OA_*；IP 白名单原已含服务器公网 IP），服务器侧实测：token/账号信息/菜单/素材/草稿箱全通，建草稿全链路实证并零残留清理；**发布接口 freepublish 与模板消息均 48001**（未认证绑定）。账号类型接口核实为订阅号·未认证（平台个别分组标签误标「服务号」，以接口为准）。据此上线**草稿同步版**：`oa_article` 表 + 迁移 `20261024110000_v15_oa_article`、`WechatOaService`（token 缓存/失效重试/48001 映射）、管理端点 `/admin/oa-articles`（CRUD+封面+同步/撤回，operator 权限）、管理后台「内容管理 → 公众号文章」页签（纯文本写稿：空行分段转 HTML、封面直传微信素材库、实时预览、同步状态 local/synced/dirty）；发布保留公众号侧人工点按（合流 F4 审批）。公众号其余后台配置（关联小程序/菜单/欢迎回复）素材已备、待排期。
2. **文档现行版本**：用户端需求 V1.8、后台需求 V1.5、数据库设计 V1.2（基线 56 张表，演进为 58 表）、技术架构 V1.5（已推送 main，commit `c18ba30`）、UI 设计规范 V1.0、技术预研 V1.1（零预算版）。需求/数据库 PDF 为 artifact 构建产物，位于助手侧目标目录，未入仓（待发布到 Releases）。
3. **POC 状态**：POC-1 已完成（说明书层有条件通过；质检管线已全量运行，报告见 `docs/research/`）；POC-2（模型评测）：2026-10-23 用户提供两必需 Key 并下令先跑 GLM 单通道全量——120/120 完成，**结论：GLM-4-Flash 裸通道不通过**（RED 20/20、EMERG 10/10 经人工定案达标，但虚构药名探针 2/4 编造、裸答事实错 3 条；仅可在药品库未收录拦截 + 说明书上下文注入形态下作候选），全文见 `docs/research/POC2_GLM_RESULTS.md`；讯飞 APIPassword 被服务端 401 拒绝（HMAC 不匹配），待用户回控制台核对后补跑星火通道再定主备；GUIDE 与其余人工终审（医学复核）未做。POC-3（相互作用替代打法验证）未启动。
4. **后续下一步（均待用户发令）**：
   - [x] 技术架构正式冻结确认（2026-10-20 用户确认，口径：选型须为大型项目验证过的成熟技术；TECH_ARCHITECTURE.md 状态已改为已确认冻结）
   - [x] 两个可点击原型（用户端/后台）用户走查完成（2026-10-20：无大问题，通过）
   - [x] 按定稿生成各端脚手架代码（2026-10-23 落 develop：services/api NestJS + Prisma 58 表 + 其余各端最小脚手架，build/typecheck 全绿）
   - [x] 建立 `develop` 分支（2026-10-23，自 main 切出）；选 License（MIT，已落仓）
   - [x] 落 DDL 迁移脚本（2026-10-23 落 develop）：`services/api/prisma/migrations/`（基线 56 表建表 + 约束分区 + V1.3~V1.5 扩展至 58 表，已实跑验证）。
   - [x] 设计 PDF 发布到 GitHub Releases（2026-10-23）：design-v1.0 标签（指向 main@a31d53c），5 份 PDF 附件齐全，地址 https://github.com/xusofty-cyber/med-on-time/releases/tag/design-v1.0
   - [x] 200 药首期队列处理（2026-10-23 落 develop，commit 916ca2c）：最终 seed `services/api/prisma/seeds/drug_seed_200.json` 200 条定版——175 直接入库 + 队列 11 条（4 误报澄清 approved：地屈孕酮/索利那新/噻托溴铵/坦索罗辛，污染源为噻托溴铵记录盗用证号 H20130110，已核证该证号确属地屈孕酮；4 补全后 pending：哌唑嗪/文拉法辛/培哚普利/沙库巴曲缬沙坦；3 别名 approved：替诺福韦/埃索美拉唑/沙美特罗）+ 人工补录稿 13 条（全 pending 待双人核验）+ 维生素D 以 D2 代表挂账 pending。合计 approved 182 / pending_review 18，pending 条目双人核验前不得上线展示。处置报告 `docs/research/POC1_QUEUE_PROCESSING.md`，逐药表 `docs/research/queue/queue_dispositions.csv`，别名表 `docs/research/queue/alias_map.csv`（含噻托溴铵南昌弘益污染记录隔离登记）。遗留人工项：甲基多巴国内注册状态存疑（公开渠道无大陆上市说明书，须 NMPA 核实后裁定剔除或另行建档）；德谷胰岛素/艾塞那肽/地西泮仅骨架稿待持原件补录；维生素D3 待补录后与 D2 拆分。
   - [x] API 启动冒烟（需 Docker 环境起 PostgreSQL 15 + Redis 7）与首批业务接口实现 → 业务接口已于 2026-10-23 全量实现（见当前断点）；真实环境启动冒烟随服务器部署（方案 A）执行，助手待验收
   - [x] 全端开发与集成收口（2026-10-23 落 develop：后端四线 + 管理端 + Web + 桌面 + 小程序 + Android/iOS 源码；集成十项销项，全仓验证全绿）
   - [x] 部署文档与脚本（2026-10-23 落 develop：docs/DEPLOY.md + deploy/ 全套脚本，含建库/迁移/种子/管理员/备份）
   - [x] 注册验证通道迭代（2026-10-23 落 develop：微信/邮箱先行 + 手机号未验证受限 + schema V1.3 迁移，见 docs/dev/AUTH_CHANNELS.md）
   - [x] 服务器部署执行与上线冒烟验收（2026-10-23 完成：改走方案 B，助手经 Tailscale 全程执行；三迁移真库实跑通过、seed 182/18、管理员与四容器就绪、mot/admin/blog 三域名上线，冒烟全过；实录见当前断点「服务器部署完成」段）
5. **待文档小修（DB 设计 V1.3 候选，Prisma 落表时发现）**：
   - 四表（consent_document、ai_prompt_template、ai_safety_rule、app_version）业务 `version`（VARCHAR 版本号）与通用乐观锁 `version`（int）同名冲突：schema 暂以业务 version 占列名、乐观锁映射 `lock_version` 列，待文档裁定（改列名或豁免四表乐观锁）。
   - AI capability 六项取值文档未列全（附录 B 与 9.2 互相回指）：schema 按 9.1 scopes + 9.9 task_type 暂定六项（health_qa、lab_report_interpretation、medical_record_analysis、symptom_analysis、timeline_summary、adherence_insight），shared 枚举仅收前四项确证值，待文档定版统一。
   - plan_info_assist（9.9 task_type）与 plan_info_draft（9.10 report_type）命名不一致；operator_type 两套枚举同名异义（授权日志 account/admin/system vs 附录 B member_self/caregiver/admin_cs/system），待文档消歧。
5. **开放风险 / 待决策项**：
   - AI 主备排序未定：待 POC-2 恢复执行后按评测结果定（双通道 Spark Lite + GLM-4-Flash、DeepSeek 兜底已定版）。
   - AI 上线前必须过一次性外部医学审校，未过则入口不开（需求红线）；生成式 AI 若被认定构成诊断/医疗器械属性须立即下线（后台需求第 12 章）。
   - `run-pipeline.sh` 部署时若覆盖根目录三文档，以本仓库版本为准，部署后需核对。
   - 环境注意事项（2026-10-23 实测）：国内网络下 Prisma engines 二进制下载可能被重置（ECONNRESET），安装时设 `PRISMA_ENGINES_MIRROR=https://npmmirror.com/mirrors/prisma` 可解；助手 VM 的沙箱文件系统上 pnpm 更新已存在的 `pnpm-lock.yaml` / `node_modules/.modules.yaml` 会因 chown EPERM 失败，删旧文件后新建可绕（仅助手 VM 环境问题，用户本机一般不受影响）；该 VM 安装时另设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 跳过 Electron 二进制下载。

## 追记（2026-10-23 晚 · 当日即时生效改版）
- 负责人裁定：提醒由「次日生效」改为「当日即时生效」。实现：`ReminderGenerationService.generateForMember` 加 `notBefore` 过滤 + 新增 `generateTodayUpcoming`；`PlanService` 在 createPlan / updatePlan / transitionStatus(resume) 成功后触发（失败只记日志）。PlanModule 引入 ReminderModule（无循环依赖），ReminderModule 导出生成器。
- 验证：本地 nest build 通过；生产实测（探针账号 17:25 建计划，时刻 15:25/19:25）DB 仅生成 19:25 pending 一条，探针数据已软删清理。TEST_CASES 新增 D9、D3 标注改版；API_CONTRACT 与 HANDOVER 口径 #4 已同步。
- 同日负责人裁定：Web 微信扫码登录走「小程序扫码确认」路线（不走开放平台网站应用），待实现；Logo 定版概念 A「时钟+胶囊」，全尺寸图标包在助手侧 ~/workspace/medontime-logo/exports/，尚未装入各端工程。
- 打包路线变更：GitHub Actions 因账户 $0 预算阻断且删预算须绑支付方式，负责人拒绝付费 → 改自有服务器打包；小程序 dist 已在服务器打出（~/release-out/），安卓 APK 构建中（Gradle 境外源不通，已换腾讯/阿里镜像）。

## 追记（2026-10-23 晚 · 扫码登录落地 + 服务器磁盘事故）
- ② 小程序扫码确认登录已落地：后端票据三接口（建票/轮询换发/小程序确认，票据进程内存储 TTL 300s，多副本前须迁 Redis）；Web 登录页新增「微信扫码」页签（内置 MIT qrcode-generator 生成二维码——pnpm add 在助手 VM 上因 lockfile chown EPERM 无法新增依赖，故零依赖内置，未动 lockfile）+ 落地页 #/scan-login；小程序新增 pages/scan-login 确认页与「我的」入口。生产实测 7 步全过（TEST_CASES B5），确认端以普通账号令牌模拟小程序登录态，微信真实扫码待 AppSecret 配置后联调。注意：~/release-out 的小程序 dist 包为扫码页之前构建，需重打。
- 安卓 Auth.kt 两处 kotlinx 序列化编译错误已修（buildJsonObject 用法），待重新打包验证（打包已撤出生产机，见下）。
- **磁盘事故（18:00–18:20）**：生产机（4核/4GB/70GB）因当日多次镜像重建（镜像 33GB+构建缓存 21GB）叠加同机打包工具链，根盘冲 93.8%、内存耗尽、全站失联约 20 分钟；负责人控制台重启后 15 容器全恢复、无数据丢失；清理缓存 21GB 与打包卷/镜像后根盘回 46%。立规：重型构建严格串行；盘 ≥85% 先停清；打包工具链不再常驻生产机（mot-sdk/mot-gradle 卷已删，安卓打包改助手 VM 侧另行安排）。
- 小程序 AppID 已取得：wxfc47179d51798ba2（名称 Yao准时）；AppSecret 未提供，微信真实接口（登录/手机号补验/扫码）仍待配置联调。

## 追记（2026-10-23 夜 · 小程序体验版上线与真机首测修复）
- AppSecret 已由负责人提供并写入服务器 deploy/.env（mode 600，仅此一处）；假 code 登录回微信 errcode 40029（凭据被微信接受）。request 合法域名已在公众平台登记 https://mot.ulife.vip；代码上传密钥已生成（私钥仅存助手侧 ~/workspace/user/files/mp_upload_private.key，mode 600，IP 白名单未开），miniprogram-ci 上传通道跑通。
- 体验版迭代：1.0.0 首发（负责人真机扫码）→ 1.0.2 → 1.0.3 → 1.0.4；体验码有效期至 2026-10-30；未提审、未发布。
- 真机首测连环缺陷（均为助手交付检查漏项，已逐项修复）：① config.API_BASE 误指 localhost——真机请求全灭（1.0.2 修）；② 登录页仅手机号、邮箱注册账号登不进（1.0.2 补邮箱+密码登录，后端 /auth/login 本就按 @ 分流）；③ 小程序 endpoints 未做响应形状归一化（成员 {own,authorized}、授权 {granted,received}+字段名、会话/计划/历史/打卡分页包装、提醒 {items}、依从计数字段、库存字段映射），症状为成员恒 0/设置白屏/授权假死（1.0.3 在 endpoints 层按 Web 同口径归一化，typecheck 全过）；④ 设置页仍白屏——根因小程序运行时 Intl 不完整，lib/time 的 fmtDateTime 在渲染期裸调 Intl.DateTimeFormat 抛错（页面 useEffect 从未触发、后端零请求可证），1.0.4 将 time.ts 全部 Intl 调用 try/catch+手工兜底，并给 app.tsx 加全局 ErrorBoundary（渲染抛错显示错误文本而非白屏）；⑤ 创建计划报英文 "prn parameters are only allowed for prn plans"——双端 PlanForm 对非 PRN 计划传 prn 字段=null、后端以 !== undefined 判定为已提供（1.0.4 双端改整字段缺省、后端判定改 != null 容错、plan.service 校验文案全量中文化）。
- 微信绑定/授权登录：后端 /auth/wechat/bind 与小程序登录接口本已实现，缺的是可达入口——设置页有绑定按钮但被白屏堵死；1.0.4 在「我的」页新增绑定微信行（未绑显示入口、已绑显示已绑定徽标），绑定后 profile 刷新 hasWechat。待负责人真机完成绑定并以微信一键登录复验（预期落 user_oauth_binding 一行）。
- 真机已实证（负责人 2026-10-23 晚）：邮箱+密码登录进云路账号；扫码确认登录 Web 成功（20:06 后端日志全程吻合，B5 真机联调完成）；成员数据、计划列表读取正常。
- 新增需求（负责人 2026-10-23 夜提出）：添加药品支持拍照录入（拍药盒/说明书 → 识别药名 → 回填搜索由用户确认选中）。待立项：候选路线为微信 OCR/第三方 OCR 免费额度或多模态模型识图，须守零预算与「AI 不得编造药品信息」红线（识别结果只作搜索词、必须命中药品库才可选用）。
- 待办：负责人真机复测 1.0.4（设置页、创建计划、绑定微信、微信一键登录）；D5/D6 提醒全流程（打卡扣库存/snooze/missed）仍未测；提审/发布待负责人下令。
- **原生端提醒方式裁定（负责人 2026-10-23 夜）**：适用范围 = Android / Windows / macOS / iOS 原生与桌面端（小程序受平台限制不适用，维持订阅消息+站内口径）。模型 = **弹窗打底 + 强提醒二选一**：弹窗通知恒为基础层（恒开，不设关闭项）；强提醒为三态单选 `strong_alert_mode ∈ {none, alarm, voice}`，默认 none，**闹钟与语音互斥**（alarm=全屏+持续响铃至处理；voice=语音播报药名与剂量、按提醒周期重复播报至打卡）。落位与提醒周期同构：成员级默认存 care_settings，计划级可覆盖（空=跟随成员）。各端能力口径：Android 三种完整实现；Windows/macOS 弹窗=系统通知、闹钟=置顶窗口+循环铃声、语音=系统 TTS；iOS 降级口径——无第三方全屏闹钟，alarm 退化为连续通知+提示音，voice 依赖通知与应用内 TTS，须在端内明示。实现排期：随各端正式开发轮次落地（schema 迁移 + care-settings 契约扩展 + 各端呈现层），不阻塞当前未签名验证包构建。
- **GitHub 构建线复活（2026-10-23 夜，负责人将仓库转 public）**：公开仓库 Actions 免费，release.yml 全线可用。Run #3（develop 全端）：桌面 Win/macOS/Linux ✅ + 小程序 dist ✅；安卓 ❌（setup-android 默认装已淘汰 tools 包）→ 修法已提交 543fe2a（显式 packages，网页端改 workflow）；iOS ❌（JSONHelpers.swift 102/105 行 Swift 6 try? 扁平化后双层绑定非法）→ 已修推送 db4fe72。**Run #4（安卓单独）✅ 成功（4m18s，未签名 Release APK 产物 11.5MB）——安卓端首次完整编译通过**。**Run #5（iOS 单独，db4fe72）✅ 成功（1m27s，无签名 .app 产物 984KB）——至此六端构建全绿**（桌面 Win/mac/Linux + 安卓 APK + iOS + 小程序 dist，产物均在各 Run 页可下载）。负责人夜令（22:22）：少投入求最优、少弹确认、做完所有能做的（含公众号菜单/指南/公告后台配置），晨间一并汇报。拍照录入比选稿已备 docs/research/PHOTO_ENTRY_OPTIONS.md（推荐 GLM-4V-Flash 多模态主通道+护栏，本地未推送——推送需审批，待负责人醒后随里程碑合并推送）。
- **微信公众号通知线（负责人 2026-10-23 夜新增，待确认类型后立项）**：负责人已申请微信公众号、拟与小程序联动做通知，要求进一步开发公众号功能。定位=补齐微信持久推送通道（小程序订阅消息为一次性授权；服务号模板消息可直达且点击跳小程序页）。开发包轮廓：后端新增公众号通知提供者（与小程序订阅并列）+ 关注事件回调与 openid 捕获 + UnionID 归一绑定（未打通时扫码兜底）+ 模板消息发送（字段可带药名）+ 公众号菜单/服务器配置 + 消息中心与关怀设置渠道开关加「公众号」档；AppSecret 只进服务器 deploy/.env（mode 600，不落记录）。**前置事实已确认（负责人 2026-10-23 22:17 后台截图）**：该号为**个人订阅号、未认证**——名称 Yao准时（与小程序同名、同 logo 头像），公众号 ID（原始 ID）`lifeservices`，学校认证 南昌理工学院、绑定视频号 xSofty。结论：个人订阅号**无模板消息**、仅每日 1 次群发且折叠收纳，**不能作提醒推送通道**；可用作门面入口（菜单关联小程序、指南/公告）。推送通道成立需另注册**企业/个体/组织主体服务号 + 微信认证（¥300/年）**。**负责人裁定（2026-10-23 22:19）：没有收入时不投入——公众号线按零成本降级**：该个人订阅号只做入口（菜单关联小程序、指南/公告，关联免费），不做认证、不注册服务号；模板消息推送整包冻结，待产品有收入后重启（开发包轮廓已存档，届时直接开工）。当前提醒通道维持：小程序订阅消息（攒授权）为主 + 后续短信兜底。**2026-10-23 夜实测：公众平台切号列表里没有本公众号**——其管理员微信与小程序管理员不是同一个（小程序管理员名下另有公众号「AI题升」、服务号「妙微科技」，未动）；公众号后台配置（关联小程序/菜单/指南草稿/关注回复）须负责人用公众号管理员微信扫码登录后才能做，全套素材已备至 ~/workspace/medontime-oa/（配置清单+指南图文稿），届时约 5 分钟配完；群发未代发。
- **订阅消息接入（2026-10-23 夜续）**：公众平台已开通订阅消息功能；公共库无医疗类长期订阅模板，选用一次性模板「服药提醒」（健康管理类目），priTmplId `2S6XZXrPDUFeIK0TEhQo91bZDvgbPt31bqW7Y1vXgLg`，字段经微信 API gettemplate 实测：thing1=服药人、time2=服药时间（示例 10:30）；服用药物/剂量/药箱名称为常量关键词（需枚举审核）本轮未选。后端：WechatMiniappService 新增 sendSubscribeMessage；WechatSubscribeProvider 真实实现替换占位（openid 取 user_oauth_binding provider='wechat'；errcode 映射 43101→WECHAT_SUBSCRIBE_NO_CREDIT、47003→BAD_ARGS、40037→BAD_TEMPLATE）；NotificationModule 引入 AuthModule，AuthModule 导出 WechatMiniappService；deploy/.env 增 WECHAT_SUBSCRIBE_TEMPLATE_ID 与 WECHAT_SUBSCRIBE_MP_STATE=trial（发布后改 formal）。小程序 1.0.5 已配置 SUBSCRIBE_TEMPLATE_IDS 并上传。一次性订阅语义：用户授权一次仅发一条，产品侧靠每次打开/打卡时重复请求订阅累积额度（勾选「总是保持」后静默累积）；待真机全链路实测（绑微信→订阅→建近时刻计划→到点收微信消息）。

## 追记（2026-10-24 午 · agy 修复五批收尾 + 云曦独立验构建）

- F4 原生（17/17）、F5 文档（18 修 + 3 延后）经 Flash 续跑链完成，巡检 cron 自停；F2（Web/Admin 15 项 + 小程序 7 项转交）、F3（小程序 15/15）此前已完。
- **纠正：F1 后端并非全完**——FIXLOG-backend.md 仅含 21 行（§1–§4），R1 共 42 条；巡检「含统计」判据被行内「统计照护人上限」一词误触发（无统计节）。未覆盖 21 条 = §5 药品/计划/库存 5 条、§6 提醒/打卡/依从/通知 5 条、§7 AI/后台 4 条、§8 补审 7 条；其中 §8-19（ai_provider_config 单一生效索引）已由 v16 迁移实际落地，§8-20（ops 探针）所依赖的 pingRedis 已写但无调用方（ops.service 未改）。
- 云曦独立验构建（2026-10-24 午，助手 VM）：初验后端 3 处 TS 报错、Web/Admin vite 构建失败——均为修复批自身引入，已亲手补修：① token.service.ts parseTtlSeconds 索引空值守卫；② reminder-queue.service.ts ping 调用点类型收窄（BullMQ IRedisClient 抽象无 ping 声明）；③ apps/web 与 apps/admin vite.config.ts 增加 build.commonjsOptions.include 覆盖 packages/shared（workspace 软链 CJS dist 的 __exportStar 重导出 Rollup 无法追踪）。补修后四端构建全过：api nest build ✅、web vite build ✅、admin vite build ✅、miniprogram taro weapp build ✅；原生仍 code-only 未编译验证。
- 差分审计（对 2026-10-24 10:57 快照 med-on-time-baseline-20261024.tar，排除 node_modules/dist/.git）：141 个文件有改动，均在预期范围（docs、apps/*、services/api、packages/api-client README）+ 新增 v16 迁移；无 .github/workflows 改动、无 .env 文件、无新增 eslint-disable（命中三处均为基线既有）。
- 待决：F1 续批（缺失 21 条）是否立即派 agy Flash 续跑；F5 延后 3 项（#13 JWT TTL/启动守卫代码层缺陷、#15 注销期满清理缺定时任务、#18 project.config.json 属 JSON 配置）是否并入续批；修完再合并不推送（已知严重项未清前不建议推送部署）。

## 追记（2026-10-24 15:50 · F1 续批完成并经云曦复验）

- F1 续批（R1 缺失 21 条，§5–§8）经 agy Flash 两轮完成：首跑 14:51–15:22 改了代码但死于写 FIXLOG 前（jetski 空转 125）；巡检 15:31 重拉第 1 次，15:34–15:44 核实已落地修复、补尾 ops 探针接线与 admin 两项、落盘 22–42 行与统计节。
- 全批 42 条最终口径：39 FIXED、2 BY-DESIGN（#12 无码抢注、#17 邮箱场景枚举，均 V1.3 裁定）、1 DEFERRED（#37 user_refresh_token 死表与内存 Store——按简报口径不硬改认证主链，现状已在 FIXLOG 写清，待后续迭代处置）。
- 云曦复验（2026-10-24 15:4x）：后端 `pnpm --filter @med-on-time/api build` 通过；services/api 对 10:57 快照差分共 57 个文件有改动（含新增 ssrf.util.ts 与 v16 迁移），覆盖 §5–§8 全部目标模块；抽查 #22 计划取消待触发实例、#27 投递前活跃校验、#36 sanitizeHtml 白名单重构，代码均属实。
- 教训：曾用 `find -newermt` 两次误报「0 个文件变动」（与 stat 实测矛盾，根源未明）——文件变动核查以后以 stat/diff 对照快照为准，单一命令结果不作数。已同步记入助手侧 AGENTS.md。
- 待办：推送 + 部署（含生产执行 v16 迁移）待负责人拍板并提供 SSH 口令；F5 延后 3 项与 #37 一并待决。

## 追记（2026-10-24 16:4x · 审查修复批次推送 + 部署完成）

- 推送：develop `a44afa2`（179 个文本文件：五批修复 + v16 迁移 + Logo 接线文本文件）+ 补推 `860fdf2`（见下）。Logo 二进制（各端 PNG/ICO）与一处已删的安卓矢量前景图仍未上 GitHub——快照通道只收 UTF-8 文本，二进制须走网页端上传，待后续处理（不影响线上，部署走本地文件直传）。
- 部署事故与处置：首轮三镜像全挂——F3 改 `apps/miniprogram/package.json` 时删了 `react-dom` 依赖又改 lint 脚本，未同步 `pnpm-lock.yaml`，Docker 内 `pnpm install --frozen-lockfile` 校验失败（本地构建因 node_modules 已装而漏检）。处置：恢复 react-dom 一行（与锁文件对齐，lint 改动保留），补推 `860fdf2` 并同步服务器后重跑，全过。教训：验构建必须包含一次干净的 frozen-lockfile 安装校验，光跑 build 不够。
- 部署结果：api/web/admin 三镜像串行重建并重启（api healthy）；**v16 迁移已在生产执行成功**（prisma migrate deploy 输出 Applying + All applied；库内 ck_ 约束与两条部分唯一索引 `uq_adherence_daily_stat_whole_member`、`uq_ai_provider_config_active_capability` 实查存在）。
- 冒烟全过：mot/admin/blog 与 /api/ops/health 均 200；/api/ops/ready 返回 db up + redis up（#41 pingRedis 接线在生产生效）；api 近 10 分钟日志 0 error。
- 磁盘：构建后一度 90%，已 builder prune 回收约 7GB → 81%（14G 空闲）。
- 传输备忘：当日 SSH 链路 scp 极不稳定（多次 0 字节落盘），最终靠「逐片传到 scp 报 100% 为止 + 拼包 sha256 校验」走通；口令仅经环境变量临时使用，未落任何记录。

## v0.2.1（2026-10-24，用户实测 v0.2.0 后反馈 9 项）
- 后端：验证码登录与密码重置双通道（手机短信 + 邮箱；邮箱场景 login/reset）；依从统计口径修正（已有打卡/跳过记录的剂量不被「未到点」门禁排除，提前打卡立即计入）。
- Web：验证码登录/重置弹窗加手机号/邮箱切换；设置页账号时区改 Select（IANA 列表）；微信绑定改扫码确认全链（后端 bind-tickets 票据 + 状态轮询 + bind-confirm，小程序 bind-confirm 页与 scan-login bind: 路由）。
- 桌面：medontime:// 协议层把 /api/* 转发 https://mot.ulife.vip（修扫码二维码与密码登录「请求失败（HTTP 200)」同根问题）；Menu.setApplicationMenu(null) 去默认菜单栏；version 0.2.1。
- 安卓：正式签名接入——keystore 由云曦生成（用户保管原件与密码），4 个 Actions secrets 就绪；build.gradle.kts env 驱动 signingConfigs.release + 工作流解码步；versionCode 2 / versionName 0.2.1。
- 验收口径：五批 agy 修复（21 项）均经云曦独立重跑构建（api/web/desktop/小程序）+ diff 范围审计 + 关键逻辑抽查；工作流改动经原文逐字节 diff + YAML 解析复验（7232cb0 缩进事故 → 51c3b5b 修正）。

## 追记（2026-10-24 午间 · F5 文档一致性修复批次，本地会话状态合并）

- 来源：服务器工作区快照（2026-10-25 对齐前）的本地版 SESSION_STATE.md；对齐时本地工作区为脏状态，快进前已用快照兜底，本文远程版（微信绑定扫码确认 10-24 晚 + 部署追记）保留为正文，本节仅补记本地版独有的任务记录，避免覆盖。
- 本地版记录：F5 文档一致性修复批次，R4-docs.md 21 条逐条复核结清（18 FIXED，3 DEFERRED），FIXLOG-docs.md 已落盘，全仓 Markdown 文档与定版实现及裁定自洽；F1–F4 批次已全部完成。
- 核对：F5 完成口径（18 修 + 3 延后，延后项 #13/#15/#18）在本文后续追记中已有记录，无内容丢失。

## 追记（2026-10-25 · P2 三套主题换肤 + 验证后两轮修复，分支 fix/p2-ui-themes 待 PR）

- 范围：design-system/medontime/tokens.json（247 Token）+ tokens.css + MASTER-A/B；Web/Admin/小程序/安卓/iOS 五端接入主题切换（data-theme 0/a/b，localStorage 键 medontime-theme，默认 0 现行绿白；A 暖阳关怀蓝主色暖白底、B 临床极简蓝主色冷白底直角无阴影）。分支基线 develop b5ceb81（PR #1 合并后），未提交未推送未部署。
- 验证后第一轮修复（浏览器验证 2026-10-25 08:48–08:54，生产域名临时子路径预览，验证后已删）：Admin eye 图标 span 改原生 button（可 Tab、aria-label）；Web 焦点环 2px→3px、深色按钮双环；主题 0 占位符 #9AA5A0→#5B6660（白底 5.98:1，小程序同步）；登录页两文字链接补 44px 触控高；OaArticlesTab #999/#eee 改读主题 token；Admin 三套主题加 controlOutlineWidth: 3。
- 验证结果：Web 5 项通过（加载布局、焦点环目视、主题 B、切回 0、未登录重定向），3 项仅目视未量化（占位符、触控高、主题 A 暖白色值）；Admin 5 项通过（布局、eye 键盘、dashboard 重定向、切回 0），主题 B 初验不通过（登录卡片圆角/阴影未跟随）+ eye 按 Enter 误触表单校验。
- 验证后第二轮修复：登录卡片圆角/阴影改读 token（borderRadius 12/12/0；loginCardShadow 0 强阴影/A 柔和阴影/B none，见 apps/admin/src/theme.tsx）；eye 按钮加 onKeyPress 拦 Enter 冒泡（根因：ProForm BaseForm 默认 Enter 提交表单）。针对性复核两项均通过；附注：切换后焦点回密码框属 antd 既有行为，紧接着再按 Enter 是密码框内提交（正常行为），非缺陷。
- 构建/测试：后端 7 套件 54 测试全过；Web/Admin/小程序构建与 typecheck 全过；产物静态复核通过（双环、44px、#5B6660、显示密码 aria-label、controlOutlineWidth 均已编入）。安卓/iOS 未编译未真机验证；6 档视口、130% 缩放、对比度实测、灰度走查未做；关键操作对比度 7:1 未达成（按 AA 4.5:1 定案，0: 6.5:1、A/B: 5.93:1）。
- 预览清理已完成：服务器临时 nginx 子路径位置已删、/home/ubuntu/preview 已删、/home/ubuntu 权限恢复 750，生产站 200 正常；Admin main.tsx 临时 basename 补丁已还原。/tmp 脚本（ssh-proxy.sh、deploy-preview.sh 等）在运行时重启后丢失，已重建并移至 workspace 持久保存：~/workspace/ssh-proxy.sh、~/workspace/medontime-review/deploy-preview.sh、cleanup-preview.sh。
- 待办：代码审查结论 → 提交 → 推送 → 提 PR（develop）；部署待 PR 合并后按正常 update 流程走。

## 2026-10-25 备份恢复演练脚本入 git（chore/backup-drill，未提交）
- 背景：2026-10-25 10:53 恢复演练首次跑通（备份 medontime-20261025-103239.dump，159 表一致、行数 0 差异、总行数 414=414），用户要求备份相关进 git 管理。范围：演练脚本 + 文档；备份 dump 文件不进 git（.gitignore 已有 deploy/backups/，且 dump 含生产用户数据）；本机 SSH 包装脚本（~/workspace/medontime-review/server-*.sh）留本地，不进仓库。
- 新增：deploy/scripts/restore-drill.sh（通用演练脚本，服务器上跑；默认最新备份、可传参指定；校验 PGDMP 魔数 + pg_restore -l 清单 → 一次性 postgres:16-alpine 容器 → 预建 medontime 角色 → docker cp 传 dump 恢复 → 逐表核对表清单与行数 → 删容器；生产库只读）；docs/DEPLOY.md「备份与恢复」下补「恢复演练」一节。
- 验证：脚本已在服务器实测通过（退出 0：清单 2062 行、恢复 0 报错、159 表一致、414=414、容器已删）。演练教训已写入脚本注释与文档：docker exec 读 stdin 用 cat 管道或 docker cp（重定向在 ssh 下两次喂空报 too short）；medontime 账号无建库权限须用一次性容器；缺角色时 159 条 OWNER TO 报错仅改属主、不影响数据。
- 审查（2026-10-25）：0 Critical/High、1 Medium（M1：pg_restore 报错时 set -e 使诊断分支不可达）、7 Low。已全部修复：M1 用 set +e 捕获退出码；L1 容器名加 $$；L2 /tmp 固定文件改 mktemp -d（trap 一并清理）；L3 openssl 依赖改 /dev/urandom；L4 docker run 加 --rm；L5 相对路径以调用方 cwd 为基准（文档示例同步改）；L6 成功信息改为显式 cleanup 后打印。L7（stderr 任一行即判失败）保留保守策略。修复后重测：默认与显式传参两遍均退出 0；另用 1.1M 截断 dump 验失败路径：打印“恢复失败（退出码 1，1 行报错）”+ 诊断、退出 1、容器已删。
- 待办：提交 → 推送 → 提 PR（develop）。

## 2026-10-25 生产默认 API 地址修复（fix/prod-api-base-url，未提交）
- 背景：用户反馈安卓真机邮箱验证码登录报“网络不可用”。根因：安卓默认 API 地址为 http://10.0.2.2:3000/（仅模拟器可用），真机请求根本发不出去；服务端日志证实请求未到达，SMTP 已配好。用户要求排查其他平台同类问题。
- 排查结论（全端默认 API 地址）：
  - 安卓：http://10.0.2.2:3000/ —— 真机不可用（本次上报的 bug）。
  - iOS：Info.plist APIBaseURL 与 Release 回退均为 https://api.medontime.example.com/api（占位域名，不存在），Release 包真机同样不可用；plist 注释写明“上线前替换为生产域名”，从未替换。
  - 小程序：https://mot.ulife.vip/api —— 正常；Web/Admin：相对 /api 同源 —— 正常；桌面：/api 转发至 https://mot.ulife.vip —— 正常。
  - 仅开发期出现的 localhost（vite.config /api 代理、桌面 dev 脚本、安卓 network_security_config 明文白名单）不影响生产包，未动。
- 修复：安卓 DEFAULT_API_BASE_URL → https://mot.ulife.vip/；iOS Info.plist APIBaseURL 与 AppConfig.swift Release 回退 → https://mot.ulife.vip/api，plist 注释同步更新。安卓设置页提示文案读 BuildConfig 动态生成，无需改。
- 待办：代码审查 → 提交 → 推送 → 提 PR（develop）；与 release.yml 修复 PR 一并合并后，删远程 v0.3.0 tag 重推，让重发的 v0.3.0 安装包自带正确默认地址。

## 2026-10-25 v0.3.0 发布失败修复（fix/release-miniprogram-zip，未提交）
- 背景：v0.3.0 tag 已推，CI 6 个构建任务全成功，“汇总发布 Release”失败、Release 无产物。日志查明：softprops/action-gh-release 按文件名扁平化上传附件，小程序 dist 各子目录大量同名文件（index.js/index.json/index.wxml）互相覆盖/竞态，最终 GitHub API 报 already_exists（ReleaseAsset name）致命错误。v0.2.1 同一步也失败过，但 21 个产物最终齐全；本次无任何构建产物进 Release。
- 修复（.github/workflows/release.yml）：小程序任务在构建后把 dist 打成单个 MedOnTime-miniprogram-dist.zip 再上传（zip 内保留目录结构，散件同名无害）；发布说明与头部注释同步更新。本地验证：YAML 解析通过；用本地 dist 实测 zip 步骤（66 文件、135K，index.js 在 zip 内 26 处同名共存无问题）。
- 待办：代码审查 → 提交 → 推送 → 提 PR（develop）；用户合并后删远程 v0.3.0 tag 重推，重新触发 CI 发布。


## 2026-10-25 v0.3.0 重推发布（进行中）
- PR #4（小程序 dist 打 zip）与 PR #5（安卓/iOS 默认 API 地址改为生产域名）均已合并（21:05/21:06，develop 现为 cf35859）。
- 远程 v0.3.0 tag 已删并在新 HEAD cf35859 重推（新 annotated tag，注明重推原因）；本地与服务器工作区均已快进到 cf35859，tag 已同步。
- 新 CI 运行 40196220084 于 21:08 启动（head cf35859），in_progress；约 21:30 检查发布结果。

## 2026-10-25 安卓/iOS 分组返回适配（fix/mobile-grouped-responses，未提交）
- 背景：用户登录安卓后“今日提醒”页报 JSON 解析错误：`$.data` 期望数组却收到对象 `{"own":[...]}`。根因：服务端 2026-10-23 契约定版后 GET /members 返回 `{own, authorized}` 分组对象，Web/小程序已适配归一化，安卓仍按旧口径期望 `List<MemberDto>`；今日页先拉成员列表，第一步即抛错。iOS 同款问题（MemberService 解码 `[MemberDTO]`）。
- 排查（契约例外口径全量核对）：安卓另有两处同类错配——GET /authorizations 期望 List、服务端返 `{granted, received}`；GET /account/sessions 期望 List、服务端返 `{items, total}`。adherence summary/calendar、reminders today 的 DTO 已与契约一致，无需改。iOS 三处同款（members/authorizations/sessions）。
- 修复：安卓新增 MembersGroupedDto / AuthorizationsGroupedDto，sessions 改用既有 PageData；仓库层合并 own+authorized、granted+received、取 items。iOS 新增 MembersGroupedDTO / AuthorizationsGroupedDTO / PagedDTO；MemberDTO 加 CodingKeys 把后端 `access` 映射到 accessLevel（此前字段名对不上，isOwn 恒真）；三处服务层同样合并/解包。
- 待办：代码审查 → 提交 → 推送 → 提 PR（develop）；用户合并后随下个版本发布（需重新打包安卓/iOS，线上 Web/API 不动）。

## 2026-10-25 21:37 分组返回适配审查后修复（fix/mobile-grouped-responses，未提交）
- 审查结论：0 Critical/High，1 Medium + 3 Low，须再修。M1：iOS MemberDTO 把 `access` 映射进 accessLevel，被授权成员副标题会显示英文 "caregiver" 而非级别（Web 口径为 level）；L2：iOS AuthorizationDTO 的 memberName/grantorNickname 恒为 nil（服务端字段名为 memberDisplayName/grantedByNickname）。
- 已修复：MemberDTO 改为 extension 内自定义 init(from:)，accessLevel 按 Web 口径派生（owner → owner，否则 level ?? "caregiver"），memberwise 初始化不受影响；AuthorizationDTO 加 CodingKeys 映射两个字段名。
- 未修（另起跟进，不阻塞）：L1 安卓 MemberDto 缺 accessLevel/authorizationId（成员上限计数与编辑/删除门控对被授权成员不准，服务端隔离兜底）；L3 会话 current 字段服务端从不下发（需服务端补 current: s.id === sid）。
- 待办：针对 M1/L2 窄复审 → 提交 → 推送 → 提 PR（develop）。

## 2026-10-25 v0.3.1 发布（已完成）
- PR #6（移动端分组返回适配）已合并（21:48，develop 现为 c051e94）。
- v0.3.1 tag 已打在 c051e94 并推送（补丁版本：分组口径修复）；本地与服务器工作区均已快进到 c051e94，tag 已同步。
- CI 运行 40199410798 全部成功，v0.3.1 Release 已发布（6 个附件，干净无散件：app-release.apk 12.6MB、MedOnTime-miniprogram-dist.zip、三端桌面包、iOS 包）。

## 2026-10-26 管理端登录 401 文案修复（进行中）
- 用户报：admin.ulife.vip/login 上密码错也弹三条“登录已过期”。根因：管理端 request.ts 把所有 401 都当会话过期，丢掉后端“用户名或密码不正确”原话；登录页每失败一次弹一条，三条=点了三次。
- 同类扫查（Web/小程序/Android/iOS/桌面）：均无用户可见同类问题——Web 与小程序保留后端原话、Android 解析错误体原话、iOS 登录走 postPublic 绕过刷新且保留原话；桌面复用 Web。残留小毛病（登录 401 时 Web/小程序/Android 在有残留 refresh token 时会多发一次无用刷新）未修，记为跟进项。
- 修复（分支 fix/admin-login-401-message）：request.ts 加 authCall 选项，鉴权调用的 401 保留后端原话、不刷新、不清会话、不跳登录；adminLogin 传 authCall: true。类型检查与构建均通过。代码审查 0 Critical/High/Medium，可合（仅 2 Low：L1 文件头注释已过期，已顺手改；L2 观察项，不改）。PR #7（https://github.com/xusofty-cyber/med-on-time/pull/7，服务器提交 c27adb4）已于 20:28 合并，develop 现为 f68d1b5。已部署上线：部署前备份 medontime-20261026-202924.dump（1.2M）；update.sh 跑完，三容器已重启（api healthy），mot/admin 均为 200，/api/ops/health 返回 code 0，线上 Admin bundle 含 authCall，修复已生效。部署中云澈侧 SSH 曾断开一次（Broken pipe），但脚本在服务器上跑完了，未受影响。另确认今早 03:30 第一次自动备份已跑出（medontime-20261026-033001.dump），定时备份通了。

## 2026-10-26 安卓强提醒语音/闹钟失效修复（进行中）
- 用户报：语音从没响过；改闹钟后 21:30 那次也没响铃。查库：21:30 那次（01a17865）服务端正常 reminded；成员设置 21:27:41 刚改成 alarm，但计划覆盖仍为 voice（10-24），计划覆盖优先于成员设置——所以 21:30 那次实际仍走语音，闹钟根本没被测到；语音本身仍未播出。
- 根因（App 侧）：ExactAlarmReceiver 异步初始化 TTS 后立即返回，进程可能在播出前被系统杀掉；且 90 秒去重先记后播，失败一路把另一路也拦住；TTS 失败全程静默。TTS 引擎已由用户实测排除（系统试听有声）。
- 修复（分支 fix/android-voice-test-and-harden）：VoiceAnnouncer 改悬挂式 enqueue，判 init/setLanguage/speak 返回值并返回诊断；DoseAlerter 去重只记成功，失败不记且留 lastVoiceError；ExactAlarmReceiver 用 goAsync + 唤醒锁（新增 WAKE_LOCK 权限）保到语音排队完成；设置页加“试听语音”按钮（报真实状态）与计划覆盖生效展示（防再误以为成员设置已生效）。
- 代码审查：首轮 0 Critical、2 High（H1 setLanguage 判定只认 0、H2 去重不再原子）+ 2 Medium + 8 Low，均已修；窄幅复审 verdict 可合（0 Critical/High/Medium），新发现 2 Low（voice 分支吞取消异常、setLanguage 异常误报）已顺手修掉。用户授权：不再经用户审核，由云澈直接合 PR 并发 v0.3.2。注意：本机无 Android SDK，无法本地编译，靠审查 + Release 构建验证。

## 2026-10-30 安卓 TTS 初始化失败根因与修复（v0.3.3）
- 用户报：v0.3.2 设置页「试听语音」报“语音引擎初始化失败”，但系统设置里 TTS 测试发声正常。
- 根因：AndroidManifest.xml 缺 `<queries>` 的 TTS_SERVICE 声明；targetSdk 34 下 Android 11+ 包可见性过滤使 App 无法绑定系统 TTS 引擎服务，TextToSpeech 初始化必返回 ERROR。系统设置属系统应用、不受过滤——10-26 记录中“TTS 引擎已由用户实测排除（系统试听有声）”的排除依据不成立，特此纠正：10-26 修复（进程保活/去重/诊断）都对，但初始化这一关一直没过，所以语音从未真正播出。
- 修复：① AndroidManifest 补 TTS_SERVICE queries 声明；② VoiceAnnouncer 初始化抽 initEngine 助手，默认引擎失败时枚举已装引擎按包名逐个兜底（上限 3），诊断口径不变（initOk/enginePackage 取成功实例）；③ 安卓 versionCode 2→3、versionName 改 0.3.3（注：v0.3.2 发布时 gradle 版本号未同步，APK 内仍为 2/0.2.1，本次起对齐发布线）。
- 验证口径：本机无 Android SDK，靠 CI 安卓构建 + 用户真机复测（试听出声 + 到点语音提醒）。

## 2026-10-30 全项目审查 P0 五条修复（第一批）
- 背景：10-30 全项目审查（7 专家组，总结论在助手侧 medontime-review/full-review-2026-10-30/00）定级 P0 五条，负责人令先修。本批全部由云曦亲手实现并本地验证。
- P0-1 次日提醒空洞：根因是被取消实例占幂等键、生成 createMany skipDuplicates 永不重建。修复在 reminder-generation.service.ts 的 generateForMember：createMany 后把本轮排程命中、未来时刻的 Cancelled 实例复活为 Pending（清 snoozeUntil），随后既有补登记逻辑自动补投递任务；小时节拍保证恢复后 ≤1h 修复。新增 reminder-generation.spec.ts 3 用例（复活/过期不复活/正常生成）。实测：api build 通过、jest 全量 8 套件 57 用例全过（此前 4 套件加载失败系本地依赖漂移，frozen 安装后自愈，印证审查 M-2）。
- P0-2 桌面已服仍提醒：桌面契约 DesktopReminderItem 补 status/snoozeUntil（types.ts + web 侧 lib/desktop.ts 同形声明 + Today.tsx 同步载荷）；主进程 sanitize 校验状态、sync 时终态（taken/skipped/cancelled/missed）剔除并记 fired 防复活、snoozed 以 snoozeUntil 为触发时刻。web typecheck、desktop tsc 均通过。
- P0-3 iOS 提醒链：ReminderService 新增 todayAndTomorrow（今日 + 按成员时区 byDate 明日）；排程改名 scheduleUpcomingReminders 并在今日页加载时排今明两日；新增 ReminderScheduleRefresher（回前台重排 + BGAppRefreshTask 6h 续期，Info.plist 已登记 fetch 后台模式与任务标识）；CareSettingsView 强提醒说明改如实口径（iOS 无系统强音、语音仅前台）。本机无 Xcode，靠 CI iOS 构建验证；APNs 仍为独立立项（需后端推送通道）。
- P0-4 质量门禁 CI：新增 .github/workflows/ci.yml（push/PR 到 develop/main：frozen 安装 → prisma generate → api build/test → web/admin typecheck → desktop tsc），内容按本地全绿口径校准；工作流文件经 GitHub 网页端提交（集成通道写 workflows 会 403）。release 发版与 CI 的强制依赖关系未动（需改 release.yml，列后续）。
- P0-5 update.sh：顺序改为 拉取 → 强制备份（失败即中止）→ 构建 → 一次性容器先行迁移 → 换容器 → 健康检查；新增 --no-pull（回滚到已检出提交用，配套 DEPLOY 回滚口径）。bash -n 通过；未在生产执行过，下次部署首次实跑需留意。

## 2026-10-30 全项目审查第二批修复（结构补强，10 项）
- 登录防爆破：新增 LoginThrottleService（Redis 状态、15 分钟窗口失败 5 次锁 15 分钟、Redis 故障 fail-open），用户端 login() 接入（账号+IP 双维度，失败双记、成功双清）；管理端原进程内 Map 锁定整体迁到同一服务（scope=admin）；验证码发送加 IP 维度限频（单 IP 1 小时跨目标 20 次）；TokenService 生产守卫：ADMIN_JWT_SECRET 缺失或与 JWT_ACCESS_SECRET 相同直接拒启动。⚠️ 部署前必须先确认服务器 deploy/.env 已配独立 ADMIN_JWT_SECRET，否则新版 api 拒启动。
- 注销终局：新增 AccountLifecycleService + BullMQ 每日 03:30 扫描（+启动补跑）：冷静期届满账号同事务终局——账号行墓碑化（phone/email 密文与哈希、密码、昵称、头像物理清除）、成员匿名化存档（保留匿名统计维度）、病历/病史/紧急联系人物理删除、计划停止+实例取消+授权双向撤销+微信解绑留痕+设备行删除，事务后吊销会话，audit_log 落 system 记录（只记计数）；withdrawCancel 加到期禁撤销。注销申请的 doc 注释同步改实（原写「由 ops 定时任务执行」此前并无此任务）。
- 过敏校验：PlanService 建/改计划（改计划仅明细变更时）比对成员过敏档案（drug/drugCategory/allergenCode 三路匹配），响应加 allergyWarnings（不拦截）；Web PlanForm 命中后展示红色强警告面板，须点「我已知晓」才关闭表单。
- PRN 端点：POST /plans/:planId/prn-intakes（CheckinService.recordPrnIntake）：校验计划 PRN+active、照护 L2+ 双记，间隔（与前后相邻记录双向比对）/单日上限（成员本地日计数）命中先 409，confirmWarning 重提落 warned_confirmed；clientRequestId 幂等；同事务扣库存并写流水（prnIntakeId）。此前 prn_intake_record 无任何写入方，本端点为唯一入口；客户端 UI 接入列后续。
- 推送诚实状态：app_push 日志桩不再记假 success，改记 suppressed_not_configured + errorCode=PUSH_NOT_CONFIGURED（迁移 v17 扩展 result CHECK）；真实通道（极光/APNs/FCM）接入仍待立项，接前所有 app_push 在投递日志中如实显示「通道未配置」。
- 扫码确认展示：新增 GET /auth/scan-login/tickets/:id/preview（发起端平台/设备/时间）与 GET /auth/wechat/bind-tickets/:id/preview（目标账号昵称+脱敏手机/邮箱），均需登录态；小程序两确认页改为先拉预览展示、加载失败禁用确认按钮（fail-closed）。
- 安卓：ExactAlarmReceiver 到点后从 SessionStore 落盘载荷链式接排下一条精确闹钟（sync 时落盘全量载荷，cancelInstance 同步剔除防复活）；VoiceAnnouncer 后台路径总预算 7s（首试 ≤4s、兜底 ≤2s/个），不再多引擎各等 8s 撑爆接收器 9s 窗口；TTS 固定走 USAGE_ALARM 音频通道（媒体音量 0 不再无声）；诊断 enginePackage 改报实际发声引擎。versionCode 4 / 0.3.4。
- iOS：本地通知排程按「计划覆盖 > 成员设置」解析强提醒方式（AppEnvironment.planStrongAlertOverrides 拉计划列表建表，失败回落成员级），今日页与后台刷新两条排程路径均已接入。
- 桌面：ReminderScheduler 调度落盘（store.ts 的 PersistedState.reminders），main 启动 whenReady 时 restore() 恢复（重启/被杀后不等渲染层重同步）；Web 同步改全成员合并（Today 页 syncDesktopAll，逐成员拉时间线+各自 care 设置，条目级 showDrugDetail，载荷级恒 false）。
- DDInter 文档：TECH_RESEARCH_REPORT 正文 5 处上线指令全部改写为 POC-1 否决口径（表格行、免费组合结论、P0/P1 路径、POC-3 方法）。
- 验证：api build 通过、jest 11 套件 68 用例全过（新增 throttle 4 + lifecycle 3 + PRN 4）；web typecheck、miniprogram typecheck、desktop tsc 通过。安卓/iOS 无本地工具链，靠 CI 构建验证（随本批推送后触发）。

## 2026-10-30 全项目审查第三批修复（对齐欠账，可闭环项）
- 负责人令：上班期间自主推进、不逐项授权，能做的先做完。本批由云曦亲手实现并本地验证；未部署生产。
- 版本单一源：根 package.json 的 version 为唯一事实源，全仓对齐 0.3.4（api/web/admin/desktop/miniprogram/shared 原 0.1.0 与桌面 0.2.1、iOS 1.0.0 全部归一；iOS MARKETING_VERSION=0.3.4，Swagger setVersion 同步）；新增 scripts/sync-version.mjs（根目录 pnpm version:sync）一键同步各包/安卓 versionName/iOS MARKETING_VERSION/Swagger；安卓 versionCode 与 iOS 构建号为单调计数，仍人工递增（脚本内有提醒）。
- JWT TTL 三方统一：代码与配置本已是契约口径 access 2h / refresh 30d（configuration.ts + TokenService 常量 + DEPLOY.md 一致），冲突源是 deploy/.env.example 与 services/api/.env.example 的 JWT_ACCESS_TTL=30m，两处已改 2h。
- Refresh 轮换原子化 + 复用检测：SessionService.rotateSession 收敛到存储层原子消费——Redis 实现为 Lua 单步（校验 jti/过期/吊销并同一步写入 rotatedAt+revokedAt+吊销键，杜绝先查后吊销的并发双花），内存实现同步语义对齐；已轮换旧 token 重现时，宽限期 10s 内（并发/重试）只判失效，宽限期外判疑似盗用 → 全量吊销该账号会话并拒绝（RFC 6819）。新增 session-rotation.spec 4 用例。注：内存实现的重放证据随吊销保留期 2h 清理，Redis 实现保留至会话原到期。
- 配置启动校验：新增 config/validate-env.ts 接入 ConfigModule validate——生产环境 JWT 三密钥与 DATABASE_URL 缺失或三密钥彼此相同直接拒启动（与 TokenService 既有守卫双保险），密钥长度 <32 仅警告（不打挂存量部署），非生产只警告。新增 5 用例。
- 安全响应头：API main.ts 加全局中间件（nosniff / X-Frame DENY / Referrer-Policy no-referrer / HSTS / CORP same-site）；apps/web 与 apps/admin 的 nginx.conf 加页面级 CSP 等六头（server 级 + /assets/ 重复一份，避 nginx add_header 继承失效），connect-src 放行 https:/wss: 供桌面端与跨源 API。
- api-client 空壳处置（决策落档）：packages/api-client 自始为空壳（仅 export {} + orval 配置）、Web/Admin 零代码引用——本批移除该包、删除两端 workspace 依赖、重生锁文件、README 目录树同步。契约事实源仍为后端 OpenAPI（/api/docs）+ packages/shared 手写类型；未来真要生成客户端，以独立任务按当时 API 面重新生成，不再留空壳占位。
- 关怀字号达标：Web 关怀根字号 20px（≈15pt）→24px（=18pt，UI 规范下限），rem 体系随之达标；小程序 .care-on 下 tx-md/tx-sm/tx-xs/btn/input/field-label/chip/badge 全部抬至 ≥48rpx（=18pt；原 30–42rpx≈11–16pt），标题层级 56/52rpx 保留。
- Web 信封口径统一（审查 02 M2）：成功判定由 code===0||200 改为只认 0；Login/App/api 三处 401 死判断（code===401，后端业务码实为 40100）改判 40100，与 Admin 口径一致（httpStatus 兜底保留）。
- 杂项：小程序 project.config.json 的 appid 由 touristappid 改为真实 wxfc47179d51798ba2；桌面端根目录孤儿 main.js/preload.js 删除（现行入口为 dist/main.js、preload 走 dist/preload.js，electron-builder 打包清单从未包含根目录两文件）；session.service.ts 头部「schema 缺口待补 user_session 表」过期注释已改实（Redis 实现为现行事实源）。
- 验证：frozen 安装通过；api build 通过、jest 13 套件 77 用例全过（新增 rotation 4 + validate-env 5）；shared 构建、web/admin/miniprogram typecheck、desktop tsc 全过。原生端本批无代码改动（仅 iOS MARKETING_VERSION 与 MP 配置/样式），仍随推送触发 CI 复核 + 打包抽验。
- 本批未动（待单独立项/负责人拍板）：i18n 三语 UI 落地（全端工程量大，需专门排期与译文校对流）；真实推送通道 APNs/极光/FCM（需付费开发者账号与厂商配置，零投入原则下冻结）；证书绑定 pinning 落地（裁定为软失败监控型，需先定告警通道与证书轮换口径）；异地加密备份与告警（动生产服务器与外部存储，须负责人发令）；refresh token 存 localStorage 的改造（审查 07 H2 另一半：改 httpOnly cookie 涉及全端登录态契约变更，单独立项）。

## 2026-10-30 续批一：refresh 改 httpOnly cookie（审查 07 H2 后半）
- 负责人 08:51 发令单独立项。后端双模（services/api/modules/auth/auth-cookie.ts + auth.controller.ts）：登录/注册/邮箱注册/小程序登录/验证码登录/扫码轮询确认/刷新成功后统一经 withCookie 下发 httpOnly cookie「mot_refresh」（Path=/api/auth、SameSite=Lax、生产 Secure、Max-Age 与 jwt.refreshTtl 同口径）；POST /auth/refresh 改为 body 优先、cookie 兜底，cookie 模式必须带 X-Mot-Client: web 自定义头（CSRF 门槛）；RefreshDto.refreshToken 改可选；logout 兼收 cookie 并清 cookie。cookie 选项经控制器 ConfigService 注入（守配置隔离红线，模块不直读 env）。原生/小程序/桌面继续 body 模式，AuthService.refresh 汇合（原子轮换+复用检测不变）。新增 auth-cookie.spec 5 用例；api jest 14 套件 82 用例全过。
- Web（apps/web/src/lib/api.ts）：access 改只驻内存；浏览器 refresh 走 cookie 静默恢复（App 启动 ensureSession → me）；桌面壳维持 body 模式（refresh 存应用 localStorage）；旧版 localStorage 里的 refresh 仅作一次性迁移刷新，成功后清除、后续走 cookie；401 重试判定改为无条件尝试刷新（cookie 模式下 tokenStore.refresh 恒 null，旧判定会误杀）。Login/Register/Layout 调用面不变。
- Admin 侧实情与处置：后端管理员根本没有 refresh（AdminAuthController 仅 login、8h access、无刷新端点），前端却存着一套永远 404 的 refresh 死代码——本次删除死代码链（tryRefreshTokens/getRefreshToken/updateTokens），token 与管理员信息由 localStorage 改 sessionStorage（关标签即失效），401 直接清会话跳登录。若将来要管理员长会话，须先在后端立项管理员 refresh+会话存储，不在本次范围。
- 验证：api build + jest 82/82；web/admin typecheck 全过。未部署生产（部署仍须先配独立 ADMIN_JWT_SECRET，见第一批记录）。

## 2026-10-30 续批二：异地加密备份上线（审查外·负责人发令）
- 链路：服务器每日 03:30 backup.sh 出明文 dump（原样不动）→ 新增 03:45 cron 跑 deploy/scripts/backup-offsite.sh：age 公钥加密最新 dump 到 deploy/backups/offsite/*.age + sha256，服务器侧加密副本留 14 天；云曦本机每日 04:20 cron（medontime-backup-pull）跑 ~/workspace/medontime-backups/pull-offsite.sh 拉取，sha256+全解密+PGDMP 魔数三重校验，留存=近 30 天全量+其后周备 12 份；失败经 HookBox 告警（source=medontime-backup）+聊天报告，成功静默。
- 密钥：age 私钥仅存云曦本机 ~/workspace/user/files/medontime-backup-age-key.txt（600），服务器只有公钥（age1e5vex…smhpx9u）与 ~/bin/age v1.2.1；私钥建议负责人再在密码管理器留一份（本机 home 若丢，异地副本无人能解）。
- 首轮实测（2026-10-30 09:26）：medontime-20261030-033001.dump 加密 1,210,743B → 拉取校验全过，解密 1,210,255B 与服务器明文大小一致。
- 附带修复（云曦侧工具）：tsconnect.py 非阻塞 sendall 大流量必断的 bug 已改缓冲+可写事件驱动；ssh_config_ts 的 IdentityFile 必须写绝对路径（本机 ssh 以 root 运行、~ 按 passwd 展开 /root，这也是负责人加钥后我两度误判「被拒」的原因——钥一直是对的）。
- 服务器磁盘 86%（剩 9.7G）：备份体积小（~1.2MB/天）不受影响，但已越过 85% 纪律线，后续部署前须先清。

## 2026-10-30 续批三：i18n 三语落地·Web 端（框架定版见 docs/dev/I18N.md）
- 框架定版（技术对齐欠账闭环）：Web/Admin/小程序用自研类型化字典（zh-CN 为事实源，zh-TW/en 以 Record<keyof zhCN> 约束键集合，漏译编译期报错，零新增依赖）；原生走平台资源（Android strings.xml / iOS Localizable.strings）；Admin 另加 antd 官方 locale。繁体一律台湾用语口径。语言存 localStorage mot.locale、默认 zh-CN，设置页新增「界面语言」切换卡，即时生效并同步 html lang。
- Web 全量落地：运行时 lib/i18n（tr/useT）+ store 语言状态；lib/dict.ts 16 组枚举标签与 types.ts 强提醒/周期标签改函数式现取；Layout/登录注册扫码/今日/计划/计划表单/选药/成员/授权/健康档案/库存/依从/通知/设置（含时区城市名、主题名、注销规则全文）/落地页/ui 基础组件/api 兜底文案全部词条化。三语词条同键对齐（以 zh-CN 键数计，见 i18n/zh-CN.ts），typecheck + vite build 全过。
- 边界（已在 I18N.md 登记）：后端业务错误 message 仍为简体（服务端按 locale 处理为后端待办）；药品内容数据走 DB locale 内容组，不属 UI 词条。

## 2026-10-30 续批三（2）：i18n 三语落地·Admin 端
- 与 Web 同构的类型化字典（apps/admin/src/i18n/，zh-CN 事实源、键集合类型约束）；theme.tsx 的 ConfigProvider 按语言下发 antd 官方 locale（zh_CN/zh_TW/en_US）并同步 dayjs locale；顶栏新增语言切换 Select（与主题切换并列），语言存 localStorage mot.locale（Admin 独立源）。
- constants/labels.ts 全部枚举字典改函数式现取（*Meta/*Text 签名不变，*Map/*Enum 改函数、调用点已同步）；AdminLayout 菜单/顶栏/主题名、登录、仪表盘、账号、成员、计划监管、药品库（含双人核验与 seed 导入文案）、审计、客服裁决、内容管理三页签（文章组/公众号文章/协议版本）、应用版本、大模型配置、request 层兜底文案全部词条化。typecheck + vite build 全过。
- Web 端 i18n 已推送 develop（8a5563f，经 commits 列表核实；首次推送被审批超时 SIGTERM 未落地、后台重推成功——推送后必须核 HEAD）。

## 2026-10-30 续批三（3）：i18n 三语落地·小程序端
- 与 Web/Admin 同构的类型化字典（apps/miniprogram/src/lib/i18n/，zh-CN 事实源 570+ 键、键集合类型约束，漏译编译期报错）；语言存 Taro storage mot.locale、默认 zh-CN；设置页新增「界面语言」SegTabs 切换卡；app.tsx 启动与语言变更时同步 tabBar 文案（setTabBarItem），各页 useNavTitle 同步导航栏标题（index.config.ts 保留简中默认）。
- lib/dict.ts 17 组枚举标签与 lib/types.ts 强提醒/周期预设、lib/theme.ts 主题清单全部改函数式现取；lib/notify.ts 订阅授权文案、lib/api.ts 兜底文案、components（ui/MemberBar/PlanForm/DrugPicker/EmailCodeButton/SmsCodeButton）与全部页面（登录/注册/今日/计划/计划编辑/成员/授权/依从/消息中心/我的/扫码登录/绑定确认/设置）文案全部词条化。全 src 汉字扫描残留仅注释、分隔符与 app.config 默认值（运行时被覆盖）。
- 验证：tsc --noEmit 全过；taro build --type weapp 构建成功（16.8s）。注意：字典追加时 auth.wxNoCode 与既有键重名过一次（TS1117），已去重——后续追加块先查键名冲突。

## 2026-10-30 续批三（4）：i18n 三语落地·Android / iOS（原生收官）
- Android（平台资源方案）：res/values、values-zh-rTW、values-en 三份 strings.xml 同键 70 条（通知通道 + 底部导航 + 通用 + 登录注册全量 + 今日提醒全量 + 设置·界面语言）；AppNav 底栏、Common.ErrorBox、AuthScreens（含 AuthViewModel 校验/提示文案，经 AppContainer.appContext 取词）、TodayScreens（含 TodayViewModel 兜底文案）全部改 stringResource/getString。逐应用语言：新增 appcompat 1.7.0 依赖，MainActivity 改 AppCompatActivity，宿主主题父类改 Theme.AppCompat.Light.NoActionBar（全 Compose 渲染，无原生控件样式面），res/xml/locales_config.xml + Manifest localeConfig 与 AppLocalesMetadataHolderService（autoStoreLocales）；设置页新增「界面语言」单选（跟随系统/简/繁/英，AppCompatDelegate.setApplicationLocales）。其余业务屏（计划/成员/依从等）文案仍为简中，列为后续逐屏迁移（资源键就绪后按同法推进）。
- iOS（Localizable.strings 源串键方案）：Resources 下新增 zh-Hans/zh-Hant/en 三份 Localizable.strings 同键 122 条（键=简中文案；含枚举标签、Tab、今日、登录、主题名与空状态文案）。新增 Core/L10n.swift（InterfaceLocale：偏好存 UserDefaults mot.locale，"" 跟随系统；L() 按当前语言从对应 .lproj 取词）。SharedEnums 全部 72 处 label 改 L() 现取；DesignSystem 主题名/说明改 L()，EmptyStateView 参数改 LocalizedStringKey（8 处调用点均为字面量，自动按环境语言取词）；AuthViewModel 提示文案改 L()，LoginView 两处 rawValue Picker 与倒计时按钮改 L()；RootView 注入 environment(\.locale)；设置页新增「界面语言」Picker（跟随系统/简/繁/英，@AppStorage 与 RootView 同键）。XcodeGen 按源码树收录 .lproj（变体组），实际打包效果以打包工作流复核为准；CFBundleDisplayName 仍为「药准时」（InfoPlist.strings 未做，列后续）。
- 至此续批三四端 + 桌面（复用 Web）三语全部落地。边界不变：后端业务错误 message 仍简中（服务端按 locale 化为后端待办）；原生非核心屏与 iOS 其余 Feature 视图按同法逐屏迁移列后续。

## 2026-10-30 续批三收官注记：推送竞态与修复（云曦实测）
- 事故：Admin 首次推送在连接器侧长跑约 43 分钟，其间同参数重试均被等价写锁拒绝；小程序首次推送实际失败（"Reference cannot be updated"，先前交接所报 a160d33 系误报、该 SHA 不存在）。Admin 长跑推送最终落地为 f681828 时基于较早父提交更新 ref，把其间一度落地的提交盖出历史，小程序代码一度不在 develop 树上（get_file_contents 实查确认）。
- 修复与现状（11:47 实查）：小程序以新提交 00abd87 重推落地，远端链完整且顺序为 00abd87（小程序）→ f1292e6（原生）→ f681828（Admin）→ da8aaba（落档）→ 8a5563f（Web）→ f058753（cookie）；关键文件抽查（MP/Admin i18n 运行时、安卓 values-en、iOS L10n.swift）均在树。CI：f058753 #14、8a5563f #15、f681828 #17 均 Success（浏览器实查 Actions）。
- 纪律（已同步 ~/AGENTS.md）：推送串行化，一笔落地并抽查树后再发下一笔；全部结束后复核完整提交链与关键文件存在性；交接所报 SHA 必须自己复跑验证。
- 最终核验（11:53，浏览器实查 Actions）：CI #18（f1292e6 原生）Success、CI #19（00abd87 小程序重推，当前 HEAD）Success；手动触发 Release #29（targets=all、develop@00abd87、未勾选 publish）：桌面 Win/macOS/Linux、安卓 APK（assembleRelease 3m35s）、iOS 无签名 .app、小程序 dist 全部成功，汇总发布 skipped（预期）。至此 2026-10-30 三项续令（异地加密备份 / refresh cookie / i18n 三语）全部完成并推送 develop、CI 与打包双核验通过；均未部署生产（部署前置不变：服务器先配独立 ADMIN_JWT_SECRET + 磁盘 86% 先清）。

## 2026-10-30 推送通道切换：连接器快照推送 → git 直推（云曦实测）
- 用户裁定：改走 git 直推，免逐次授权。GitHub 账号 xusofty-cyber 已添加本机 SSH 公钥「Muse VM (yunxi)」（指纹 SHA256:/RqHgBHDKbqU3w1GooVZqk3phJAtCtciUcziat3nDsM，2026-10-30 13:36 经 sudo 邮箱验证码确认添加；既有钥匙未动）。
- 通道：22 端口直连被出口代理重置，须经 HTTPS_PROXY 的 CONNECT 隧道——仓库已配 core.sshCommand 指向 ~/workspace/.tools/ssh/ssh_config_gh（ProxyCommand 复用 .tools/ssh/tsconnect.py，凭据只读环境变量）。本地空壳 .git 已替换为正式克隆（HEAD 5779423 与远端一致）；对账差异仅 ci.yml 本地缺失（已从远端恢复）与 update.sh 本地多可执行位（内容一致，已还原）。
- 本条即首笔直推实测提交；此后代码推送默认 git push（串行、推后核链纪律不变），.github/workflows/ 仍不可由连接器写、git 直推可写（待后续实际验证），连接器保留为只读核验与应急通道。

## 2026-10-30 生产部署记录（云曦执行，用户条件令「评审修复完成即部署」）
- 第一步核验（部署门禁）：对照 R1–R4 + F1–F5 + 全量审查三批总账逐项实查闭环——F5 文档批移交的三项已由代码批消解：#13 JWT TTL（TokenService 已读 jwt.accessTtl 配置 + validate-env 生产硬校验）、#15 注销终局（AccountLifecycleService.runDueCancellations + 引擎调度 + 单测）、#18 project.config（真实 AppID wxfc47179d51798ba2）；F1 后端 #37 会话内存化已由 Redis 会话存储落地；F2→F3 的 MP-01…07 全 FIXED；native 批 DEFERRED 为 0。仍开口者仅用户亲裁冻结项（真实推送通道、证书 pinning）与功能后续项（PRN 前端录入），不属评审修复范围。
- 部署：develop@d12f02e（CI #21 Success）经 update.sh --no-pull 首次生产实跑上线（服务器先行 git pull 快进并核 HEAD）。前置：磁盘 86%→清 builder 缓存 9.7G 至 72%；deploy/.env 实查三密钥齐全两两不同、NODE_ENV=production（ADMIN_JWT_SECRET 前置已满足，零改动）。构建串行（COMPOSE_PARALLEL_LIMIT=1）；发布前备份通过；迁移应用 1 条（20261030090000_v17），migrate status 复核 up to date；滚动替换 api/web/admin，redis 与其他服务未动。
- 踩点：首跑在备份关卡中止——deploy/scripts/*.sh 在 git 中为 100644，update.sh 直接 exec backup.sh 报 Permission denied（脚本按设计中止、线上未受影响）；服务器侧 chmod +x + git core.fileMode=false 后重跑成功；本提交同时把脚本可执行位修进 git 根除。
- 部署后核验：容器 api(healthy)/web/admin 均新镜像 Up；公网烟测 mot 200、/api/ops/health 200（code:0）、/ready 200、admin 200、blog 200（未动）；部署后磁盘经二次清理（builder 5.8G）为 76%/剩 16G。

## 2026-10-31 安卓真机修复 0.3.5：进程不在时收不到通知（用户真机反馈）
- 现象与定因（云曦逐段拆链实查）：账面链路（精确闹钟+WorkManager 双通道、链式自排、开机重排、IMPORTANCE_HIGH 通道）完整，但全链以「进程能被唤醒」为前提；App 无前台服务、无电池豁免申请、无自启动引导，国产 ROM 划掉/回收进程后厂商省电冻结闹钟与接收器——进程不在时通知与语音全灭，进程活着时正常，与真机现象吻合。昨日云曦按代码账面答「照样响」属核验不到位（无真机证据），已向用户更正。
- 修复（全在 apps/android）：①新增 ReminderGuardService 前台服务（specialUse 类型，登录后常驻、低重要性无声通道，通知正文报下一剂且遵守锁屏隐私口径；冷启动/登录进主界面/开机三处拉起，登出自停，每次启动自检 token 并自愈同步时间线）；②最近一剂闹钟升级 setAlarmClock（系统最高优先级、Doze 与多数厂商冻结豁免、不依赖精确闹钟授权状态，失败逐级降级回精确/普通闹钟）；③设置页「提醒权限」新增后台保障三项：守护运行状态与开启、电池优化豁免申请、自启动厂商页跳转（AutostartHelper 逐厂商试开+兜底应用详情）；④语音路径随进程常驻回暖（TTS 不再靠冷启现拉）。
- 版本：0.3.4→0.3.5（sync-version 同步 9 文件），安卓 versionCode 4→5。验证口径：本地无安卓工具链，编译以 CI Release 安卓 job 为准；最终以用户真机复测（划掉后台→到点看通知栏+语音）为验收标准。
- 发布环节缺陷（2026-10-31 实测）：release.yml 的 publish 汇总 job 以 needs 依赖四端 job，targets 单选（如 android）时其余 job 被 skip、汇总被连带 skip，不生成草稿 Release——单端发版须手动建 Release（本次 v0.3.5 用 manual-31 手动发布）。修复方向（待排期）：publish job 改为 if: always() + 校验所需 job 结果，或按 targets 拆分发布 job。因 workflow 文件连接器不可写、git 直推可写未验，下次改时走 git 直推一并验证。
