# 药准时 MedOnTime —— 技术架构方案设计

> 版本：V1.2（2026-10-20）| 状态：待评审
> 更新：提醒状态机新增「已暂停」终态；新增重复提醒策略、暂停本次提醒语义与语音播报（TTS）设计。
> 依据：《后台管理平台功能需求分析》V1.1、《用户端功能需求分析》V1.1、《数据库表结构设计》V1.0
> 选型原则：**只选用成熟稳定、经过大型项目验证的技术**；不追新、不造轮子。

---

## 一、总体架构

```
                         ┌──────────────────────────────┐
                         │        用户端（展示与交互）      │
 ┌───────────┐  ┌────────┴──┐  ┌────────┐  ┌────────┐  ┌─┴────────┐
 │ Web 门户   │  │ 微信小程序 │  │Android │  │  iOS   │  │ PC 桌面端 │
 │React+TW   │  │  Taro     │  │Kotlin  │  │ Swift  │  │ Electron │
 └─────┬─────┘  └─────┬─────┘  └───┬────┘  └───┬────┘  └────┬─────┘
       └──────────────┴────────────┴───────────┴──────────┘
                              │ HTTPS (RESTful + OpenAPI)
              ┌───────────────┴────────────────┐
              │   后台管理员管理平台 (apps/admin) │
              │   React 18 + Ant Design 5       │
              └───────────────┬────────────────┘
                              │ HTTPS (RESTful + OpenAPI)
              ┌───────────────▼────────────────┐
              │  services/api（后端单体分层）    │
              │  NestJS 10 + Prisma + BullMQ    │
              │  业务模块 │ 提醒引擎 │ 通知网关   │
              └───────┬────────────┬───────────┘
                      │            │
              PostgreSQL 15+    Redis 7
              （业务库，分区表）  （提醒延迟队列/缓存）
```

- **架构模式**：Monorepo + 后端单体分层。各端（6 用户端 + 1 后台）共用同一套后端 API；提醒引擎内嵌于后端，以 BullMQ 延迟任务驱动。
- **契约优先**：OpenAPI 为前后端唯一契约，TS 客户端由契约生成，`packages/shared` 枚举与数据库枚举速查表保持一致。

---

## 二、各端技术选型

| 端 | 选型（版本） | 成熟度依据 | 备注 |
|---|---|---|---|
| **services/api** | Node.js 20 LTS + **NestJS 10** + **Prisma 5** | NestJS（2017-）模块化 + DI，被大量企业级中后台采用；Prisma 为 Postgres-first 成熟 ORM | TS 全栈，与 `packages/shared` 类型零转换共享 |
| **任务调度** | **BullMQ** + Redis 7 | 延迟任务/重试/幂等的事实标准；提醒实例按 `scheduled_at_utc` 入延迟队列 | 替代自研定时轮 |
| **apps/admin** | React 18 + Vite + **Ant Design 5** + ProComponents | Ant Design 是国内中后台事实标准，ProComponents 久经大厂验证 | 路由 React Router v6，图表 ECharts |
| **apps/web** | React 18 + Vite + **Tailwind CSS** + Zustand | Tailwind v3 久经验证，响应式断点体系成熟 | PWA 用 vite-plugin-pwa（P1）；同一套代码适配 PC + 移动 |
| **apps/miniprogram** | **Taro 4**（React 写法） | 京东出品，编译到微信小程序，大量生产案例 | 与 web 共用 React 心智模型；注意订阅消息须用户主动订阅 |
| **apps/android** | **Kotlin** + Jetpack（Compose / Room / **WorkManager** / Hilt / Retrofit） | Google 官方推荐组合；WorkManager 是离线提醒调度的标准件 | 推送：FCM（海外）/ 极光·JPush 聚合（国内厂商通道） |
| **apps/ios** | **Swift** + SwiftUI（必要时 UIKit 互操作） | Apple 官方方向；UserNotifications + APNs | 后台提醒受限，以服务端推送为主 |
| **apps/desktop** | **Electron**（复用 `apps/web` 代码） | VS Code / Slack / Discord 验证过的成熟方案 | 定位为补充提醒（弹窗/托盘）；Tauri 为备选（较新，本期不用） |
| **packages/shared** | TypeScript + **dayjs** + **zod** | dayjs/zod 均为久经验证的基础库 | 类型、枚举、时区工具、剂量单位换算 |
| **packages/api-client** | **orval** / openapi-typescript（由 OpenAPI 生成） | 契约生成客户端的成熟工具链 | 杜绝手写请求层与契约漂移 |

**否决项**：后端不用自研脚手架（维护成本）；管理后台不用小众 UI 库；桌面端本期不用 Tauri（生态与成熟度不如 Electron）；小程序不用原生多端手写（维护 6 端成本过高）。

---

## 三、后端详细设计（services/api）

### 3.1 模块划分（NestJS Module）

