#!/usr/bin/env bash
# ============================================================
# update.sh —— 拉取新代码后滚动更新本项目服务组。
# 流程（2026-10-30 全项目审查 C-2 修复后）：
#   git pull -> 强制备份（失败即中止） -> 重新构建
#   -> 一次性容器先行执行迁移 -> 启动/滚动替换 -> 健康检查。
# 迁移先行口径：本项目迁移只进不退、以增量为主，旧代码在新 schema 上
# 短时运行的风险，低于新代码跑旧 schema；且迁移失败时线上仍是旧版本
# 在完整服务，现场可控。此前顺序为先换容器后迁移且无备份，已废弃。
# 可选参数（可组合、顺序不限）：
#   --with-seed  同时刷新药品字典 seed（幂等、review_status 只升不降）
#   --no-pull    跳过 git pull（回滚到已检出的目标提交时用，与 DEPLOY
#                第九节回滚口径配套）
# 说明：管理员播种不在更新流程内（避免无意重置口径）；如需轮换管理员
# 密码，改 deploy/.env 的 ADMIN_PASSWORD 后单独重跑：
#   docker compose run --rm api node dist/prisma/seeds/create-admin.js
# 本脚本只操作 compose 项目 medontime 的容器，不触碰其他容器。
# ============================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

WITH_SEED=0
NO_PULL=0
for arg in "$@"; do
  case "$arg" in
    --with-seed) WITH_SEED=1 ;;
    --no-pull) NO_PULL=1 ;;
    *) echo "[update] 未知参数：$arg（支持 --with-seed / --no-pull）" >&2; exit 1 ;;
  esac
done

read_env() { sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'; }
WEB_PORT="$(read_env WEB_PORT)"; WEB_PORT="${WEB_PORT:-8080}"

if [[ "$NO_PULL" == "1" ]]; then
  echo "==> [跳过拉取] --no-pull，使用当前检出：$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo 未知)"
else
  echo "==> [拉取代码] $ROOT_DIR"
  git -C "$ROOT_DIR" pull --ff-only || { echo "[update] git pull 失败（本地有改动或非快进），已停止" >&2; exit 1; }
fi

echo "==> [发布前备份]（迁移只进不退，无备份不发布）"
"$DEPLOY_DIR/scripts/backup.sh" || { echo "[update] 备份失败，已中止：未做任何变更，线上仍为旧版本" >&2; exit 1; }

echo "==> [重新构建]"
docker compose build || { echo "[update] 构建失败，已停止（旧容器仍在运行）" >&2; exit 1; }

echo "==> [数据库迁移]（一次性容器先行，线上仍为旧版本）"
docker compose run --rm api prisma migrate deploy \
  || { echo "[update] 迁移失败，已停止：新容器未替换，线上仍为旧版本；处置口径见 docs/DEPLOY.md" >&2; exit 1; }

echo "==> [启动/滚动替换]"
docker compose up -d || { echo "[update] 启动失败" >&2; exit 1; }

if [[ "$WITH_SEED" == "1" ]]; then
  echo "==> [刷新药品 seed]"
  docker compose run --rm api node dist/prisma/seeds/import-drug-seed.js \
    || { echo "[update] 药品 seed 刷新失败" >&2; exit 1; }
fi

echo "==> [健康检查]"
ok=0
for i in $(seq 1 30); do
  body="$(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/ops/health" 2>/dev/null || true)"
  ready="$(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/ops/ready" 2>/dev/null || true)"
  if grep -q '"code":0' <<<"$body" && grep -q '"code":0' <<<"$ready"; then ok=1; break; fi
  sleep 3
done
[[ "$ok" == "1" ]] || { echo "[update] 健康探针未通过，用 scripts/logs.sh api 查看日志；回滚口径见 docs/DEPLOY.md" >&2; exit 1; }

echo "[update] 更新完成 ✔"
