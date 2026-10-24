# services/api —— 后端 API + 提醒引擎

全端共用后端模块化单体服务。

- **技术栈**：Node.js 20 LTS（生产镜像 `node:22-alpine`）+ NestJS 10 + Prisma 5 + PostgreSQL 15+（生产 PG 16）+ Redis 7（BullMQ 延迟队列）
- **数据模型**：Prisma 定版 58 张表 / 9 个域（UUIDv7 主键、软删除、大表按月分区）
- **核心模块（16 个）**：auth / account / member / authorization / drug / plan / reminder / checkin / adherence / stock / ehr / notification / content / admin / ai / wechat-oa / ops
- **提醒引擎**：按成员时区预生成次日实例 + 计划变更时当日即时补生成（`generateTodayUpcoming`），基于 BullMQ 队列实现精准到点投递、重复提醒、snooze 顺延与 missed 扫描

## 常用命令

```bash
pnpm --filter @med-on-time/api dev      # 本地开发
pnpm --filter @med-on-time/api build    # 生产构建
pnpm --filter @med-on-time/api test     # 单元测试
```
