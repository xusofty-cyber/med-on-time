# Architecture — MedOnTime（药准时）顶层地图

本文件只做路由：顶层结构与硬规则在此，细节在指向的文档里。

## 事实来源

- **技术架构（冻结）**：`docs/architecture/TECH_ARCHITECTURE.md`（V1.5，已确认冻结）
  — 技术选型、分层与模块边界以该文为准，变更须走评审。
- **各端总览**：`docs/dev/ENDS_OVERVIEW.md`；接口契约：`docs/dev/API_CONTRACT.md`。
- **部署与运维**：`docs/DEPLOY.md`、`docs/HANDOVER.md`。
- **会话断点**：`SESSION_STATE.md`（仓库根）。
- **技术债总账**：`docs/tech-debt-tracker.md`。
- 设计评审决策记录在仓外评审目录（medontime-review），不入仓。

## 结构一览

| 层 | 位置 | 说明 |
|---|---|---|
| 后端 API | `services/api` | NestJS 10 + Prisma 5 + BullMQ/Redis 7 |
| 管理端 | `apps/admin` | React 18 + Ant Design 5 |
| Web 端 | `apps/web` | React 18 + Tailwind |
| 微信小程序 | `apps/miniprogram` | Taro 4 |
| Android | `apps/android` | Kotlin + Jetpack Compose |
| iOS | `apps/ios` | Swift + SwiftUI |
| 桌面端 | `apps/desktop` | Electron（复用 Web） |
| 共享包 | `packages/` | 跨端共享类型与契约 |

## 硬规则（摘要，规范源在 AGENTS.md 与 TECH_ARCHITECTURE）

- 单向依赖：端 → 共享契约 → API；端与端之间不直连。
- 成员数据隔离、代操作双记、提醒幂等（见 AGENTS.md 架构红线）。
- 生产部署纪律：构建串行、磁盘 ≥85% 先清理、不动既有服务
  （见 `docs/DEPLOY.md` 与 SESSION_STATE 部署记录）。
