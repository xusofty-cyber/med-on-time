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

1. **当前断点（2026-10-23）**：设计阶段评审全部收官（同前）。**开发脚手架已开工并落 `develop` 分支**：pnpm monorepo 全量脚手架（根工作区 + packages/shared 共享枚举 + packages/api-client 生成客户端骨架 + services/api NestJS 16 模块 + Prisma schema 落 56 表 + apps 五端最小脚手架，原生 Android/iOS 仍为 README 占位）与 LICENSE（MIT）已就绪。验证证据（助手 VM，2026-10-23）：`prisma validate` 通过、Prisma Client 生成成功、`pnpm -r build` 7/7 通过、`pnpm -r typecheck` 7/7 通过、api `eslint` 通过。助手 VM 无 Docker/PostgreSQL，迁移实跑与 API 启动冒烟待在有 Docker 的环境执行（迁移脚本已备，见后续下一步）。
2. **文档现行版本**：用户端需求 V1.8、后台需求 V1.5、数据库设计 V1.2（56 张表）、技术架构 V1.5（已推送 main，commit `c18ba30`）、UI 设计规范 V1.0、技术预研 V1.1（零预算版）。需求/数据库 PDF 为 artifact 构建产物，位于助手侧目标目录，未入仓（待发布到 Releases）。
3. **POC 状态**：POC-1 已完成（说明书层有条件通过；质检管线已全量运行，报告见 `docs/research/`）；POC-2（模型评测）资产就绪、**经用户指示暂停**，恢复需用户提供智谱 API Key 与讯飞 APIPassword，不得擅自重启；POC-3（相互作用替代打法验证）未启动。
4. **后续下一步（均待用户发令）**：
   - [x] 技术架构正式冻结确认（2026-10-20 用户确认，口径：选型须为大型项目验证过的成熟技术；TECH_ARCHITECTURE.md 状态已改为已确认冻结）
   - [x] 两个可点击原型（用户端/后台）用户走查完成（2026-10-20：无大问题，通过）
   - [x] 按定稿生成各端脚手架代码（2026-10-23 落 develop：services/api NestJS + Prisma 56 表 + 其余各端最小脚手架，build/typecheck 全绿）
   - [x] 建立 `develop` 分支（2026-10-23，自 main 切出）；选 License（MIT，已落仓）
   - [x] 落 DDL 迁移脚本（2026-10-23 落 develop）：`services/api/prisma/migrations/` 两段——基线 `20261023090000_init`（prisma migrate diff 生成，56 表全量建表，372 条语句）+ 补充 `20261023090100_constraints_partitions`（101 条枚举 CHECK、7 处部分唯一索引、drug 名称 trgm GIN 索引、4 张大表按月分区转换并预建 2026-01~2027-12 分区 + DEFAULT 兜底）；两份 SQL 均经 pglast（PostgreSQL 语法）校验通过。分区取舍：reminder_instance 主键改 (id, scheduled_at_utc)、幂等唯一改 (idempotency_key, scheduled_at_utc)，4 条指向分区表的入向 FK 按 PG 限制删除（列与索引保留，完整性由应用保证），细节见补充迁移文件头注记。**迁移尚未在真实 PostgreSQL 上执行验证**（待 Docker 环境）。
   - [ ] 设计 PDF 发布到 GitHub Releases（design-v1.0 标签，5 份 PDF 附件）
   - [ ] 200 药首期队列处理（2 拦截 + 4 复核 + 11 人工补录）
   - [ ] API 启动冒烟（需 Docker 环境起 PostgreSQL 15 + Redis 7）与首批业务接口实现
5. **待文档小修（DB 设计 V1.3 候选，Prisma 落表时发现）**：
   - 四表（consent_document、ai_prompt_template、ai_safety_rule、app_version）业务 `version`（VARCHAR 版本号）与通用乐观锁 `version`（int）同名冲突：schema 暂以业务 version 占列名、乐观锁映射 `lock_version` 列，待文档裁定（改列名或豁免四表乐观锁）。
   - AI capability 六项取值文档未列全（附录 B 与 9.2 互相回指）：schema 按 9.1 scopes + 9.9 task_type 暂定六项（health_qa、lab_report_interpretation、medical_record_analysis、symptom_analysis、timeline_summary、adherence_insight），shared 枚举仅收前四项确证值，待文档定版统一。
   - plan_info_assist（9.9 task_type）与 plan_info_draft（9.10 report_type）命名不一致；operator_type 两套枚举同名异义（授权日志 account/admin/system vs 附录 B member_self/caregiver/admin_cs/system），待文档消歧。
5. **开放风险 / 待决策项**：
   - AI 主备排序未定：待 POC-2 恢复执行后按评测结果定（双通道 Spark Lite + GLM-4-Flash、DeepSeek 兜底已定版）。
   - AI 上线前必须过一次性外部医学审校，未过则入口不开（需求红线）；生成式 AI 若被认定构成诊断/医疗器械属性须立即下线（后台需求第 12 章）。
   - `run-pipeline.sh` 部署时若覆盖根目录三文档，以本仓库版本为准，部署后需核对。
   - 环境注意事项（2026-10-23 实测）：国内网络下 Prisma engines 二进制下载可能被重置（ECONNRESET），安装时设 `PRISMA_ENGINES_MIRROR=https://npmmirror.com/mirrors/prisma` 可解；助手 VM 的沙箱文件系统上 pnpm 更新已存在的 `pnpm-lock.yaml` / `node_modules/.modules.yaml` 会因 chown EPERM 失败，删旧文件后新建可绕（仅助手 VM 环境问题，用户本机一般不受影响）；该 VM 安装时另设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 跳过 Electron 二进制下载。
