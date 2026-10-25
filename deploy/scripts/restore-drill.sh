#!/usr/bin/env bash
# ============================================================
# restore-drill.sh —— 备份恢复演练（只读生产库，零风险）。
# 用法：deploy/scripts/restore-drill.sh [备份文件]
#   不传参数时用 deploy/backups/ 下最新的 medontime-*.dump。
#   备份文件相对路径以调用方当前目录为基准（如从仓库根目录传
#   deploy/backups/medontime-....dump）。
# 流程：校验 dump（PGDMP 魔数 + pg_restore -l 清单）-> 起一次性
#   postgres:16 容器 -> 建 medontime 角色 -> 把 dump 拷进容器恢复
#   -> 逐表核对表清单与行数（生产库 vs 演练库）-> 删容器。
# 安全：生产库只做只读 SELECT（表清单与 count(*))，演练库是
#   用完即删的一次性容器；不碰 deploy/.env 以外的任何东西。
# 要求：本机有 docker、deploy/.env 已填 DB_PASSWORD；演练镜像
#   须与生产 PG 大版本一致（默认 postgres:16-alpine，可用
#   PG_DRILL_IMAGE 环境变量覆盖）。
# 退出码：0 演练通过；非 0 为校验/恢复/核对任一步失败。
# ============================================================
set -euo pipefail

CALLER_PWD="$PWD"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEPLOY_DIR"

PG_CONTAINER="${PG_CONTAINER:-nexasx-postgres}"
PG_DRILL_IMAGE="${PG_DRILL_IMAGE:-postgres:16-alpine}"
DRILL_CONTAINER="pg-drill-$(date +%Y%m%d-%H%M%S)-$$"
DRILL_PASSWORD="$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
WORKDIR="$(mktemp -d)"

