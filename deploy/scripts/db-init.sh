#!/usr/bin/env bash
# ============================================================
# db-init.sh —— 在服务器既有 PostgreSQL 容器内，幂等新建本项目专用
# 角色 medontime 与数据库 medontime（OWNER medontime）。
#
# 影响范围（最小化）：仅新建/收敛 medontime 角色与 medontime 库；
# 不修改、不删除任何既有角色、数据库或容器。可重复执行。
#
# 用法（服务器上，仓库 deploy/ 已有填好真实值的 .env）：
#   ./scripts/db-init.sh
# 超级用户密码：优先读环境变量 PGPASSWORD，未设置则交互式静默询问
# （该密码是服务器既有 PG 的超级用户密码，不写入任何文件）。
# 可选覆盖：PG_CONTAINER（默认 nexasx-postgres）、PG_SUPERUSER（默认 postgres）
# ============================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEPLOY_DIR"

PG_CONTAINER="${PG_CONTAINER:-nexasx-postgres}"
PG_SUPERUSER="${PG_SUPERUSER:-postgres}"

if [[ ! -f .env ]]; then
  echo "[db-init] 缺少 deploy/.env，请先 cp .env.example .env 并填写真实值" >&2
  exit 1
fi

# 从 .env 读取 medontime 角色密码（DB_PASSWORD）
DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' .env | tail -n 1 | tr -d '\r')"
if [[ -z "$DB_PASSWORD" || "$DB_PASSWORD" == *请替换* ]]; then
  echo "[db-init] .env 中 DB_PASSWORD 未填写真实值" >&2
  exit 1
fi

if ! docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  echo "[db-init] 找不到容器 $PG_CONTAINER，请确认既有 PostgreSQL 容器在运行" >&2
  exit 1
fi
if [[ "$(docker inspect -f '{{.State.Running}}' "$PG_CONTAINER")" != "true" ]]; then
  echo "[db-init] 容器 $PG_CONTAINER 未在运行（本脚本不会启动/重启它，请联系服务器管理员）" >&2
  exit 1
fi

if [[ -z "${PGPASSWORD:-}" ]]; then
  read -rsp "请输入 $PG_CONTAINER 超级用户 ${PG_SUPERUSER} 的密码: " PGPASSWORD
  echo
fi

echo "[db-init] 在 $PG_CONTAINER 中幂等创建角色/数据库 medontime ..."
docker exec -i -e PGPASSWORD="$PGPASSWORD" "$PG_CONTAINER" \
  psql -h 127.0.0.1 -U "$PG_SUPERUSER" -d postgres -v ON_ERROR_STOP=1 -v dbpw="$DB_PASSWORD" <<'SQL'
-- 角色不存在才建；已存在则跳过（下一步统一收敛密码，保证与 .env 一致）
SELECT 'CREATE ROLE medontime LOGIN'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medontime') \gexec
ALTER ROLE medontime WITH LOGIN PASSWORD :'dbpw';
-- 数据库不存在才建，OWNER 为 medontime；已存在则跳过
SELECT 'CREATE DATABASE medontime OWNER medontime'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'medontime') \gexec
SELECT 'role medontime: OK' AS check1;
SELECT 'database medontime: OK, owner = ' || pg_get_userbyid(datdba) AS check2
  FROM pg_database WHERE datname = 'medontime';
SQL

echo "[db-init] 完成。下一步：./scripts/deploy.sh"
