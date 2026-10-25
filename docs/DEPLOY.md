# MedOnTime 部署文档

> 适用版本：develop 分支（脚手架 + 全端业务开发完成、集成收口定版之后）
> 目标环境：腾讯云广州 Ubuntu 22.04 LTS（x86_64），Docker + Docker Compose v2
> 数据库：复用服务器既有 PostgreSQL 16 容器 `nexasx-postgres`，本项目只在其中
> 新建自己的角色与数据库；Redis 由本项目自建容器提供。
>
> **部署红线**：严禁停止、重启、修改服务器上任何既有容器与服务（包括
> `nexasx-postgres` 本身）。本项目的一切操作只作用于 compose 项目
> `medontime` 的容器组，以及 PG 中新新建的 `medontime` 角色/数据库。

---

## 一、架构与容器清单

```
                         ┌──────────────────── 服务器（Ubuntu 22.04 + Docker）─────────────────────┐
   浏览器 ── :8080 ────▶ │  medontime-web    (nginx:alpine)  静态页 + /api 反代 ──┐                 │
   浏览器 ── :8081 ────▶ │  medontime-admin  (nginx:alpine)  静态页 + /api 反代 ──┤                 │
                         │                                                        ▼                 │
                         │  medontime-api    (node:22-alpine)  NestJS :3000（仅内网）             │
                         │      │  BullMQ 队列                    │ SQL（容器网络直连）             │
                         │      ▼                                 ▼                               │
                         │  medontime-redis  (redis:7-alpine)   nexasx-postgres（既有容器，勿动）    │
                         │  appendonly + 卷 medontime-redis     └─ 数据库 medontime（本项目新建）   │
                         └──────────────────────────────────────────────────────────────────────────┘
```

| 服务（compose） | 镜像 | 容器名 | 宿主机端口 | 网络 | 说明 |
|---|---|---|---|---|---|
| api | 本地构建 `services/api/Dockerfile` | `medontime-api` | 不映射（expose 3000） | medontime-net + nexasx-internal | NestJS 后端；全局路由前缀 `/api`；健康探针 `/api/ops/health`、就绪探针 `/api/ops/ready` |
| web | 本地构建 `apps/web/Dockerfile` | `medontime-web` | `${WEB_PORT:-8080}` → 80 | medontime-net | Web 用户门户静态站，`/api/` 反代到 api:3000（透传原始路径） |
| admin | 本地构建 `apps/admin/Dockerfile` | `medontime-admin` | `${ADMIN_PORT:-8081}` → 80 | medontime-net | 后台管理平台静态站，反代口径同 web |
| redis | `redis:7-alpine` | `medontime-redis` | 不映射 | medontime-net | 提醒队列（BullMQ）；AOF 持久化，卷 `medontime-redis` |

- PostgreSQL 不在本编排内：api 容器加入既有外部网络 `nexasx-internal`，
  以主机名 `nexasx-postgres:5432` 连接其中**新建**的 `medontime` 数据库。
- 前端与后端同源部署：浏览器只访问 web/admin 的 nginx，`/api` 请求由
  nginx 透传到后端（后端全局前缀就是 `/api`，探针全路径 `/api/ops/health`）。

## 二、端口规划

| 端口 | 用途 | 暴露范围 |
|---|---|---|
| 8080（WEB_PORT，可改） | Web 用户门户 HTTP | 公网（建议经云防火墙/安全组控制，见安全清单） |
| 8081（ADMIN_PORT，可改） | 后台管理平台 HTTP | 公网（强烈建议安全组仅放行运维 IP） |
| 3000 | API | 仅 Docker 内网，不映射宿主机 |
| 5432 | 既有 PostgreSQL | 维持服务器现状（宿主机 127.0.0.1），本项目不新增暴露 |
| 6379 | 本项目 Redis | 仅 Docker 内网，不映射宿主机 |

> 生产环境已通过宿主机 Nginx 反代并配置腾讯云 HTTPS 证书（`mot.ulife.vip`、`admin.ulife.vip` 终止 TLS），容器内部保持 HTTP 直连（28080/28081），详情见附录 B。

## 三、服务器前置条件