```
src/
├── modules/
│   ├── auth/            # JWT（access+refresh）、微信 OAuth、小程序 code2session
│   ├── account/         # 账号、微信绑定、设备、注销（含冷静期）
│   ├── member/          # 成员档案（成员独立建模）
│   ├── authorization/   # 委托照护授权（L1/L2/L3、逐项开关、生命周期、审计）
│   ├── drug/            # 药品档案、品牌/厂商、分类、审核上下架
│   ├── plan/            # 用药计划（归属成员）、计划模板
│   ├── reminder/        # 提醒引擎：实例生成、调度、状态机
│   ├── checkin/         # 服药打卡（含代打卡双记）、补记/撤销
│   ├── adherence/       # 依从性预聚合（按成员按日）
│   ├── notification/    # 通知网关：通道降级与模板渲染
│   ├── ehr/             # 病历条目、过敏史（敏感数据加密列）
│   ├── stock/           # 用药库存、补药提醒
│   ├── content/         # 知识库、公告、Banner
│   ├── ops/             # 运营看板、报表口径
│   ├── admin/           # 管理员账号、RBAC、操作日志
│   └── ai/              # AI 健康助手：网关、会话、病历分析、症状分析、方案草案、安全审核
├── common/              # 统一异常、拦截器（脱敏日志）、守卫（成员隔离）、装饰器
└── prisma/              # schema.prisma（以《数据库表结构设计》V1.1 为准，含 AI 表）
```

### 3.2 提醒链路（核心链路）

```
用药计划（plan）
  → reminder 实例生成器（按频次展开未来 N 天，幂等键防重）
  → BullMQ 延迟队列（按 scheduled_at_utc 投递，Redis）
  → reminder worker：状态机流转（待提醒→已发送→已确认/漏服/已跳过/已暂停）
  → notification 网关：通道降级 App推送 → 微信订阅消息 → 短信/语音(P1)
  → 打卡回写 checkin（含实际确认人；代打卡双记）
  → adherence 日预聚合（分母只计已到期实例）

- **重复提醒**：同一实例在有效窗口内按策略重复触达（默认到点 1 次 + 未确认时每 X 分钟 1 次、最多 N 次，X/N 后台可配）；任一端 已确认/已跳过/已暂停 后立即终止本实例后续提醒。
- **暂停本次提醒**：用户可手动暂停本实例的后续提醒（区别于"稍后提醒"=延迟后继续）；已暂停为终态，不计漏服、不影响下次实例。
- **语音播报（TTS）**：网关下发播报文案（成员称呼 + 药名 + 剂量，如"张妈妈，该吃苯磺酸氨氯地平片 1 片了"）；Web 端用 Web Speech API，移动端用原生 TTS；播报开关/音量/语速可在设置配置；设备静音时仅弹窗不播报。
- **醒目 UI**：待服条目高对比横幅 + 角标计数 + 未确认时呼吸动效；全屏提醒浮层为最高优先级形态。
```

- **成员隔离实现位置**：`common/guards/member-access.guard.ts` —— 所有按成员查询的接口强制校验 `memberId` 归属或授权，服务层不得绕过。
- **时区**：存储 `scheduled_at_utc` + `local_date`/`local_time` + `timezone` 快照（见 DB 设计）；用户跨时区时按快照执行并提示。

### 3.3 关键技术点

- **认证**：JWT access（短）+ refresh（长，旋转）；小程序走 `code2session` 绑定账号；后台管理员独立账号体系 + RBAC，双因素（P1）。
- **统一异常**：`{ code, message, traceId }` 标准结构；业务码表集中维护。
- **日志脱敏**：拦截器统一掩码病历、用药、PII、Token 字段。
- **幂等**：提醒实例生成键 `plan_id + scheduled_at_utc`；打卡接口支持客户端幂等键（离线打卡同步）。
- **文件**：药品图片/病历附件走对象存储（S3 兼容，选型待定），DB 只存 URL。

### 3.4 AI 子系统设计（`ai` 模块，P1）

```
各端（Web/小程序/Android/iOS/PC）
  → ai 网关（唯一入口；各端严禁直连模型厂商）
  → 会话管理（AiSession：按成员隔离，支持流式输出）
  → 能力路由：
  │    ├─ 病历分析：OCR 结构化抽取（BullMQ 异步任务）→ 通俗解读报告（AiReport）
  │    ├─ 症状分析：结构化追问 → 固定结构输出（可能性方向+紧急程度+行动建议）
  │    ├─ 健康问答：优先基于平台知识库（RAG，P2）
  │    └─ 方案草案：只出草案，用户确认后才转正式用药计划（AI 永不直接写计划）
  → 安全审核流水线：急症关键词命中即中断并提示就医/120 → 诊断性结论/处方表述拦截改写
  → 调用审计与成本统计（Token 用量、灰度开关、一键全局停用）
```

- **网关模式**：模型厂商可替换（第三方 API / 私有化部署待定，见需求待确认第 10 题）；密钥只存引用不落库明文。
- **异步**：病历 OCR 与长分析走 BullMQ 任务，前端轮询/推送取结果；AI 故障降级——**绝不影响提醒主流程**。
- **合规**：AI 单独授权、可一键关闭并删历史；输出固定免责声明；医学内容审核员抽检。
- **数据**：`AiSession` / `AiReport` / `AIConsent` / `AIConsultation` 等表见《数据库表结构设计》V1.1；会话内容脱敏检索、查看留痕。

