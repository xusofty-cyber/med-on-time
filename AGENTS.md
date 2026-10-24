# 药准时 MedOnTime —— 项目 AGENTS.md

## 继承与定位

- 本文件是 `med-on-time` 仓库的根指令文件，补充 agent-harness 的 Global AGENTS.md 通用底线，提供本项目专有的工程上下文。
- 采用**渐进式披露（Progressive Disclosure）**架构：高频红线与命令在此维护；细粒度规则按需存放于 `.agents/rules/`，Agent 仅在需要时查阅。

## 项目概览

- **项目名称**：药准时 MedOnTime
- **业务定位**：全平台用药提醒系统——帮助用户及家人按时服药；支持一个账号管理多位家庭成员用药，委托照护人（管家 / 保姆 / 子女 / 护工）经授权代配置、代打卡、代收提醒。
- **核心维护者**：xusofty-cyber（ulife）
- **代码仓库与默认分支**：https://github.com/xusofty-cyber/med-on-time；默认分支 `main`，开发分支 `develop`（2026-10-23 已建立）

## 常用开发命令

> 依据《docs/architecture/TECH_ARCHITECTURE.md》V1.5（已确认冻结）。运行命令前先确认工作目录；必须采用过滤参数防日志刷屏，严禁将全量日志直接倒进上下文。接手先读 `docs/HANDOVER.md`。

```bash
# 1. 依赖安装
pnpm install

# 2. 本地开发与构建
pnpm --filter @med-on-time/admin dev      # 后台（React + Ant Design）
pnpm --filter @med-on-time/web dev        # Web 用户门户（React + Tailwind）
pnpm --filter @med-on-time/api dev        # 后端 API（NestJS）
pnpm -r build                             # 全量构建

# 3. 测试（改动后必须运行，输出须精简）
pnpm --filter @med-on-time/api test       # 后端：jest
pnpm -r test                              # 全量测试

# 4. Lint / 格式化 / 类型检查
pnpm -r lint                              # eslint
pnpm -r format                            # prettier --write
pnpm -r typecheck                         # tsc --noEmit

# 5. 数据迁移（PostgreSQL，Prisma Migrate）
pnpm --filter @med-on-time/api prisma migrate dev      # 本地开发建迁移
pnpm --filter @med-on-time/api prisma migrate deploy   # 部署执行迁移
```

## 技术栈与运行环境

| 类别 | 技术选型与版本 | 补充说明 |
|---|---|---|
| **包管理器** | pnpm 9 | monorepo workspace（`apps/*`、`packages/*`、`services/*`） |
| **后端** | Node.js 20 LTS（生产容器 node:22-alpine）+ NestJS 10 + Prisma 5 | 模块化单体分层；BullMQ + Redis 7 做提醒延迟队列 |
| **后台管理平台** | React 18 + Vite + Ant Design 5 | React Router v6；图表 ECharts（规划备选） |
| **Web 用户门户** | React 18 + Vite + Tailwind CSS | React 18 原生轻量状态；同一套代码响应式适配 PC + 移动；PWA（vite-plugin-pwa）为 P1 |
| **微信小程序** | Taro 4（React 写法） | 编译到微信小程序；订阅消息须用户主动订阅 |
| **移动端** | Android: Kotlin + Jetpack（Compose/Room/WorkManager/Hilt/Retrofit）；iOS: Swift + SwiftUI | 推送：APNs / FCM；国内安卓用极光·JPush 聚合 |
| **桌面端** | Electron（复用 `apps/web` 代码） | Windows / Linux / macOS；定位为补充提醒 |
| **共享包** | TypeScript + dayjs + zod；各端 hand-crafted endpoints 归一化层 | `packages/shared` 枚举与 DB 枚举速查逐字一致；orval 自动生成为规划项 |
| **持久层** | PostgreSQL 15+ | 58 张表 / 9 个域（基线 DB V1.2 为 56 表，演进至 58 表）；UUIDv7 主键；软删除；大表按月分区 |
| **接口** | RESTful over HTTPS，OpenAPI 为唯一契约 | 各端共用同一套后端 API |
| **CI/CD** | GitHub Actions（lint/test/build）；CD 待定 | `main` 受保护，PR 合并 |

## 架构核心红线