1. Ubuntu 22.04，已安装 Docker Engine 与 Docker Compose v2
   （`docker version`、`docker compose version` 可用），部署账号可免密 sudo。
2. 既有容器 `nexasx-postgres` 正常运行，且其网络 `nexasx-internal` 存在
   （`docker network inspect nexasx-internal`）。本项目不创建、不修改它们。
3. 宿主机 8080/8081（或改定的 WEB_PORT/ADMIN_PORT）未被占用，安全组已放行。
4. 服务器可访问 npm 镜像源（默认 npmmirror）与 Docker Hub
   （拉取 node:22-alpine / nginx:alpine / redis:7-alpine 基础镜像；
   如 Docker Hub 拉取受限，使用服务器既有的镜像加速配置，本项目不另行处理）。
5. 磁盘预留 ≥ 10 GB（镜像构建 + Redis 卷 + 备份）。

## 四、环境变量说明

全部变量集中在 `deploy/.env`（模板 `deploy/.env.example`，逐项带注释）。
真实值不入仓（`.gitignore` 已排除），文件权限保持 600。

| 变量 | 必填 | 说明 |
|---|---|---|
| `NODE_ENV` | 是 | 固定 `production`（生产部署必须显式配置各密钥；启动时未配密钥强行阻断待代码层补全守卫） |
| `PORT` | 否 | api 容器内端口，默认 3000，一般不改 |
| `NPM_REGISTRY` | 否 | 构建期 npm 源，默认 npmmirror |
| `DB_PASSWORD` | 是 | medontime 角色密码；`db-init.sh` 建角色用，且必须与 DATABASE_URL 内密码一致。`openssl rand -hex 24` |
| `DATABASE_URL` | 是 | `postgresql://medontime:<DB_PASSWORD>@nexasx-postgres:5432/medontime` |
| `REDIS_URL` | 是 | `redis://redis:6379`（compose 服务名） |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 是 | 用户端双 token 密钥，各自独立 `openssl rand -hex 32` |
| `ADMIN_JWT_SECRET` | 建议 | 后台 token 密钥；未配回退 access 密钥，生产建议独立 |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | 否 | 当前后端硬编码常量 `2h` / `30d` 生效（对齐 API_CONTRACT 定版口径）；配置项动态注入待代码层改造 |
| `PHONE_ENCRYPTION_KEY` | 是 | 手机号 AES-256-GCM 密钥，32 字节 hex（64 字符）：`openssl rand -hex 32` |
| `PHONE_HMAC_KEY` | 是 | 手机号查询哈希密钥，任意长随机串 |
| `EHR_ENC_KEY` | 是 | 病历正文等字段加密密钥，32 字节 hex。**上线后不可更换/丢失**，否则历史密文不可解 |
| `AI_ENABLED` | 是 | AI 健康助手总开关，上线初期保持 `false`（网关未接、POC-2 暂停中） |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_DISPLAY_NAME` | 是 | 管理员播种参数；密码 ≥ 8 位，首次登录后立即改密 |
| `WEB_PORT` / `ADMIN_PORT` | 否 | 前端宿主机端口，默认 8080 / 8081 |

## 五、首次部署逐步操作

在服务器上执行（假设代码已拉取到服务器某目录，如 `/opt/med-on-time`）：

```bash
# 0) 拉取代码（develop 分支）
git clone -b develop git@github.com:xusofty-cyber/med-on-time.git /opt/med-on-time
cd /opt/med-on-time

# 1) 准备环境变量：复制模板后逐项填真实值（生成命令见模板注释）
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
vi deploy/.env

# 2) 在既有 PG 容器内新建本项目角色与数据库（幂等；会询问超级用户密码，
#    该密码不落任何文件）
deploy/scripts/db-init.sh