cleanup() {
  docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

# ---- 参数：备份文件（默认最新一份；相对路径以调用方 cwd 为基准） ----
if [[ $# -ge 1 ]]; then
  case "$1" in
    /*) DUMP="$1" ;;
    *) DUMP="$CALLER_PWD/$1" ;;
  esac
else
  DUMP="$(ls -1t backups/medontime-*.dump 2>/dev/null | head -n 1 || true)"
fi
[[ -n "$DUMP" && -f "$DUMP" ]] || { echo "[drill] 找不到备份文件：${DUMP:-<无>}" >&2; exit 1; }
[[ -s "$DUMP" ]] || { echo "[drill] 备份文件为空：$DUMP" >&2; exit 1; }
echo "[drill] 演练备份：$DUMP（$(du -h "$DUMP" | cut -f1)）"

if [[ ! -f .env ]]; then
  echo "[drill] 缺少 deploy/.env" >&2; exit 1
fi
DB_PASSWORD="$(sed -n "s/^DB_PASSWORD=//p" .env | tail -n 1 | tr -d '\r')"
[[ -n "$DB_PASSWORD" && "$DB_PASSWORD" != *请替换* ]] || { echo "[drill] .env 中 DB_PASSWORD 未填写" >&2; exit 1; }

# ---- 1. 校验 dump：PGDMP 魔数 + 清单可读 ----
MAGIC="$(head -c 5 "$DUMP")"
[[ "$MAGIC" == "PGDMP" ]] || { echo "[drill] 不是 pg_dump 自定义格式（魔数不符）：$DUMP" >&2; exit 1; }
cat "$DUMP" | docker run --rm -i "$PG_DRILL_IMAGE" pg_restore -l > "$WORKDIR/drill-toc.txt"
TOC_LINES="$(wc -l < "$WORKDIR/drill-toc.txt")"
echo "[drill] 清单可读：$TOC_LINES 行"
rm -f "$WORKDIR/drill-toc.txt"

# ---- 2. 起一次性演练库（等就绪后再恢复，避免启动期截断） ----
echo "[drill] 启动一次性容器 $DRILL_CONTAINER（镜像 $PG_DRILL_IMAGE）"
docker run -d --rm --name "$DRILL_CONTAINER" \
  -e POSTGRES_PASSWORD="$DRILL_PASSWORD" -e POSTGRES_DB=medontime \
  "$PG_DRILL_IMAGE" >/dev/null
for _ in $(seq 1 30); do
  docker exec "$DRILL_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
sleep 3
docker exec "$DRILL_CONTAINER" pg_isready -U postgres >/dev/null \
  || { echo "[drill] 演练容器未就绪" >&2; exit 1; }
# 预建 medontime 角色：否则恢复时 159 条 ALTER ... OWNER TO 会报错
# （仅改属主语句、不影响数据；真实恢复进原集群无此问题）
docker exec "$DRILL_CONTAINER" psql -U postgres -d medontime -At \
  -c "CREATE ROLE medontime LOGIN PASSWORD 'drill';" >/dev/null

# ---- 3. 恢复（用 docker cp 传文件，不走 stdin 管道） ----
docker cp "$DUMP" "$DRILL_CONTAINER:/tmp/medontime.dump"
echo "[drill] 恢复中…"
# pg_restore 出错时以非零退出；须先关 set -e 捕获退出码，否则
# 下面的诊断分支不可达（审查 M1）。
set +e
docker exec "$DRILL_CONTAINER" pg_restore -U postgres -d medontime \
  /tmp/medontime.dump 2>"$WORKDIR/drill-restore.err"
RESTORE_RC=$?
set -e
ERR_LINES="$(wc -l < "$WORKDIR/drill-restore.err")"
if [[ "$RESTORE_RC" -ne 0 || "$ERR_LINES" -gt 0 ]]; then
  echo "[drill] 恢复失败（退出码 $RESTORE_RC，$ERR_LINES 行报错）：" >&2
  head -10 "$WORKDIR/drill-restore.err" >&2
  exit 1
fi
echo "[drill] 恢复完成：0 报错"
rm -f "$WORKDIR/drill-restore.err"

# ---- 4. 核对：表清单 + 逐表行数（生产库只读） ----
prod_sql() {
  docker exec -e PGPASSWORD="$DB_PASSWORD" "$PG_CONTAINER" \
    psql -h 127.0.0.1 -U medontime -d medontime -At -c "$1"
}
drill_sql() {
  docker exec "$DRILL_CONTAINER" psql -U postgres -d medontime -At -c "$1"
}
TABLES_SQL="SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1"
prod_sql "$TABLES_SQL" > "$WORKDIR/drill-prod-tables.txt"
drill_sql "$TABLES_SQL" > "$WORKDIR/drill-drill-tables.txt"
if ! diff -q "$WORKDIR/drill-prod-tables.txt" "$WORKDIR/drill-drill-tables.txt" >/dev/null; then
  echo "[drill] 表清单不一致：" >&2
  diff "$WORKDIR/drill-prod-tables.txt" "$WORKDIR/drill-drill-tables.txt" >&2 || true
  exit 1
fi
TABLE_COUNT="$(wc -l < "$WORKDIR/drill-prod-tables.txt")"
echo "[drill] 表清单一致：$TABLE_COUNT 张"

DIFFS=0
TOTAL_PROD=0
TOTAL_DRILL=0
while read -r t; do
  a="$(prod_sql "SELECT count(*) FROM \"$t\"")"
  b="$(drill_sql "SELECT count(*) FROM \"$t\"")"
  TOTAL_PROD=$((TOTAL_PROD + a))
  TOTAL_DRILL=$((TOTAL_DRILL + b))
  if [[ "$a" != "$b" ]]; then
    echo "[drill] 行数不一致：$t 生产=$a 演练=$b" >&2
    DIFFS=$((DIFFS + 1))
  fi
done < "$WORKDIR/drill-prod-tables.txt"
[[ "$DIFFS" -eq 0 ]] || { echo "[drill] 行数差异：$DIFFS / $TABLE_COUNT 张表" >&2; exit 1; }
echo "[drill] 逐表行数一致：0 差异，总行数 生产=$TOTAL_PROD 演练=$TOTAL_DRILL"
cleanup
echo "[drill] 演练通过 ✔（演练容器已删除，生产库未动）"
