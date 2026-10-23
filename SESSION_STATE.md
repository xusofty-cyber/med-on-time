# 当前会话状态与断点记录 (SESSION_STATE.md)

> **定位说明**：本文件记录当前会话的执行断点、已完成改动、真实验证证据及未完成事项，确保跨会话与跨工具切换时上下文无缝衔接。在有意义的任务/会话边界更新，及时清除已完成或过期的历史内容。
>
> 最后更新：2026-10-20（POC-1 及入库质检管线完成；POC-2 模型评测资产就绪——题集 120 题/运行器/评分器在 ~/workspace/medontime-poc2/，方案见 docs/research/POC2_PLAN.md，待 API Key 到位执行）

---

## 一、当前任务概览

- **关联需求 / Issue**：MedOnTime 项目初始化（需求设计 → 仓库搭建 → Agent Harness 接入）
- **会话目标**：把 AI 健康助手集成进全部设计资产（需求 × 2、数据库、架构），并推送仓库变更

---

## 二、问题根因定位 / 方案设计

1. **核心机理**：用户要求在已有病历上传能力上集成 AI（病历分析、病症分析、用药方案建议），各端统一对接；医疗 AI 合规风险高，需先定产品定位与红线。
2. **改动策略**：产品内称「AI 健康助手」（不叫 AI 诊病）；两份需求文档各增专章（用户端第 14 章、后台第 8A 章）+ 跨章联动；数据库设计升级 V1.1（AI 表，构建中）；架构文档新增 `ai` 网关模块（§3.4）与 ADR；三文档口径对齐。

---

## 三、代码修改与落地清单

- **受影响文件与具体改动**：
  - `docs/architecture/TECH_ARCHITECTURE.md`（修改 → V1.1）：模块表新增 `ai/`；新增 §3.4 AI 子系统设计（网关模式、异步 BullMQ、提示词版本管理、安全审核流水线、成本统计）；ADR 新增 2 条；P1/P2 分期纳入 AI。
  - `PROJECT_CONTEXT.md`（修改）：业务矩阵新增第 6 项 AI 健康助手；新增 2026-10-20 AI 集成 ADR。
  - `SESSION_STATE.md`（修改）：本文件。
  - 需求 PDF（artifact 构建）：用户端 V1.2（24 页，第 14 章）、后台 V1.2（22 页，第 8A 章）——构建产物见 `~/workspace/your_files/`。
  - 数据库设计 V1.1（AI 表）：artifact 构建中，完成后同步。
  - 此前已推送：`c18c1e3e`（骨架）、`eb87a88`（三件套）、`d173ec4`（架构 V1.0）。

---

## 四、严格验证证据门 (Verification Evidence Gate)

1. **测试 / 构建执行**：
   - 本阶段无代码可测；以推送与远端校验为证据。
2. **验证核验证据**：
   - 首次推送 commit SHA：`c18c1e3e4059ff0d2ba4000344d6242807daf3df`（`main` 分支），GitHub 连接器返回成功且用户已批准。
   - 远端校验：`get_file_contents` 读取 `main` 分支 `README.md`，内容为本项目 README（标题 `# 药准时 MedOnTime`），非自动生成的占位文件。
   - `list_branches` 确认仅 `main` 一个分支，SHA 与推送一致。

---

## 五、当前断点与后续待执行事项

