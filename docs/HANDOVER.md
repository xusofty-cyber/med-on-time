# 药准时 MedOnTime 接手指南（2026-10-23）

> 本文件是新接手者的**第一份文档**：五分钟建立全局图景，之后按图索骥。细节不在此重复，只给入口与口径；与代码/定稿冲突时，以定稿文档与代码为准，并回头修本文件。

## 一、项目速览

- **是什么**：全平台用药提醒系统——账号管理多位家庭成员（本人也是成员），照护人经逐对授权（L1 查看 / L2 协助 / L3 配置）代管用药计划、代打卡、代收提醒。
- **形态**：一套后端 API + 六端（Web 门户、微信小程序、Android、iOS、PC 桌面、后台管理）。
- **状态（2026-10-23）**：设计定稿冻结、全量开发完成、**生产已上线**（用户端 https://mot.ulife.vip、后台 https://admin.ulife.vip）；AI 功能未开通（评测暂停）；短信/微信/推送通道未接（见缺口清单）。
- **核心模型一句话**：账号 → 成员 → 计划（条目+阶段）→ 提醒实例（次日生成、幂等）→ 打卡记录 → 依从统计；库存与健康档案挂在成员上；授权决定跨账号可见性。

## 二、文档地图（按阅读顺序）

| 顺序 | 文档 | 用途 |
| --- | --- | --- |
| 1 | 本文件 | 全局与入口 |
| 2 | `docs/README.md` | 文档总索引（含定稿版本表与 Release 地址） |
| 3 | 定稿 PDF（Release design-v1.0） | 用户端需求 V1.8 / 后台需求 V1.5 / 数据库 V1.2 / UI 规范 V1.0 |
| 4 | `docs/architecture/TECH_ARCHITECTURE.md` | 技术架构 V1.5（已冻结） |
| 5 | `PROJECT_CONTEXT.md` | 长期架构事实、红线、决策日志（单一事实源） |
| 6 | `docs/dev/API_CONTRACT.md` | 接口契约与全部定版口径（开发对齐先看它） |
| 7 | `docs/dev/ENDS_OVERVIEW.md` | 各端概要设计（实建版）与模块地图 |
| 8 | `docs/dev/AUTH_CHANNELS.md`、`docs/dev/INTEGRATION_NOTES.md` | 注册通道裁定、集成与巡检修复记录、待接项 |
| 9 | `docs/dev/TEST_CASES.md` | 测试用例与已验证证据（含未覆盖面） |
| 10 | `docs/DEPLOY.md` | 部署手册 + 附录 B 生产实例实况 |
| 11 | `SESSION_STATE.md` | 当前断点、未完成事项与风险（动手前必读） |
| 12 | `AGENTS.md`（仓库根） | 工程红线与常用命令（改代码前必读） |

## 三、仓库与环境

