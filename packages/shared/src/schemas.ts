import { z } from 'zod';

/** UUID（v7 由应用层生成，见 services/api/src/common/utils/uuidv7.ts） */
export const uuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/** 通用分页入参 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

/** 统一异常结构（架构 §3.3）：{ code, message, traceId } */
export const apiErrorSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  traceId: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