1. **当前断点（2026-10-23 晚）**：设计评审收官后已完成**全量开发与集成**（均落 `develop`）：后端四线（身份授权 / 药品计划库存 / 提醒引擎 / 档案内容后台）+ 后台管理端 + Web 用户端 + 桌面端 + 小程序 + Android/iOS 完整工程源码（原生两端无 SDK/Xcode，未编译验证，已如实标注）；集成收口十项销项（JWT 定版一套、关怀/偏好存储统一 system_config KV、frequency_rule 定版、计划级 cycle 覆盖、全局成功信封、启动路径、桌面提醒桥、管理员播种、seed 双实现对齐），结论见 `docs/dev/INTEGRATION_NOTES.md`；全仓 `pnpm -r build`/`typecheck` 7/7 与 api eslint 全绿（助手独立复验通过）。**部署资产已备**：三 Dockerfile + `deploy/docker-compose.yml` + 脚本组（bootstrap-env/db-init/deploy/update/backup/logs/stop）+ `docs/DEPLOY.md`。**服务器部署通道受限**：助手 VM 出口代理仅放行目标 443、SSH/22 不可达（服务器 443 为既有 n8n 服务，不可动），用户 2026-10-23 拍板**方案 A：用户在服务器按脚本自助部署**（clone → bootstrap-env → db-init → deploy 四步），助手待其输出后验收冒烟。**迁移与真实 DB 端到端尚未实跑**，随本次部署一并验证。
   **服务器部署完成（2026-10-23，方案 B：助手经 Tailscale 接管执行）**：服务器（腾讯云广州，公网 154.8.219.189 / tailnet 100.108.115.52）克隆仓于 ~/projects/medontime，deploy/.env 由 bootstrap 生成（WEB_PORT=28080、ADMIN_PORT=28081，因 8080/18080 被既有服务占用）；nginx 三站点 mot/admin/blog.ulife.vip（腾讯云证书）反代 28080/28081 与静态占位，DNS A 记录均指向 154.8.219.189。部署中实修三处缺陷并已回仓：① 补充迁移分区转换时旧表主键索引未随表改名，与新分区表同名相撞（42P07）——四表各补 `ALTER INDEX ... RENAME`，且 ai_call_log 的 request_id 唯一索引补齐分区键改复合（request_id, created_at）；失败迁移经 `migrate resolve --rolled-back` 后重跑，三迁移全部应用成功。② 生产镜像内 @prisma/client 为未生成桩（pnpm deploy 不带 generate 产物）——api Dockerfile 运行阶段 COPY 后补 `prisma generate`。③ 构建环境适配：apk 源换腾讯云镜像（官方 CDN 与阿里源在该机容器内均龟速）、ELECTRON_SKIP_BINARY_DOWNLOAD=1 跳过 Electron 二进制下载。**冒烟验收全过**：/api/ops/health 与 /ready 信封 code=0（db up）；drug 计数 approved 182 / pending_review 18 与定版一致；管理员 admin 登录接口签发 token 成功；api/web/admin/redis 四容器 Up（api healthy）；公网 mot/admin/blog/n8n 均 200，既有服务未受影响。磁盘纪律：构建缓存曾涨至 30GB，已 prune 回收（部署后根盘约 50%）。仍未实测：微信真实接口（无正式 appid）、SMTP 实发（.env 未配 SMTP_URL 时为打码日志桩）；管理员初始密码由 bootstrap 一次性打印、用户已留存，首登后应改密。
   **注册验证通道迭代（2026-10-23 用户拍板并已落地）**：短信网关未接前注册验证微信/邮箱先行、手机号保持账号根可未验证登记、未验证三受限（不开短信提醒 / 不走手机找回 / 接受照护授权须先补验且号码须与邀请一致）。schema V1.3 迁移 `20261023110000_v13_auth_channels` 给 user_account 加 email（密文）/email_hash/email_verified_at/phone_verified_at；后端新端点（邮箱发码/注册、登录支持邮箱、微信小程序登录与绑定、微信手机号补验）与新业务码 40312/40320/40321/40910；Web 注册页双模式、小程序微信一键登录与补验引导已落地；口径全文见 `docs/dev/AUTH_CHANNELS.md`。未实测：微信真实接口（无正式 appid）、SMTP 实发、迁移实跑。
   **SMTP 已接通（2026-10-23 中午）**：系统发信 = 用户 QQ 邮箱（smtp.qq.com:465，SMTP_URL + SMTP_FROM 已写入服务器 deploy/.env，授权码只存在该文件、未入任何记录）；实发测试成功，用户已用邮箱验证码完成注册登录。注册邮箱不限服务商（代码仅 @IsEmail 格式校验，无域名白名单）。
   **线上巡检与契约修复（2026-10-23 下午，用户报障触发）**：用户报 Web 门户点「照护授权」「设置」白屏，下令逐页逐功能验证。浏览器实测复现：两页均在异步数据返回后整树崩溃；连带发现成员装载失败（今日页误报「还没有成员」、整页刷新即掉登录——启动 catch 因 members 形状抛错清空了登录态）与 Web 手机号注册 100% 失败（registerChannel/强制短信码与 V1.3 裁定脱节，此前交付验收只覆盖邮箱通道，系助手验收疏漏）。根因统一为前后端契约不一致，修复已全部上线并逐项实测：前端 endpoints 建归一化层（members 分组、authorizations 分组+字段映射、sessions/plans/history/stock/checkins/adverse 分页解包、reminders 取 items、adherence 字段重命名+days、stock 逐字段映射、病历页签按后端单条健康概况模型重写为「健康概况」表单）；后端三修（手机号注册 smsCode/registerChannel 改可选并默认 web；不适记录关联服药事件改可选——DB 三列可空、原服务硬校验与定版冲突；提醒实例视图补 R-1 存放位置/附加备注/餐前餐后）；App 加页面级 ErrorBoundary 兜底。实测证据：探针账号带数据逐接口验形状与字段全对齐、不适独立记录创建成功、浏览器全页复验（含授权发起、设置静置、刷新不掉登录、未验证账号接受授权被 40321 拦截的提示）——复验结果见本节后续追记。细节全文见 `docs/dev/INTEGRATION_NOTES.md`「2026-10-23 线上巡检修复」节。残留小瑕疵：会话列表无 current 标记（当前会话亦显示退出按钮）；短信验证码登录/重置仍为网关未接的占位失败；api 包无单元测试文件（jest 零匹配为仓库现状）。
   **巡检追记（2026-10-23 晚）**：客户端全页复验通过（白屏全清、预置数据恢复、授权发起/双账号查看、设置页会话与改名、刷新保活；未验证接受授权被 40321 正确拦截）；复验中新发现「初次登录不装载成员」已修（Login/Register 成功路径补 memberApi.list 装载；同源解释用户最初的「还没有成员」截图），后台巡检第 0 项回归通过。提醒实例经查为次日生成口径（每小时 :05 + 启动补跑，只生成次日实例，幂等实证 10-24 实例存在），非缺陷；「当日新建计划当日未过时刻是否即时生效」待用户拍板是否改口径。后台全页巡检完成（admin 登录初期因浏览器自动填充串号客户端测试账号密码多次失败，用户直接提供 admin 密码后完成）：新发现并已修复上线（hotfix5/5b）——仪表盘形状崩溃（后端 dashboard 对齐 DashboardData）、账号手机号脱敏缺失（补 phoneMasked + 完整号码哈希搜索）、后台关键字搜索参数名 keyword→q 映射、用户侧授权动作镜像落 audit_log（actorType=account）、药品详情用法用量 JSON 直显改 text 正文；冻结/解冻与客户端联动实测通过（拒登提示「账号已被冻结」）。同日完成文档完善轮：新建 docs/HANDOVER.md（接手指南）、docs/dev/ENDS_OVERVIEW.md（各端概要·实建版）、docs/dev/TEST_CASES.md（用例与验证证据），修订文档索引/README/API_CONTRACT 过期口径，DEPLOY.md 补附录 B 生产实况。测试账号（13912345678/13912345679 及探针数据）已于本轮收尾时软删清理。
