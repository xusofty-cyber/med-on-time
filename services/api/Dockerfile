# MedOnTime API（NestJS）多阶段镜像。
# 构建上下文必须是仓库根目录（monorepo）：API 依赖 workspace 包
# @med-on-time/shared，单独以 services/api 为上下文无法解析依赖。
# compose 口径：build.context = 仓库根，build.dockerfile = services/api/Dockerfile。

ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PRISMA_ENGINES_MIRROR=https://npmmirror.com/mirrors/prisma
# 与 pnpm-lock.yaml 锁定的 prisma 版本保持一致（@prisma/client 5.22.0）；
# 运行阶段全局装同版本 CLI，仅供 `prisma migrate deploy` 使用。
ARG PRISMA_VERSION=5.22.0

# ---------- 构建阶段 ----------
FROM node:22-alpine AS build
ARG NPM_REGISTRY
ARG PRISMA_ENGINES_MIRROR
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR} \
    CI=true
# argon2 为原生模块需编译工具链；openssl 供 Prisma 引擎使用
RUN apk add --no-cache python3 make g++ openssl \
 && npm install -g pnpm@9.0.0 --registry ${NPM_REGISTRY}
WORKDIR /repo
COPY . .
# 仅装 API 及其 workspace 依赖（shared），frozen 保证与锁文件一致
RUN pnpm install --frozen-lockfile --filter @med-on-time/api...
# shared 以 dist 发布（api 的 tsconfig.build 指向其声明文件），必须先构建
RUN pnpm --filter @med-on-time/shared build
RUN pnpm --filter @med-on-time/api exec prisma generate
# 产物：dist/src/main.js（start:prod）与 dist/prisma/seeds/*.js
RUN pnpm --filter @med-on-time/api build
# 产出仅含生产依赖的独立目录 /out（含已生成的 Prisma Client、dist、prisma 目录）
RUN pnpm --filter @med-on-time/api deploy --prod /out

# ---------- 运行阶段 ----------
FROM node:22-alpine AS runner
ARG NPM_REGISTRY
ARG PRISMA_VERSION
ARG PRISMA_ENGINES_MIRROR=https://npmmirror.com/mirrors/prisma
ENV NODE_ENV=production \
    PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR}
RUN apk add --no-cache openssl tini \
 && npm install -g prisma@${PRISMA_VERSION} --registry ${NPM_REGISTRY} \
 && npm cache clean --force
WORKDIR /app
COPY --from=build /out ./
# import-drug-seed.js 按 __dirname 读取同目录 drug_seed_200.json，
# tsc 不复制 JSON 资产，从源码 prisma 目录补一份到 dist 对应位置。
RUN cp prisma/seeds/drug_seed_200.json dist/prisma/seeds/drug_seed_200.json
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# 环境变量（PORT / DATABASE_URL / REDIS_URL / 各密钥）由 compose env_file 注入
CMD ["node", "dist/src/main.js"]
