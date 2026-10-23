# MedOnTime 后台管理平台（React + Ant Design + Vite）多阶段镜像：node 构建 -> nginx 伺服。
# 构建上下文必须是仓库根目录（monorepo）：依赖 workspace 包
# @med-on-time/shared（需先 build 出 dist）与 @med-on-time/api-client（源码包）。

ARG NPM_REGISTRY=https://registry.npmmirror.com

FROM node:22-alpine AS build
ARG NPM_REGISTRY
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    CI=true
WORKDIR /repo
RUN npm install -g pnpm@9.0.0 --registry ${NPM_REGISTRY}
COPY . .
RUN pnpm install --frozen-lockfile --filter @med-on-time/admin...
RUN pnpm --filter @med-on-time/shared build
# 后台前端以相对路径 /api 访问后端，由同机 nginx 反代到 api 容器，
# 无需构建期注入后端地址。
RUN pnpm --filter @med-on-time/admin build

FROM nginx:alpine AS runner
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
