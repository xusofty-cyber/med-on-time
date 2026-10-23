#!/usr/bin/env bash
# bootstrap-env.sh — 在服务器上首次生成 deploy/.env（随机密钥，权限 600）。
# 用法：bash deploy/scripts/bootstrap-env.sh [--force]
# 已存在 .env 时默认拒绝覆盖；--force 会重新生成全部密钥（注意：EHR_ENC_KEY /
# PHONE_ENCRYPTION_KEY 一旦更换，历史加密数据将无法解密，生产启用后切勿重跑）。
set -euo pipefail
cd "$(dirname "$0")/../.."   # 仓库根
ENV_FILE="deploy/.env"
EXAMPLE="deploy/.env.example"

if [[ -f "$ENV_FILE" && "${1:-}" != "--force" ]]; then
  echo "[bootstrap-env] $ENV_FILE 已存在，未做任何修改（如需重建：--force，但更换加密密钥会导致历史密文不可解）" >&2
  exit 1
fi
[[ -f "$EXAMPLE" ]] || { echo "[bootstrap-env] 缺少 $EXAMPLE" >&2; exit 1; }

gen_hex() { openssl rand -hex 32; }
DB_PASSWORD="$(openssl rand -hex 24)"
ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)Aa1!"

cp "$EXAMPLE" "$ENV_FILE"
# 用 python 做键值替换，避免 sed 对特殊字符敏感
DB_PASSWORD="$DB_PASSWORD" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
JWT_S="$(gen_hex)" JWT_R="$(gen_hex)" ADMIN_S="$(gen_hex)" \
PHONE_E="$(gen_hex)" PHONE_H="$(gen_hex)" EHR_K="$(gen_hex)" \
python3 - <<'PYEOF'
import os, re
p = 'deploy/.env'
s = open(p, encoding='utf-8').read()
def setv(k, v):
    global s
    s = re.sub(rf'^{k}=.*$', f'{k}={v}', s, flags=re.M)
setv('DB_PASSWORD', os.environ['DB_PASSWORD'])
setv('DATABASE_URL', f"postgresql://medontime:{os.environ['DB_PASSWORD']}@nexasx-postgres:5432/medontime")
setv('JWT_ACCESS_SECRET', os.environ['JWT_S'])
setv('JWT_REFRESH_SECRET', os.environ['JWT_R'])
setv('ADMIN_JWT_SECRET', os.environ['ADMIN_S'])
setv('PHONE_ENCRYPTION_KEY', os.environ['PHONE_E'])
setv('PHONE_HMAC_KEY', os.environ['PHONE_H'])
setv('EHR_ENC_KEY', os.environ['EHR_K'])
setv('ADMIN_USERNAME', 'admin')
setv('ADMIN_PASSWORD', os.environ['ADMIN_PASSWORD'])
setv('ADMIN_DISPLAY_NAME', '系统管理员')
open(p, 'w', encoding='utf-8').write(s)
PYEOF
chmod 600 "$ENV_FILE"
echo "[bootstrap-env] 已生成 $ENV_FILE（权限 600）"
echo "=================================================="
echo " 后台管理员初始账号（请立即保存，登录后请改密）："
echo "   用户名：admin"
echo "   密  码：$ADMIN_PASSWORD"
echo " 数据库 medontime 角色密码已写入 .env 的 DB_PASSWORD。"
echo " 警告：.env 中的 EHR_ENC_KEY / PHONE_ENCRYPTION_KEY 上线后不可更换，"
echo "       请把 .env 另行备份到安全位置（勿提交 git）。"
echo "=================================================="
