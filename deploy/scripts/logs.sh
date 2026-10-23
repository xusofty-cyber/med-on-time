#!/usr/bin/env bash
# ============================================================
# logs.sh —— 查看本项目（compose 项目 medontime）服务日志。
# 用法：
#   ./scripts/logs.sh            # 全部服务，跟踪输出
#   ./scripts/logs.sh api        # 只看 api
#   TAIL=500 ./scripts/logs.sh api   # 调整每个容器回看行数（默认 200）
# 只读取本项目容器日志，不影响任何容器运行。
# ============================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEPLOY_DIR"

TAIL="${TAIL:-200}"
docker compose logs --tail="$TAIL" -f "$@"
