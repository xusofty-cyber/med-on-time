# packages/api-client

各端共用的后端 API 客户端抽象层。

- **现状说明**：当前前端与移动各端采用手写 `endpoints.ts` 归一化适配层（处理 `{items, total}` 解包、分组响应展开与字段适配），保障各端业务页面免受底层接口形状差异影响。
- **后续规划**：后续迭代规划基于 OpenAPI 规范接入 orval / openapi-typescript 自动化生成类型化 API SDK。