1. **单向分层依赖**：上层调用下层，底层严禁反向引用上层业务，严禁模块间循环依赖。
2. **统一异常流**：业务错误必须抛出统一封装的业务异常，严禁静默吞掉异常；异步必须包含错误捕获。
3. **配置隔离**：所有配置通过统一环境变量/配置模块读取，严禁深层硬编码或直接读取原生 env。
4. **日志脱敏**：病历、用药记录、PII、Token、密码等敏感字段在日志/控制台必须掩码脱敏。
5. **成员数据隔离（硬规则）**：后端必须按成员维度校验权限；照护人仅可见被授权成员的数据，看不到同户其他成员与账号持有人的数据。
6. **代操作双记**：代打卡 / 代配置必须同时记录实际操作人与归属成员，报表中与本人操作区分展示。
7. **提醒幂等**：`reminder_instance` 独立成表，实例生成携带幂等键；多端去重，严禁重复提醒。
8. **Git 安全**：`main` 为受保护分支，禁止直接提交，必须走临时特性分支；严禁 `git add .` / `git add -A`（只暂存明确路径）；严禁 force push。

## 研发全生命周期角色协同与工件流转

开发、需求变更与缺陷修复必须依序流转，严禁越级操作：

| 研发阶段 | 核心角色 | 阶段职责与产出工件 | 准出门禁 |
|---|---|---|---|
| **1. 需求分析** | 🎯 PM | 需求梳理、用户故事、验收标准 | 验收标准清晰，边界无歧义 |
| **2. 架构设计** | 🏗️ Architect | 技术方案、架构图、选型与风险评估 | 无单向门风险与架构债务 |
| **3. 编码实现** | 💻 Developer | 业务代码、单元测试 | 测试先行，最小清晰实现 |
| **4. 代码审查** | 🔍 Reviewer | 审查报告、安全审计 | 行号锚定，Critical / High 零残留 |
| **5. 测试验证** | 🧪 QA | 测试用例、边界验证、复测报告 | 真实运行证据 |
| **6. 交付归档** | 📦 Release | 活体文档同步、版本标记 | 代码与文档双向追溯同步 |

## 动态记忆与任务追踪

- **会话启动**：在文件存在且与任务相关时，查阅 `PROJECT_CONTEXT.md` 与 `SESSION_STATE.md`；核实分支、状态、配置和实现事实。
- **项目长期记忆**：`PROJECT_CONTEXT.md` 记录经验证的架构事实、硬约束与技术决策；它是导航入口，不取代代码与正式设计文档；尽量附来源路径。
- **会话断点**：在有意义的任务边界更新 `SESSION_STATE.md`，记录已完成工作、验证证据、未完成步骤与风险；新会话先核实并清理过期断点；无实质变化不制造空更新。
- **更新范围**：只有长期事实变化才改 `PROJECT_CONTEXT.md`；只改断点时只更新 `SESSION_STATE.md`。
- **来源与时效**：推断标记为推断；易变事实记录日期；记忆与当前指令/代码/证据冲突时，以当前指令和证据为准并修正记忆。
- **隐私与安全**：不保存凭证、私钥、原始个人数据、完整对话日志；病历与用药数据仅以脱敏口径记录。
- **活体文档**：长期技术文档统一维护于 `docs/`（需求 `docs/specs/`、架构 `docs/architecture/`、参考 `docs/reference/`、指南 `docs/guides/`），头部 Frontmatter 声明 `modules` 与 `depends_on`，保证代码与文档双向追溯。

## 功能完成检查清单（Definition of Done）

1. [ ] **测试验证**：运行相关测试，全部通过，提供真实运行证据
2. [ ] **更新 SESSION_STATE.md**：记录已完成事项、验证证据、未完成步骤与风险
3. [ ] **更新 PROJECT_CONTEXT.md**：如有架构/技术决策/长期约束变化则同步；仅断点变化时跳过
4. [ ] **执行代码审查**：必须自行调用代码审查技能（行号锚定、全量覆盖），严禁询问用户是否审查，直接执行
5. [ ] **清零缺陷**：Critical / High 缺陷清零后方可合并

> 严禁跳过第 4 步直接合并。未出示审查证据前，不得声称任务完成。

## 目录级规则索引

Monorepo 下仅在确有独立边界的子模块（如 `services/api`、`apps/miniprogram`）按需创建子级 `AGENTS.md`，定义专属 In/Out Scope 与快速验证命令；普通目录继承本文件，避免重复根规则。
