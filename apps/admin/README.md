# apps/admin —— 后台管理员管理平台

面向运营 / 客服 / 药品审核员 / 超级管理员的 Web 管理后台。

- **技术栈**：React 18 + Vite + Ant Design 5 + React Router v6 + TypeScript
- **功能域**：仪表盘（指标聚合）、账号与成员管理（冻结/解冻）、药品库维护与双人两段核验、用药计划监管、内容管理（多语言文章与协议版本）、微信公众号文章草稿管理与同步、大模型服务商配置 CRUD、客服全权裁决、审计日志查询、应用版本维护
- **认证**：管理员独立 JWT（`aud=admin`）+ RBAC 权限角色矩阵（`super_admin` / `operator` / `cs_agent` / `medical_reviewer`）

## 常用命令

```bash
pnpm --filter @med-on-time/admin dev      # 本地开发
pnpm --filter @med-on-time/admin build    # 生产构建
pnpm --filter @med-on-time/admin lint     # 代码检查
```
