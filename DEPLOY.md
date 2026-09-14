# 部署运维速查

> 服务器运维的唯一来源。所有命令在 `~/readest/docker/` 目录下执行。

## 凭据位置

> ⚠️ **本文件不包含任何密钥、密码、token 实际值**。所有生产凭据在仓库外的 `~/Documents/MyVault/Keys/` 目录，跟 SSH 私钥 / Android keystore 同位置。完整档案见 `~/Documents/MyVault/Keys/README.md`（含 SSH 私钥路径 + 指纹、CF tunnel access secret、keystore 密码位置、jasonchencnn GitHub fork 凭据、紧急恢复流程）。

| 资源 | 仓库外位置 | 仓库内引用 |
|---|---|---|
| 生产服务器 SSH 私钥 | `~/Documents/MyVault/Keys/ssh-key-2026-08-31.key` | `~/.ssh/config` 3 个 alias：`oracle` / `ora` / `oracle-jump` |
| Android 签名 keystore | `~/Documents/MyVault/Keys/moyue.keystore` + `.bak` + `.wrong-20260908.bak` | 仓库 `.gitignore` 排除；keystore.properties 在 `src-tauri/gen/android/app/`（gitignored） |
| keystore 密码 | 1Password `moyue/keystore` 条目 | — |
| Cloudflare Tunnel secret | `~/Documents/MyVault/Keys/README.md` 1.3 节 | — |
| 凭据使用指南 | `~/Documents/MyVault/Keys/README.md` | 本节 |

**首次接手人必读**：`cat ~/Documents/MyVault/Keys/README.md`（10 分钟搞清所有凭据位置和用法）

## 0. 快速连接

```bash
ssh oracle                              # Cloudflare Tunnel 直连，需 sudo 才能 docker
cd ~/readest/docker
```

> `ssh oracle` 走 Cloudflare Tunnel，**家宽免热点直连**（服务器 sshd 只听 127.0.0.1:22，公网 22 已封死）。
> SSH 私钥已配置在 `~/.ssh/config`，无需 `-i` 参数。

> `ssh oracle` 走 Cloudflare Tunnel，**家宽免热点直连**（服务器 sshd 只听 127.0.0.1:22，公网 22 已封死）。

## 1. 容器现状

| 容器 | 镜像 | 角色 |
|---|---|---|
| `readest-client` | `readest-moyue:latest` | Next.js 客户端（fork 自建，含邀约登录/会员/支付路由） |
| `supabase-db` | `supabase/postgres:15.1.0.117` | 数据库（已应用迁移至 024） |
| `supabase-auth` | `supabase/gotrue:v2.151.0` | GoTrue，**`GOTRUE_DISABLE_SIGNUP=true`** |
| `supabase-rest` | `postgrest:v12.1.0` | PostgREST |
| `supabase-kong` | `kong:2.8.1` | API 网关 |
| `readest-minio` | `minio/minio:RELEASE.2024-05-10...` | S3 兼容对象存储 |

## 2. 备份文件

`~/readest/docker/` 下部署时留了备份：

- `.env.bak-moyue-YYYYMMDD`（部署前的 .env）
- `compose.yaml.bak-moyue-YYYYMMDD`（部署前的 compose.yaml）

> 部署后没新改 .env/compose，这两份备份 = fork 改动前基线。

## 3. 关键环境变量（`~/readest/docker/.env`）