# 3) 一键部署：构建 -> Redis -> 迁移 -> 药品 seed -> 管理员播种 -> 启动 -> 健康检查
deploy/scripts/deploy.sh
```

`deploy.sh` 任一步失败会停在该环节并打印失败原因，修复后可直接重跑
（迁移、药品导入、管理员播种均为幂等）。其内部等价的手动命令如下，
排障或分步执行时使用：

```bash
cd deploy
docker compose build                                        # 构建三镜像
docker compose up -d redis                                  # 先起 Redis
docker compose run --rm api prisma migrate deploy           # 执行未应用的迁移
docker compose run --rm api node dist/prisma/seeds/import-drug-seed.js   # 导入 200 条药品字典
docker compose run --rm api node dist/prisma/seeds/create-admin.js       # 播种管理员+基础角色
docker compose up -d                                        # 启动全部
curl -s http://127.0.0.1:8080/api/ops/health                # 存活探针（信封 JSON，code=0）
curl -s http://127.0.0.1:8080/api/ops/ready                 # 就绪探针（校验 DB 连通）
```

部署完成后：

- Web 用户门户：`http://<服务器IP>:8080/`
- 后台管理平台：`http://<服务器IP>:8081/`（用 `.env` 中管理员账号登录，
  **登录后立即在后台修改密码**，并同步更新 `.env` 的 ADMIN_PASSWORD 以便日后播种口径一致）
- 后台内可查看仪表盘计数（注册/活跃/提醒投递/待核验药品）。

## 六、冒烟验收清单

部署后逐项打勾（任一不过先看 `deploy/scripts/logs.sh api`）：

- [ ] `GET /api/ops/health` 返回 HTTP 200 且信封 `code=0`（进程存活）
- [ ] `GET /api/ops/ready` 返回 HTTP 200 且信封 `code=0`（DB 连通）
- [ ] Web 首页可打开、静态资源无 404；后台首页可打开
- [ ] 后台管理员登录成功（`POST /api/admin/auth/login` 经页面操作验证）
- [ ] 药品字典计数正确（在 PG 中执行）：
      `SELECT review_status, count(*) FROM drug GROUP BY review_status;`
      期望 `approved = 182`、`pending_review = 18`，合计 200 条
      （pending 的 18 条为待双人核验药品，未核验前不对外可见，属预期行为）
- [ ] 管理员与基础角色就位：
      `SELECT username FROM admin_user;` 有播种账号；
      后台「系统/角色」页可见 super_admin / operator / cs_agent / medical_reviewer
- [ ] 普通用户注册与登录通道验证：邮箱验证码注册及手机号免验证码直接注册已打通；
      微信小程序登录/扫码登录与单次订阅消息已接入实测；
      短信验证码通道仍为 dev stub（暂不支持短信验证码登录与短信找密）。
- [ ] `docker ps` 确认本项目四容器 `medontime-*` 均为 Up，
      且服务器既有容器未受任何影响

## 七、生产待接项与通道现状说明

1. **短信网关未接**：注册/验证码登录/重置密码的短信通道当前为 dev stub
   （验证码只生成不下发，日志中亦脱敏不打印）。普通用户可正常使用**邮箱验证码注册**
   或**手机号免验证码直接注册**（手机号未验证三受限口径见 AUTH_CHANNELS.md），
   以及微信小程序授权/扫码登录；仅短信找密与短信验证码登录暂未开通真实下发。
   运维亦可按下方临时开户脚本手动建号。
2. **微信绑定与订阅消息已通**：小程序登录、微信绑定、小程序扫码登录 Web 及单次订阅消息下发
   已接入正式 AppID/AppSecret 与模板并完成实测。后续待申请长期订阅模板与正式提审。
3. **AI 健康助手未开**：`AI_ENABLED=false` 保持关闭（POC-2 智谱通道已实测 120 题，星火通道
   待凭据核对，生产网关拦截返回 40310，待外部医学审校通过后按需开通）。
4. **HTTPS 已就绪**：生产环境已由宿主机 Nginx 统一反代并配置腾讯云 SSL 证书终止 TLS，
   对外统一使用 HTTPS 访问。

### 临时开户办法（短信网关接入前，运维专用）

用 API 容器内的一次性脚本创建账号——脚本复用应用自身的手机号加密/
哈希实现（与注册接口落库口径完全一致），密码以 argon2id 哈希落库：

