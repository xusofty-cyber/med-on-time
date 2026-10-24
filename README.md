# 药准时 MedOnTime

全平台用药提醒系统：帮助用户及家人按时服药。

- 中文名：药准时 / 英文名：MedOnTime
- 设计文档：`docs/`（用户端需求 V1.8、后台需求 V1.5、数据库设计 V1.2（基线 56 表，演进为 58 表 / 9 域）、技术架构 V1.5 已冻结、UI 规范 V1.0；PDF 在 Release design-v1.0）
- 接手与文档总索引：[`docs/HANDOVER.md`](docs/HANDOVER.md) / [`docs/README.md`](docs/README.md)
- 上线状态（2026-10-23）：生产已部署——用户端 https://mot.ulife.vip 、后台 https://admin.ulife.vip （部署实况见 `docs/DEPLOY.md` 附录 B）

## 系统架构

```
┌───────────────────────────────────────────────────────────────┐
│ 用户端（共用同一套后端 API）                                    │
│ Web（响应式 PC+移动）· 微信小程序 · Android · iOS · PC 桌面端    │
└────────────────────────────┬──────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼──────────────────────────────────┐
│ services/api  后端 API + 提醒引擎                               │
│ 账号/成员/委托授权 · 药品 · 用药计划 · 提醒任务 · 服药打卡 · 通知 │
└────────────────────────────┬──────────────────────────────────┘
                             │
                      PostgreSQL 15+
```

`apps/admin` 为独立的后台管理员管理平台，面向运营 / 客服 / 审核人员。

核心领域模型：**账号 → 成员**（一人一档，本人也是成员）、**委托照护授权**
（照护人 × 成员逐对授权，L1 仅查看 / L2 可协助 / L3 可配置），详见数据库设计文档。

## 目录结构

```
med-on-time/
├── apps/
│   ├── admin/        # 后台管理员管理平台（Web）
│   ├── web/          # Web 用户门户（响应式：PC + 移动浏览器）
│   ├── miniprogram/  # 微信小程序
│   ├── android/      # Android 客户端
│   ├── ios/          # iOS 客户端
│   └── desktop/      # PC 客户端（Windows / Linux / macOS）
├── packages/
│   ├── shared/       # 共享类型、枚举、常量、工具函数
│   └── api-client/   # 各端共用的 API 客户端 SDK
├── services/
│   └── api/          # 后端 API + 提醒引擎
└── docs/             # 设计文档索引
```

## 快速开始

各端技术选型已在 `docs/architecture/TECH_ARCHITECTURE.md`（V1.5 冻结版）确立并在各子工程落地。workspace 常用命令：

```bash
pnpm install
```

## 路线图

- **P0**：一个账号管全家闭环（成员 / 授权 / 计划 / 提醒 / 打卡）、后台 MVP、Web 响应式双形态
- **P1**：批量操作台、PWA、授权进阶能力、运营看板
- **P2**：客服工单、高级数据分析

## License

[MIT](LICENSE)
