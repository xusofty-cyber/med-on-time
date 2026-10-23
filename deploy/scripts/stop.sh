#!/usr/bin/env bash
# ============================================================
# stop.sh —— 停止本项目服务组（compose 项目 medontime 的
# api / web / admin / redis 四个容器）并移除其专属网络。
#
# 安全边界（重要）：
# - 本脚本通过 docker compose down 且 compose 文件只声明本项目服务，
#   影响范围严格限于 medontime-* 容器；绝不执行 docker stop/rm
#   去动其他项目或服务器既有容器（包括 nexasx-postgres）。
# - 默认不删除数据卷：medontime-redis 卷与数据库数据都保留，
#   重新执行 deploy.sh / docker compose up -d 即可恢复服务。
# - 如确需连卷一并删除（会清空 Redis 队列数据），请人工确认后
#   手动执行 docker compose down --volumes，本脚本不提供该选项。
# ============================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEPLOY_DIR"

docker compose down
echo "[stop] medontime 服务组已停止（数据卷保留；既有 PG 容器未受影响）"
