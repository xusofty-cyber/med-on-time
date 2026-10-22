import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** 当前登录账号（由 auth 模块的 JWT 守卫写入 request.user 后使用）。 */
export interface AuthenticatedUser {
  accountId: string;
  /** 后台管理员会话与用户端会话分离；用户端请求此字段恒为 undefined */
  adminId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);
