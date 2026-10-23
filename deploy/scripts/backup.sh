#!/usr/bin/env bash
# ============================================================
# backup.sh —— 备份 medontime 数据库（pg_dump 自定义格式）。
# 产物：deploy/backups/medontime-<YYYYmmdd-HHMMSS>.dump
# 保留：仅保留最近 14 份，更早的自动删除。建议配合服务器 cron 每日执行。
# 恢复方法见 docs/DEPLOY.md「备份与恢复」一节（pg_restore）。
# 仅读取 medontime 库，不影响既有容器与其他数据库。
# ============================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEPLOY_DIR"

PG_CONTAINER="${PG_CONTAINER:-nexasx-postgres}"
KEEP=14

if [[ ! -f .env ]]; then
  echo "[backup] 缺少 deploy/.env" >&2; exit 1
fi
DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' .env | tail -n 1 | tr -d '\r')"
[[ -n "$DB_PASSWORD" && "$DB_PASSWORD" != *请替换* ]] || { echo "[backup] .env 中 DB_PASSWORD 未填写" >&2; exit 1; }

mkdir -p backups
TS="$(date +%Y%m%d-%H%M%S)"
OUT="backups/medontime-${TS}.dump"

echo "[backup] 导出 medontime -> $OUT"
docker exec -e PGPASSWORD="$DB_PASSWORD" "$PG_CONTAINER" \
  pg_dump -h 127.0.0.1 -U medontime -d medontime -Fc > "$OUT"
[[ -s "$OUT" ]] || { echo "[backup] 导出文件为空，已删除" >&2; rm -f "$OUT"; exit 1; }
echo "[backup] 完成：$OUT（$(du -h "$OUT" | cut -f1)）"

# 保留最近 KEEP 份
ls -1t backups/medontime-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "[backup] 清理旧备份：$old"
  rm -f "$old"
done
