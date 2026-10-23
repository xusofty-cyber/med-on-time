import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/** 后台登录管理员（由 AdminAuthGuard 写入 request.admin）。 */
export interface AuthenticatedAdmin {
  adminId: string;
  username: string;
  /** AdminRole.code 集合：super_admin / operator / cs_agent / auditor 等 */
  roles: string[];
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin | undefined => {
    const request = ctx.switchToHttp().getRequest<{ admin?: AuthenticatedAdmin }>();
    return request.admin;
  },
);

/** 角色门禁元数据键；未标注的后台接口 = 任意已登录管理员可访问。 */
export const ADMIN_ROLES_KEY = 'admin:roles';

/** 限定接口可访问的后台角色（super_admin 恒放行）。 */
export const AdminRoles = (...roles: string[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