- 仓库：`xusofty-cyber/med-on-time`；`main` 受保护，日常开发在 `develop`。
- 工具链：Node 20+（生产构建用 Node 24 亦可）、pnpm 9；安装依赖注意国内镜像（Prisma engines 走 `PRISMA_ENGINES_MIRROR=https://npmmirror.com/mirrors/prisma`，Electron 设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`）。
- 常用命令（仓库根）：`pnpm install` / `pnpm -r build` / `pnpm -r typecheck` / `pnpm --filter @med-on-time/api dev` 等，见根 AGENTS.md。
- 本地起后端需 PostgreSQL 15+ 与 Redis 7（可用 `deploy/docker-compose.yml` 的依赖服务或自备）；迁移 `pnpm --filter @med-on-time/api prisma migrate deploy`；seed 在 `services/api/prisma/seeds/`。

## 四、生产运行（要点，细节见 DEPLOY.md 附录 B）

- 服务器：腾讯云广州 Ubuntu 22.04；代码在 `~/projects/medontime`（develop 分支）；四个容器 medontime-api/web/admin/redis + 既有 PG16 容器（库名 medontime）；入口 nginx 三域名（mot/admin/blog.ulife.vip，腾讯云证书）反代 28080/28081。
- **红线**：服务器上有用户的其他生产服务（n8n 等），**未经明确指令不得动既有服务与容器**；构建后清理缓存与无用镜像（磁盘纪律）。
- 发版：服务器侧 `git pull` 后跑 `deploy/scripts/update.sh`（或 compose build/up 对应服务）；回滚口径见 DEPLOY.md 第九节。
- 发信：SMTP 已接（QQ 邮箱 smtp.qq.com:465），配置在服务器 `deploy/.env`（SMTP_URL/SMTP_FROM，授权码只存该文件）。
- 冒烟：`/api/ops/health`、`/api/ops/ready` 信封 code=0；药品计数 approved 182 / pending_review 18。

## 五、关键口径裁定（易踩坑，务必先知）

1. **成员数据硬隔离**：一切成员域查询先过归属/授权校验；照护人只看被授权成员。
2. **列表接口形状不统一是定版现状**：分组（members/authorizations）、分页、提醒 `{items}`、依从 `{days}` 各异——全表见 INTEGRATION_NOTES；**新端接入先看该表**，Web 的适配层在 `apps/web/src/lib/endpoints.ts`（2026-10-23 白屏事故的教训：页面直面原始形状曾致整站崩溃）。
3. **注册验证**：手机号是账号根，可未验证注册，但三受限（不开短信提醒/不走手机找回/接受授权先补验）；邮箱与微信是先行验证通道（AUTH_CHANNELS.md）。
4. **提醒次日生效**：生成器只生成次日实例（每小时 :05 + 启动补跑，幂等）；当日新建计划当日已过时刻不补。
5. **健康档案 = 单条健康概况**（血型/身高/体重/医院/摘要），不是病历条目列表；不适记录关联服药事件可选；**健康指标（血压/血糖）不在产品内，不要预留**。
6. **药品数据**：DDInter/QASystem 数据**永不入生产库**；pending_review 18 条双人核验前不得上线展示。
7. **AI 未开通**：POC-2 暂停（等负责人给智谱/讯飞凭据），且上线前必须过外部医学审校；各端只调后端 ai 网关。
8. **客服全权裁决**纠纷（双记录前后值）；证书钉扎软失败（降级标准 TLS）；字段加密仅 AI 会话/报告 + 病历正文。

## 六、已知缺口与建议排期

| 优先级 | 事项 |
| --- | --- |
| P0 | 自动化测试从零补起：API 冒烟 + 契约形状回归（现无任何 jest/E2E 用例，证据靠 TEST_CASES.md 人工记录） |
| P0 | Android / iOS 各跑一次真机/SDK 构建冒烟（源码就绪但从未编译验证） |
| P1 | 短信网关接入（腾讯云/阿里云）→ 打通 A9/B3 与验证码全流程；专业发信服务替换个人 QQ SMTP（有日限量） |
| P1 | 微信正式 appid/secret + 订阅消息模板 → 小程序真机联调（A10/B4/G4） |
| P1 | 提醒到点全流程实测（打卡扣库存、snooze/missed、推送兜底）——D5/D6 |
| P2 | DB V1.3 候选整批升版（user_session 落库、care/prefs 专表、plan cycle 列、drug.precautions 列、dispute 表，清单在 INTEGRATION_NOTES）；会话列表补 current 标记 |
| P2 | POC-3（相互作用替代打法验证）；pending 药品双人核验推进；甲基多巴 NMPA 状态核实、维生素 D3 补录 |
| P2 | 桌面端：Linux 包已验（见 ENDS_OVERVIEW 五）；Windows/macOS 包走 `.github/workflows/release.yml`（Actions 页一键触发，待首跑验证）；后台安全组收紧（8081/28081 仅运维 IP）待负责人拍板 |

## 七、故障定位速查

| 现象 | 先查 |
| --- | --- |
| 前端整页白屏 | 多为接口形状与页面预期不一致（见口径 2）；Web 已有 ErrorBoundary 降级，查浏览器控制台首条错误与 endpoints 适配 |
| 登录后「还没有成员」/ 刷新才恢复 | 登录路径未装载成员（A6 已修）；查 Login/Register 成功路径与 memberApi.list 形状 |
| 某页数据永远为空 | 先用 API 直调看 data 原始形状，再看页面消费口径；不要先怀疑数据库 |
| 提醒没出现 | 看计划是否为 active/scheduled、生成节拍日志（generation tick）、实例只生成次日；Redis 不可用时引擎只记错不阻断 API |
| 邮件验证码不到 | 查 api 日志是 `[SmtpMailSender] 已发送` 还是 `[MAIL stub]`（未配 SMTP 时为桩、不会真发） |
| 部署构建慢/失败 | apk 走腾讯云镜像、Prisma engines 走 npmmirror 已是定版处理；查 DEPLOY.md 故障表 |

## 八、资产与凭据（只记位置，不记值）

- GitHub：xusofty-cyber 账号（**2026-12-06 前须开启 2FA**，否则账号受限——接手第一周内核实）。
- 服务器与数据库凭据：由项目负责人保管（SSH 与 PG 密码同值，历史上经安全渠道交付）；`deploy/.env` 在服务器上（600 权限），含全部运行时密钥。
- SMTP 授权码：只存在于服务器 deploy/.env。
- 管理员账号：`admin`（初始密码由 bootstrap 一次性打印、负责人留存；首登后应改密）。
- 域名/证书：ulife.vip（DNSPod），证书包在服务器 `~/projects/ssl/`。