```bash
cd /opt/med-on-time/deploy
docker compose exec \
  -e OPEN_PHONE='13800138000' \
  -e OPEN_PASSWORD='请设强密码' \
  -e OPEN_NICKNAME='临时用户' \
  api node -e '
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");
const { PhoneCryptoService } = require("./dist/src/modules/auth/services/phone-crypto.service.js");
const { uuidv7 } = require("./dist/src/common/utils/uuidv7.js");
(async () => {
  const phone = process.env.OPEN_PHONE, password = process.env.OPEN_PASSWORD;
  const nickname = process.env.OPEN_NICKNAME || "临时用户";
  if (!process.env.PHONE_HMAC_KEY || !process.env.PHONE_ENCRYPTION_KEY) {
    throw new Error("PHONE_HMAC_KEY or PHONE_ENCRYPTION_KEY not set in environment");
  }
  const cryptoSvc = new PhoneCryptoService({ get: (k) => process.env[k] });
  const prisma = new PrismaClient();
  const accountId = uuidv7();
  await prisma.$transaction(async (tx) => {
    await tx.userAccount.create({ data: {
      id: accountId,
      phone: cryptoSvc.encryptPhone(phone),
      phoneHash: cryptoSvc.hashPhone(phone),
      phoneVerifiedAt: new Date(),
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      nickname,
      registerChannel: "web", registeredAt: new Date(), status: "active",
    }});
    await tx.member.create({ data: {
      id: uuidv7(),
      accountId,
      displayName: nickname,
      relationship: "self",
      status: "active",
    }});
  });
  console.log("account and self member created successfully, id:", accountId);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
'
```

创建后该用户即可在 Web 端用「手机号 + 密码」登录。注意：手机号重复
（phone_hash 唯一）会报错，属预期；此办法仅限运维临时开户，
短信网关接入后停用。

## 八、日常运维

所有脚本位于 `deploy/scripts/`，均只作用于 compose 项目 `medontime`。

### 更新发布

```bash
deploy/scripts/update.sh              # git pull -> 重建 -> 启动 -> 迁移 -> 健康检查
deploy/scripts/update.sh --with-seed  # 同时刷新药品字典 seed（幂等，只升不降核验状态）
```

构建失败时脚本在替换容器前停止，旧版本继续提供服务。迁移失败时新旧
schema 可能不兼容，按第九节回滚口径处理，不要强行反复重跑。

### 日志

```bash
deploy/scripts/logs.sh           # 全部服务跟踪日志（每容器回看 200 行）
deploy/scripts/logs.sh api       # 只看 api
TAIL=500 deploy/scripts/logs.sh api
# 退出跟踪：Ctrl+C（不影响容器运行）
```

### 停止与重启

```bash
deploy/scripts/stop.sh                       # 停本项目四容器（数据卷保留）
cd deploy && docker compose up -d            # 重新拉起
docker compose restart api                   # 只重启某个服务
```

### 备份与恢复

```bash
deploy/scripts/backup.sh         # 导出到 deploy/backups/medontime-<时间戳>.dump（保留最近 14 份）
# 建议定时：服务器 crontab 每日 03:30 执行
#   30 3 * * * cd /opt/med-on-time && deploy/scripts/backup.sh >> deploy/backups/backup.log 2>&1
```

恢复（把某个备份恢复进 medontime 库；恢复前先停 api 避免写入）：

```bash
cd deploy
docker compose stop api
# 将备份文件喂给既有 PG 容器内的 pg_restore（-h/-U/-d 与建库口径一致）
docker exec -i -e PGPASSWORD='<.env 中的 DB_PASSWORD>' nexasx-postgres \
  pg_restore -h 127.0.0.1 -U medontime -d medontime --clean --if-exists \
  < backups/medontime-YYYYmmdd-HHMMSS.dump
docker compose start api
curl -s http://127.0.0.1:8080/api/ops/ready   # 确认 code=0
```

> 备份只覆盖 PostgreSQL 数据。Redis 卷为队列数据（提醒任务），丢失后
> 由后端按计划重新生成，不做单独备份。`.env` 与本文件请另行异地保管
> 一份（.env 含全部密钥，保管要求见第十节）。

恢复演练（定期验证备份真能恢复，不动生产库）：

```bash
deploy/scripts/restore-drill.sh                 # 默认用最新一份备份
deploy/scripts/restore-drill.sh deploy/backups/medontime-20261025-103239.dump  # 指定备份（相对路径以调用方当前目录为基准）
```