| 变量 | 值 | 说明 |
|---|---|---|
| `DISABLE_SIGNUP` | `true` | GoTrue 关闭匿名注册 |
| `SITE_URL` | `https://readest.chen-cn.top` | 公开站域 |
| `READEST_IMAGE` | `readest-moyue:latest` | **本地构建的 fork 镜像**（**勿改回 `ghcr.io/.../latest`**，否则客户端退回官方版本无邀约登录/支付路由） |
| `SUPABASE_URL` / `SUPABASE_PUBLIC_URL` | (kong) | Supabase 内部/外部 URL |
| `SITE_URL` | (站点) | 同时给 client 与 Web URL 用 |
| `STORAGE_FIXED_QUOTA` | `209715200` | 旧全站固定 200MB（**已无害**，新链路用 `plans` 档位，但保留无害） |
| `ADMIN_EMAILS` | `admin@chen-cn.top` | 管理员邮箱（逗号分隔），用于 `/api/auth/invite/admin` 鉴权 |
| `PAY_GATEWAY_URL` | (空) | 易支付网关 URL（如 `https://pay.example.com/`）— 留空 = 支付关闭 |
| `PAY_GATEWAY_ID` | (空) | 商户 ID（pid） |
| `PAY_GATEWAY_KEY` | (空) | 商户密钥（**勿泄露**） |
| `PAY_SITE_URL` | `https://readest.chen-cn.top` | 公开回调域（网关回调能到的地址） |
| `PAYMENT_PROVIDER` | `epay` | 客户端 UI 用，决定 `/user` 页走 epay 还是 stripe |

## 4. 数据库迁移

服务器迁移在 `~/readest/docker/volumes/db/migrations/`，**按文件名**记账于 `readest_meta.migrations` 表。

| 已应用 | 备注 |
|---|---|
| 001–018 | 官方基线 |
| 019–022 | 官方 stat 系列（d49fd8b 较新） |
| **023** | **我们的 invites（邀约注册）** |
| **024** | **我们的 billing（会员计费）** |

### 应用新迁移（rsync 后执行）

```bash
scp <local>023_xxx.sql oracle:~/readest/docker/volumes/db/migrations/
ssh oracle 'cd ~/readest/docker && sudo docker compose exec -T db /docker-entrypoint-initdb.d/zz-readest-migrations.sh'
```

> 脚本是幂等的（按文件名记账）。

### 5 个 RPC（023+024 暴露，service_role 才能调）

- `validate_invite(p_code text) → json` — 存在+有效+未超额
- `claim_invite(p_code text, p_user_id uuid, p_email text) → json` — 原子扣减（条件 UPDATE）
- `mark_order_paid(p_order_no text, p_trade_no text, p_notify jsonb) → json` — pending→paid + 续期 plans
- `get_user_plan(p_user_id uuid) → text` — 实际档（过期降级 free）
- `get_storage_usage(p_user_id uuid) → bigint` — SUM(files.file_size) 实时用量

## 5. 重建容器（env 改了必走）

```bash
ssh oracle 'cd ~/readest/docker && sudo docker compose up -d'
```

> 只改 client 的话 `up -d client` 即可。

## 6. 镜像构建（重打 fork 客户端镜像）

```bash
# 1. 本地拉源码到服务器（增量）
rsync -az --stats --exclude node_modules --exclude .git --exclude target \
  --exclude 'apps/readest-app/src-tauri/gen' --exclude 'apps/readest-app/src-tauri/target' \
  --exclude '*.log' --exclude '.DS_Store' \
  ~/Documents/MyVault/Projects/readest/readest/ oracle:~/readest-fork/

# 2. 服务器后台构建（必用 sudo sh -c + nohup + 全句柄重定向，否则 SSH 一退出构建就死）
ssh oracle
sudo rm -f /tmp/moyue-build.log  # Ubuntu 24.04 fs.protected_regular 阻 root 覆盖 ubuntu 旧日志
sudo sh -c "nohup docker build --progress=plain -t readest-moyue:latest /home/ubuntu/readest-fork > /tmp/moyue-build.log 2>&1 < /dev/null &"

# 3. 轮询进度（ARM 构建约 5–30 分钟，缓存复用后更快）
tail -3 /tmp/moyue-build.log

# 4. 切换镜像
sed -i "s|^READEST_IMAGE=.*|READEST_IMAGE=readest-moyue:latest|" ~/readest/docker/.env
sudo docker compose up -d client
```