2. **文档现行版本**：用户端需求 V1.8、后台需求 V1.5、数据库设计 V1.2（56 张表）、技术架构 V1.5（已推送 main，commit `c18ba30`）、UI 设计规范 V1.0、技术预研 V1.1（零预算版）。需求/数据库 PDF 为 artifact 构建产物，位于助手侧目标目录，未入仓（待发布到 Releases）。
3. **POC 状态**：POC-1 已完成（说明书层有条件通过；质检管线已全量运行，报告见 `docs/research/`）；POC-2（模型评测）：2026-10-23 用户提供两必需 Key 并下令先跑 GLM 单通道全量——120/120 完成，**结论：GLM-4-Flash 裸通道不通过**（RED 20/20、EMERG 10/10 经人工定案达标，但虚构药名探针 2/4 编造、裸答事实错 3 条；仅可在药品库未收录拦截 + 说明书上下文注入形态下作候选），全文见 `docs/research/POC2_GLM_RESULTS.md`；讯飞 APIPassword 被服务端 401 拒绝（HMAC 不匹配），待用户回控制台核对后补跑星火通道再定主备；GUIDE 与其余人工终审（医学复核）未做。POC-3（相互作用替代打法验证）未启动。
4. **后续下一步（均待用户发令）**：
   - [x] 技术架构正式冻结确认（2026-10-20 用户确认，口径：选型须为大型项目验证过的成熟技术；TECH_ARCHITECTURE.md 状态已改为已确认冻结）
   - [x] 两个可点击原型（用户端/后台）用户走查完成（2026-10-20：无大问题，通过）
   - [x] 按定稿生成各端脚手架代码（2026-10-23 落 develop：services/api NestJS + Prisma 56 表 + 其余各端最小脚手架，build/typecheck 全绿）
   - [x] 建立 `develop` 分支（2026-10-23，自 main 切出）；选 License（MIT，已落仓）
   - [x] 落 DDL 迁移脚本（2026-10-23 落 develop）：`services/api/prisma/migrations/` 两段——基线 `20261023090000_init`（prisma migrate diff 生成，56 表全量建表，372 条语句）+ 补充 `20261023090100_constraints_partitions`（101 条枚举 CHECK、7 处部分唯一索引、drug 名称 trgm GIN 索引、4 张大表按月分区转换并预建 2026-01~2027-12 分区 + DEFAULT 兜底）；两份 SQL 均经 pglast（PostgreSQL 语法）校验通过。分区取舍：reminder_instance 主键改 (id, scheduled_at_utc)、幂等唯一改 (idempotency_key, scheduled_at_utc)，4 条指向分区表的入向 FK 按 PG 限制删除（列与索引保留，完整性由应用保证），细节见补充迁移文件头注记。**迁移尚未在真实 PostgreSQL 上执行验证**（待 Docker 环境）。
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
