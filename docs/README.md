# 药准时 文档索引（2026-10-23 更新）

> 接手项目先读 [`HANDOVER.md`](HANDOVER.md)（接手指南：文档地图、运行与部署路径、口径裁定、已知缺口）。

## 一、设计定稿（冻结基线，PDF 在 GitHub Release）

| 文档 | 定稿版本 | 说明 |
| --- | --- | --- |
| 药准时用户端功能需求分析 | **V1.8** | 六端共用逻辑：用药计划、提醒展示、服药打卡、家庭多人管理、Web 端专项 |
| 药准时后台管理平台功能需求分析 | **V1.5** | 用户管理、药品维护审核、委托照护（5A 章）、提醒规则、RBAC、合规、客服裁决 |
| 药准时数据库表结构设计 | **V1.2** | PostgreSQL 15+，**56 张表 / 9 个域**；locale 主表列 + 内容组键；枚举速查 |
| 技术架构设计（`architecture/TECH_ARCHITECTURE.md`） | **V1.5（已确认冻结）** | 全端技术选型与分层；选型口径：大型项目验证过的成熟技术 |
| UI 设计规范 | **V1.0** | 医嘱绿 #0B6B4F、关怀模式度量（≥18pt / ≥7:1 / ≥56）、多语言 简/繁/英 |

PDF 原件不进仓库（GitHub 政策与体积原因），发布于 Release **design-v1.0**：https://github.com/xusofty-cyber/med-on-time/releases/tag/design-v1.0 （指向 main@a31d53c，5 份 PDF 齐全）。设计评审全过程记录（24 决策点 + 11 扩展项）在项目负责人侧归档，接手以定稿 PDF + 本索引所列增补文档为准。

## 二、开发与契约（随代码演进的活文档）

| 文档 | 说明 |
| --- | --- |
| [`dev/API_CONTRACT.md`](dev/API_CONTRACT.md) | 全端共同开发契约：信封/校验/JWT 定版、frequency_rule 与 cycle 定版、用户端 + 后台接口清单、列表响应形状例外表 |
| [`dev/AUTH_CHANNELS.md`](dev/AUTH_CHANNELS.md) | 注册验证通道裁定（V1.3）：微信/邮箱先行、手机号未验证三受限、业务码 40312/40320/40321/40910 |
| [`dev/INTEGRATION_NOTES.md`](dev/INTEGRATION_NOTES.md) | 集成收口记录、DB V1.3 候选清单、2026-10-23 线上巡检修复全表、生产待接项 |
| [`dev/ENDS_OVERVIEW.md`](dev/ENDS_OVERVIEW.md) | 各端概要设计（实建版）：后端模块地图 + 六端结构、关键流程、构建与状态 |
| [`dev/TEST_CASES.md`](dev/TEST_CASES.md) | 测试用例与验证记录：11 组用例、已验证证据、缺陷修复闭环、未覆盖面清单 |
| [`DEPLOY.md`](DEPLOY.md) | 部署手册（通用流程 + 附录 B 当前生产实例实况） |
| [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) | 长期架构事实与硬约束（单一事实源） |
| [`../SESSION_STATE.md`](../SESSION_STATE.md) | 会话断点：已完成事项、验证证据、未完成步骤与风险 |
| [`prototype-brief.md`](prototype-brief.md) / [`admin-prototype-brief.md`](admin-prototype-brief.md) | 用户端 / 后台可点击高保真原型说明（已验收） |

## 三、预研与 POC

| 文档 | 说明 |
| --- | --- |
| [技术预研报告](research/TECH_RESEARCH_REPORT.md) V1.1 | AI / 药品数据源选型（零预算版） |
| [POC-1 报告](research/POC1_REPORT.md) | 说明书层 CPM-DDI-KG 有条件通过；相互作用层不通过（DDInter 数据永不入生产库），替代打法待 POC-3 |
| [POC-1 质检运行报告](research/POC1_QC_RUN.md) | 25,738 份说明书质检结果与缺陷模式 P1–P6 |
| [POC-1 队列处理报告](research/POC1_QUEUE_PROCESSING.md) + `research/queue/` | 首期 200 药定版：approved 182 / pending_review 18 |
| [POC-2 方案](research/POC2_PLAN.md) | AI 模型评测（120 题）；**已暂停**，恢复须项目负责人提供智谱 Key 与讯飞 APIPassword |