> **踩坑 1**：直接 `nohup sudo docker build ... &`（不带 `sh -c`）会让 sudo 进程在 SSH 关闭时被杀，**必须 `sudo sh -c "nohup ... &"`**。
> **踩坑 2**：`/tmp/moyue-build.log` 是 ubuntu 用户的，root 写不动（sticky + protected_regular），**必须先 `sudo rm -f` 删除旧文件**。

## 7. 路由快速探活

```bash
cd ~/readest/docker
ANON=$(grep "^ANON_KEY" .env | cut -d= -f2)

# 邀约登录（应 422 signup_disabled）
curl -X POST http://localhost:8000/auth/v1/signup \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"probe@test.com","password":"testpass123"}'

# 邀请码校验（应 {valid:false, remaining:0}）
curl -X POST http://localhost:3000/api/auth/invite/validate \
  -H "Content-Type: application/json" -d '{"inviteCode":"ABCD-EFGH-JKMN"}'

# /api/user/plan（未登录应 403）
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/user/plan

# 端到端登录（需要已注册用户）
TOKEN=$(curl -s -X POST "http://localhost:8000/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"user@x.com","password":"xxx"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s http://localhost:3000/api/user/plan -H "Authorization: Bearer $TOKEN"
```

## 8. 邀请码（手动 SQL）

```bash
cd ~/readest/docker
sudo docker compose exec -T db psql -U supabase_admin -d postgres -c "
  INSERT INTO public.invites (code, note, max_uses, expires_at)
  VALUES ('CHEN-2026-XXXX', 'manual', 1, now() + interval '30 days')
  ON CONFLICT (code) DO NOTHING;"
```

> 码格式：Crockford 字母表 `0-9 A-H J K M N P-T V-Z`（去 I/L/O/U），4-4-4 带连字符。

或用 admin API（需要 admin 账号 JWT）：

```bash
TOKEN=$(curl -s -X POST "http://localhost:8000/auth/v1/token?grant_type=password" \
  -H "apikey: $(grep ^ANON_KEY .env | cut -d= -f2)" -H "Content-Type: application/json" \
  -d '{"email":"admin@chen-cn.top","password":"<password>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -X POST http://localhost:3000/api/auth/invite/admin \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"maxUses":1,"expiresInDays":30}'
```

## 9. 支付开通（拿到易支付商户号后）

1. 申请易支付（个人/聚合）：拿 `gateway URL`、`pid`、`key`
2. 服务器 `.env` 填 `PAY_GATEWAY_URL/ID/KEY`
3. `sudo docker compose up -d client`（env 注入）
4. 用 1 分钱真单端到端验证：
   - `/user` 页选 Plus 套餐 + 微信 → 跳网关
   - 网关 notify → `mark_order_paid` 落账
   - 同步端 `/api/user/plan` 应返回 `plan:plus, quota:2GB`
5. 失败排错看 `docker logs readest-client | grep -E "epay|mark_order_paid"` + DB 订单表 `public.orders`

## 10. 回滚

如果 fork 镜像出问题：

```bash
ssh oracle 'cd ~/readest/docker
  sed -i "s|^READEST_IMAGE=.*|READEST_IMAGE=ghcr.io/readest/readest:latest|" .env
  sudo docker compose up -d client'
```

数据库迁移**不回滚**（一旦应用记录在账本，`readest_meta.migrations`）。如需真回滚 023/024：手动 `DROP TABLE/DROP FUNCTION` + DELETE FROM readest_meta.migrations WHERE name IN ('023_...','024_...')。

.env/compose 用备份恢复：
```bash
cd ~/readest/docker
cp .env.bak-moyue-YYYYMMDD .env
cp compose.yaml.bak-moyue-YYYYMMDD compose.yaml
sudo docker compose up -d
```

## 11. 监控

```bash
ssh oracle 'cd ~/readest/docker
  sudo docker compose ps
  sudo docker compose logs --tail=100 -f readest-client
  sudo docker compose logs --tail=100 -f supabase-auth'
```

---

---

> **sing-box 部署章节已迁出**，详见 `SINGBOX-DEPLOY.md`（按本仓库 `SINGBOX-STATUS-2026-09-10.md` 同位置维护）。