---

## 四、数据与接口契约

- **数据库**：PostgreSQL 15+，基础 34 张表 / 8 个域 + AI 表（`AiSession` / `AiReport` / `AIConsent` / `AIConsultation` 等，见《数据库表结构设计》V1.1）；迁移工具 Prisma Migrate。
- **OpenAPI**：`@nestjs/swagger` 自动生成，为前后端唯一契约；`packages/api-client` 由契约生成 TS 客户端。
- **枚举对齐**：`packages/shared/enums.ts` 必须与 DB 设计文档「枚举速查」逐字一致，CI 加校验脚本（P1）。

---

## 五、横切关注点

| 关注点 | 方案 |
|---|---|
| 认证与会话 | JWT + refresh rotation；多端登录互踢策略可配置 |
| 权限 | 后台 RBAC（角色→菜单/按钮/接口）；用户端按「照护人 × 成员」授权矩阵 |
| 敏感数据 | 病历/过敏史密文列 + HMAC；日志/报表脱敏展示；访问审计 |
| 通知 | 模板集中管理（变量占位符）；通道降级与频控；发送记录可查 |
| 可观测 | 结构化日志（traceId 串联）；指标/告警 P1（Prometheus + Grafana 候选） |
| 合规 | 注销冷静期流程；数据保留与匿名化策略；药品功效表述合规（见需求文档） |

---

## 六、基础设施与部署

```
                ┌─────────────┐
                │    Nginx    │  反向代理 / TLS / 静态资源
                └──────┬──────┘
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  services/api   apps/admin     apps/web
  (Docker)       (静态托管)      (静态托管)
        │
  ┌─────┴─────┐
  ▼           ▼
 PostgreSQL  Redis 7
  15+         (BullMQ)
```

- **本地开发**：Docker Compose 一键起 `api + postgres + redis`。
- **CI**：GitHub Actions —— lint / typecheck / test / build；`main` 受保护，PR 合并。
- **CD**：P1（方案待定）。

---

## 七、非功能需求

- **可用性**：提醒链路为核心链路，worker 崩溃后 BullMQ 任务不丢；API 无状态可水平扩展（P1）。
- **性能**：提醒实例预生成窗口可配置（默认未来 14 天，见 DB 文档待确认项）；依从性走预聚合表，不查明细。
- **安全**：传输 TLS；密码加盐哈希（argon2/bcrypt）；越权测试纳入 QA 门禁。
- **合规**：见需求文档合规章节；本架构不存储超出需求范围的个人数据。

---

## 八、分期落地映射

- **P0**：`services/api`（账号/成员/授权/计划/提醒/打卡/通知最小闭环）+ `apps/admin` MVP + `apps/web` 响应式 + 小程序 MVP；提醒通道：App 推送 + 微信订阅消息。
- **P1**：批量操作台、PWA、短信/语音通道、授权进阶、运营看板、CI 完善、可观测、**AI 健康助手基础版**（病历提取解读、症状分析、依从建议；须先过医学+合规评审）。
- **P2**：客服工单、高级数据分析、`apps/desktop` 完整版、AI 增强（知识库 RAG 问答、用药方案草案）。

---

## 九、决策记录（ADR 摘要）

| 决策 | 选择 | 否决的备选 | 理由 |
|---|---|---|---|
| 后端框架 | NestJS 10 | Spring Boot / FastAPI | TS 全栈类型共享；模块化适合本项目多域；企业级验证充分 |
| ORM | Prisma 5 | TypeORM / 原生 SQL | Postgres-first，迁移 + 类型安全一体 |
| 延迟任务 | BullMQ | 自研定时轮 / node-cron | 延迟/重试/幂等的事实标准，提醒链路不丢任务 |
| 后台 UI | Ant Design 5 + ProComponents | 小众 UI 库 | 国内中后台事实标准，组件完备 |
| Web 样式 | Tailwind CSS | CSS-in-JS 重方案 | 响应式断点成熟，构建体积可控 |
| 小程序 | Taro 4 (React) | uni-app / 原生手写 | React 心智与 web/admin 统一，生产验证多 |
| 桌面端 | Electron | Tauri | 本期求稳：VS Code/Slack 级验证；复用 web 代码 |
| 移动推送（国内） | 极光/JPush 聚合 | 单一厂商通道 | 国内安卓通道碎片化，聚合是成熟做法 |
| AI 集成模式 | 后端 `ai` 网关模块，各端只调网关 | 各端直连模型厂商 | 密钥集中管控、可审计、可灰度/一键停用、可替换模型；AI 故障不影响提醒主流程 |
| AI 产品定位 | 「AI 健康助手」（信息解读+行动建议） | 「AI 诊病」 | 「诊断」属医疗行为，合规风险高；只做解读建议，不诊断不开处方不调剂量 |

> 本文档为活体文档，选型变更时同步更新 ADR 并回填 `AGENTS.md` / `PROJECT_CONTEXT.md`。