演练流程：校验 dump（PGDMP 魔数 + `pg_restore -l` 清单可读）→ 起一次性
postgres:16 容器（须与生产 PG 大版本一致）→ 预建 `medontime` 角色
→ `docker cp` 传 dump 进容器恢复 → 逐表核对表清单与行数
（生产库只做只读 `SELECT`）→ 删容器。退出 0 即通过。
2026-10-25 首次演练通过：159 张表清单一致，逐表行数 0 差异，
总行数 414=414。注意：`medontime` 账号无建库权限，演练须用一次性
容器；若目标库缺 `medontime` 角色，恢复会出现 159 条 `OWNER TO`
报错（仅改属主语句、不影响数据），真实恢复进原集群无此问题。

## 九、回滚口径

- **代码回滚**：镜像按构建时代码打包、无独立版本标签。回滚 = 在仓库
  切回目标提交（`git checkout <commit>` 或切回上一个可用分支状态）后
  重跑 `update.sh` 的构建/启动部分（跳过 git pull）。建议每次正式发布
  后在仓库打 tag（如 `prod-20261023`），回滚时按 tag 检出重建。
- **数据库回滚**：Prisma 迁移只进不退（无 down 迁移）。若新版本迁移已
  执行且必须退回旧版本应用：先按第八节用发布前最近一份备份恢复数据库，
  再回滚代码重建。**因此每次发布前务必先跑一次 `backup.sh`。**
- **配置回滚**：`.env` 修改前留一份带日期的副本（如 `.env.bak-20261023`，
  权限 600，不入仓）；回滚配置后 `docker compose up -d` 使其生效。

## 十、安全清单

- [ ] `deploy/.env` 权限 600，且未被 git 跟踪（`git status` 不出现该文件）
- [ ] 全部密钥用 `openssl rand -hex 32` 独立生成，无一项保留模板占位值、
      无多项复用同一值；DB_PASSWORD 与 DATABASE_URL 内密码一致
- [ ] `EHR_ENC_KEY`、手机号双密钥已在密码管理器/保险库留档（丢失 =
      历史密文数据不可解）；轮换口径：本期不支持在线轮换，勿随意更换
- [ ] 管理员初始密码登录后已修改；后台端口（8081）安全组尽量仅放行
      运维出口 IP；条件允许时整体前置 HTTPS
- [ ] 服务器 SSH 使用密钥登录并关闭密码登录（服务器级事项，本项目仅提示）
- [ ] `deploy/backups/` 中的 dump 含完整业务数据，按敏感数据保管，
      定期转存异地并清理本机过期份（脚本自动保留最近 14 份）
- [ ] 严禁把 `.env`、dump、超级用户密码粘贴到聊天/工单/仓库；
      `db-init.sh` 的超级用户密码只经环境变量或交互输入，不落文件

## 十一、故障排查简表

| 现象 | 先查 | 常见原因 |
|---|---|---|
| deploy.sh 停在「校验」步 | `.env` 占位值未替换；`docker network inspect nexasx-internal` | 模板值未改；既有 PG 组未就绪 |
| 迁移步 P1001/P1000 类错误 | api 一次性容器日志；核对 DATABASE_URL | DB_PASSWORD 两处不一致；db-init 未执行；api 未加入 nexasx-internal |
| health 有响应但 ready 非 0 | `logs.sh api` | DB 连通后又中断；迁移未完成 |
| 前端打开但接口全 404 | 浏览器网络面板请求路径 | nginx proxy_pass 被误改带尾斜杠（剥掉 /api 前缀）；api 容器未起 |
| 前端页面 502 | `docker compose ps`、api 健康状态 | api 尚在启动（等 start_period）；api 崩溃看日志 |
| 管理员登录失败 | 确认用的是 `.env` 当前 ADMIN_PASSWORD 播种的账号 | 改过 .env 未重跑播种；在后台改密后以新密码为准 |
| 药品计数不是 200 | 导入日志是否有跳过告警 | seed 文件缺失（镜像构建问题）；重复导入为幂等更新，不增行数 |

## 附录：部署相关文件清单

