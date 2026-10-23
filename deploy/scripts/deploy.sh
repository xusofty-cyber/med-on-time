#!/usr/bin/env bash
# ============================================================
# deploy.sh —— MedOnTime 一键首次部署。
# 流程：校验环境 -> 构建镜像 -> 启动 Redis -> 校验 PG 连通 ->
#       执行迁移（prisma migrate deploy）-> 导入药品 seed（200 条）->
#       播种后台管理员 -> 启动全部服务 -> 健康检查。
# 任一步失败立即停止并指出环节；全脚本可重复执行（迁移/seed/播种均幂等）。
# 前置：deploy/.env 已填真实值；已先运行 scripts/db-init.sh 建好角色与库。
# ============================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEPLOY_DIR"

PG_CONTAINER="${PG_CONTAINER:-nexasx-postgres}"
STEP="初始化"
step() { STEP="$1"; echo; echo "==> [$STEP]"; }
fail() { echo; echo "[deploy] 失败环节：$STEP —— $1" >&2; exit 1; }

read_env() { sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'; }

step "校验 .env 与 Docker 环境"
[[ -f .env ]] || fail "缺少 deploy/.env（cp .env.example .env 后填写真实值）"
command -v docker >/dev/null || fail "未找到 docker 命令"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 不可用"
for v in DB_PASSWORD DATABASE_URL JWT_ACCESS_SECRET JWT_REFRESH_SECRET PHONE_ENCRYPTION_KEY EHR_ENC_KEY ADMIN_PASSWORD; do
  val="$(read_env "$v")"
  [[ -n "$val" && "$val" != *请替换* ]] || fail ".env 中 $v 未填写真实值"
done
grep -q "nexasx-postgres:5432/medontime" <<<"$(read_env DATABASE_URL)" \
  || fail "DATABASE_URL 应为 postgresql://medontime:<DB_PASSWORD>@nexasx-postgres:5432/medontime"
docker network inspect nexasx-internal >/dev/null 2>&1 \
  || fail "外部网络 nexasx-internal 不存在，请确认既有 PG 容器组已就绪（本脚本不会创建/修改它）"
[[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null || echo false)" == "true" ]] \
  || fail "容器 $PG_CONTAINER 未运行，本脚本不会启动它"
psql_check="$(docker exec -e PGPASSWORD="$(read_env DB_PASSWORD)" "$PG_CONTAINER" \
  psql -h 127.0.0.1 -U medontime -d medontime -tAc 'SELECT 1' 2>/dev/null || echo fail)"
[[ "$psql_check" == "1" ]] || fail "medontime 角色无法连接 medontime 库，请先运行 scripts/db-init.sh 并核对 DB_PASSWORD"

WEB_PORT="$(read_env WEB_PORT)"; WEB_PORT="${WEB_PORT:-8080}"
ADMIN_PORT="$(read_env ADMIN_PORT)"; ADMIN_PORT="${ADMIN_PORT:-8081}"

step "构建镜像（api / web / admin）"
docker compose build || fail "docker compose build 失败"

step "启动 Redis 并等待健康"
docker compose up -d redis || fail "redis 启动失败"

step "执行数据库迁移（prisma migrate deploy）"
docker compose run --rm api prisma migrate deploy || fail "迁移失败（检查 DATABASE_URL 与 PG 连通性）"

step "导入药品字典 seed（200 条，幂等）"
docker compose run --rm api node dist/prisma/seeds/import-drug-seed.js \
  || fail "药品 seed 导入失败"

step "播种后台管理员（幂等；同时补齐基础角色）"
docker compose run --rm api node dist/prisma/seeds/create-admin.js \
  || fail "管理员播种失败（检查 .env 中 ADMIN_USERNAME/ADMIN_PASSWORD）"

step "启动全部服务"
docker compose up -d || fail "服务启动失败"

step "健康检查"
ok=0
for i in $(seq 1 30); do
  body="$(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/ops/health" 2>/dev/null || true)"
  ready="$(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/ops/ready" 2>/dev/null || true)"
  if grep -q '"code":0' <<<"$body" && grep -q '"code":0' <<<"$ready"; then ok=1; break; fi
  sleep 3
done
[[ "$ok" == "1" ]] || fail "健康探针未通过（/api/ops/health 或 /api/ops/ready 无 code:0 响应），用 scripts/logs.sh 查看 api 日志"
curl -fsS -o /dev/null "http://127.0.0.1:${WEB_PORT}/" || fail "Web 首页不可达"
curl -fsS -o /dev/null "http://127.0.0.1:${ADMIN_PORT}/" || fail "后台首页不可达"

echo
echo "[deploy] 部署完成 ✔"
echo "  Web 用户门户： http://<服务器IP>:${WEB_PORT}/"
echo "  后台管理平台： http://<服务器IP>:${ADMIN_PORT}/（用 .env 的 ADMIN_USERNAME/ADMIN_PASSWORD 登录，登录后请立即改密）"
echo "  API 健康探针： http://<服务器IP>:${WEB_PORT}/api/ops/health"