| 路径 | 用途 |
|---|---|
| `services/api/Dockerfile` | API 多阶段镜像（构建上下文为仓库根） |
| `apps/web/Dockerfile` + `apps/web/nginx.conf` | Web 门户镜像与反代配置 |
| `apps/admin/Dockerfile` + `apps/admin/nginx.conf` | 后台镜像与反代配置 |
| `deploy/docker-compose.yml` | 编排（项目名 medontime） |
| `deploy/.env.example` | 环境变量模板（真实值存 deploy/.env，不入仓） |
| `deploy/scripts/db-init.sh` | 幂等新建 medontime 角色/数据库 |
| `deploy/scripts/deploy.sh` | 一键首次部署 |
| `deploy/scripts/update.sh` | 拉代码滚动更新 |
| `deploy/scripts/backup.sh` | 数据库备份（保留 14 份） |
| `deploy/scripts/logs.sh` / `stop.sh` | 日志 / 停止（仅本项目） |
| `.dockerignore` | 构建上下文排除（node_modules、dist、.env、备份） |

## 附录 B：当前生产实例实况（2026-10-23 上线，与正文通用口径的差异以本附录为准）

- **服务器**：腾讯云广州，Ubuntu 22.04 LTS x86_64，公网 `<PROD_SERVER_IP>` / Tailscale `<TAILSCALE_IP>`；SSH 22（用户 ubuntu，免密 sudo）。仓克隆于 `~/projects/medontime`（develop 分支）。
- **端口实况**：正文默认 8080/8081 已被该机既有服务占用（zhihu-web 8080、hookbox-relay 18080），实例实际 `WEB_PORT=28080`、`ADMIN_PORT=28081`（写在服务器 `deploy/.env`）。API 3000、Redis 6379 不映射宿主机。
- **入口与证书**：宿主机 nginx 三站点——`mot.ulife.vip` → 127.0.0.1:28080、`admin.ulife.vip` → 127.0.0.1:28081、`blog.ulife.vip` → 静态占位页；腾讯云证书包在服务器 `~/projects/ssl/<域名>_nginx/`，站点配置在 `/etc/nginx/sites-enabled/`（沿用该机既有 n8n 站点风格）；DNS 三条 A 记录均指向生产公网 IP（DNSPod）。云防火墙 80/443/22 已放行，无需为本项目新增（生产数据库 5432 端口安全组建议尽快收紧至内网/运维来源）。
- **数据库**：既有容器 `nexasx-postgres`（PG 16），库 `medontime`；容器内经 `nexasx-internal` 网络以 `nexasx-postgres:5432` 访问。全量迁移序列已实跑（基线初始化/约束分区/V1.3 auth通道/V1.4 大模型配置/V1.5 公众号草稿，当前 Schema 58 表）；分区迁移首跑曾因旧表主键索引未改名 42P07 失败，修复（索引 RENAME + ai_call_log 唯一索引复合化）已回仓。
- **构建实况修复（已回仓 Dockerfile）**：① 三镜像设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`；② api 镜像 apk 源换腾讯云镜像 `mirrors.cloud.tencent.com`（官方 CDN 在该机超时、阿里源慢）；③ api 运行阶段补 `prisma generate`（pnpm deploy 产物为未生成客户端桩）。
- **SMTP 实况**：`SMTP_URL=smtps://<用户QQ邮箱>@smtp.qq.com:465` 与 `SMTP_FROM` 已写入服务器 deploy/.env 并实发验证通过；授权码只存在该文件。个人 QQ SMTP 有日发送上限，用户量上来后应迁专业发信服务（注册侧代码不用改，只换 env）。
- **运维纪律（该机特有）**：① **不得动既有服务与容器**（n8n、zhihu-web、hookbox-relay 等），只许新增/更新本项目资源；② 构建缓存曾涨至 30GB——构建后执行 prune 回收无用缓存与悬空镜像，镜像保持精简；③ 管理员 `admin` 初始密码由 bootstrap 一次性打印、负责人留存，首登后改密。
- **热修通道（仓库外）**：单文件热修曾用「打包改动文件 → 传服务器解压 → compose build 对应服务 → up -d」直发，事后必须汇总回仓推送 develop（2026-10-23 白屏修复即走此路，代码已回仓）。
