# 部署到 AWS（北美，us-east-1）

拓扑：**后端一台 EC2**（Express + socket.io + 本机 SQLite，Caddy 反代 + 自动 HTTPS），
**前端 S3 + CloudFront**（静态站）。两个子域名：`play.你的域名` 指 CloudFront，`api.你的域名` 指 EC2 的 Elastic IP。

为什么是这个形态：账号和云存档在 SQLite 文件里、联机房间在进程内存里（`Backend/src/multiplayer/sessions.ts`），
所以后端必须是一台常驻、单实例、带持久磁盘的机器；Lambda / Fargate 都不合适。前端是纯静态文件，
`public/music` 有 530 MB，不该跟后端挤一台机。

这个目录里的东西：

| 文件 | 用途 |
|---|---|
| `backend.env.example` | 后端生产环境变量模板 → 服务器 `/etc/idle-game/backend.env` |
| `frontend.env.example` | 前端构建变量模板 → 本机 `Frontend-3D/.env.local`（本地 / 云端后端的开关在这里） |
| `aws.env.example` | 发布脚本的参数（桶名、分发 id、profile）→ `deploy/aws.env`（git 忽略） |
| `Caddyfile` | api 子域名的反代 + HTTPS |
| `systemd/*.service`、`*.timer` | 后端常驻、每晚备份 |
| `scripts/server-setup.sh` | 新机器一次性初始化 |
| `scripts/deploy-backend.sh` | 服务器上发一版后端 |
| `scripts/deploy-frontend.sh` | 本机构建前端并同步到 S3 |
| `scripts/backup-db.sh`、`restore-db.sh` | SQLite 备份 / 恢复 |
| `aws/*.json` | IAM 策略、S3 生命周期、CloudFront 单页回退的模板 |

## 0. 本地 / 云端后端的开关

前端构建时从 `Frontend-3D/.env.local` 读（解析在 `src/Api/backendUrl.ts`）：

```
VITE_BACKEND_TARGET=local          # local | cloud
VITE_BACKEND_URL_LOCAL=http://localhost:3001
VITE_BACKEND_URL_CLOUD=https://api.你的域名
```

日常开发写 `local`，`npm run dev` 就打本机后端；发布时 `deploy-frontend.sh cloud` 会临时覆盖成 `cloud`，
不用改文件。这些值是**编译进产物**的，改了要重新 build，Electron 打包同理。
老写法 `VITE_BACKEND_URL` 仍然认且优先级最高，已有的 `.env` 不用动。

## 1. 账号准备（一次）

1. 域名进 Route 53（或在别家注册，NS 指过来）。
2. **ACM 证书**：在 **us-east-1** 申请 `play.你的域名`（CloudFront 只认 us-east-1 的证书），DNS 验证。
   api 子域名不用申请，Caddy 自己签。
3. 本机 `aws configure --profile idle-game`，给这个 IAM 用户挂 `aws/iam-frontend-deploy-policy.json`
   （把 `FRONTEND_BUCKET`、`ACCOUNT_ID`、`CLOUDFRONT_DISTRIBUTION_ID` 换成真值）。
4. Google 登录（可选）：Google Cloud 控制台的 OAuth 客户端，「已授权的 JavaScript 来源」加 `https://play.你的域名`。
   同一个 client id 同时填进后端 `GOOGLE_CLIENT_ID` 和前端 `VITE_GOOGLE_CLIENT_ID`。

## 2. 后端：一台 EC2

**选型**：`t4g.small`（ARM，2 vCPU / 2 GB，约 12 美元/月），Ubuntu 24.04 arm64，20 GB gp3。
Node 22 和 better-sqlite3 都有 ARM 预编译。1 GB 的 micro 能跑但 tsc 构建容易爆内存，不推荐。
Lightsail 2 GB 也行，下面的脚本一样用；区别只是没有实例角色，备份得另配密钥。

**安全组**：入站只开 22（限你的 IP）、80、443。3001 不开——后端只监听 127.0.0.1，外面经 Caddy 进来。

**Elastic IP**：分配一个绑到实例，Route 53 加 A 记录 `api.你的域名 → 这个 IP`。DNS 生效后 Caddy 才签得下证书。

**实例角色**（备份用）：建一个 IAM 角色挂 `aws/iam-ec2-backup-role-policy.json`（换 `BACKUP_BUCKET`），绑到实例。机器上不放密钥。

然后 ssh 上去：

```bash
curl -fsSL https://raw.githubusercontent.com/YaoAnthony/new-idle-game/main/deploy/scripts/server-setup.sh -o setup.sh
bash setup.sh
```

脚本装 Node 22、编译工具、Caddy、sqlite3、aws cli，建 `idlegame` 用户，clone 到 `/opt/new-idle-game`，
装 systemd 单元，把两份 env 模板放到 `/etc/idle-game/`。**不启动后端**。接着：

```bash
sudo nano /etc/idle-game/backend.env     # AUTH_JWT_SECRET（openssl rand -base64 48）、CORS_ORIGIN、GOOGLE_CLIENT_ID
sudo nano /etc/idle-game/aws.env         # BACKUP_BUCKET
sudo nano /etc/caddy/Caddyfile           # api.example.com → 你的域名
sudo systemctl reload caddy
sudo -u idlegame /opt/new-idle-game/deploy/scripts/deploy-backend.sh
sudo systemctl enable --now idle-game-backup.timer
curl https://api.你的域名/health          # {"ok":true,...}
```

后端生产变量的含义（读取点 `Backend/src/shared/config.ts`、`server.ts`、`app.ts`）：

| 变量 | 值 | 配错的表现 |
|---|---|---|
| `NODE_ENV` | `production` | 不设 = CORS 放行本机地址、密钥长度不检查 |
| `HOST` | `127.0.0.1` | 改成 0.0.0.0 会把 3001 直接暴露 |
| `AUTH_JWT_SECRET` | ≥ 32 字符 | 太短拒绝启动；泄露 = 任何人能伪造任意用户的 token |
| `CORS_ORIGIN` | `https://play.你的域名` | 逐字匹配；生产下不配 = 登录、云存档全部被浏览器预检拦死，联机反而正常（websocket 不走预检） |
| `TRUST_PROXY` | `1` | 不开 = 登录限流按 Caddy 的 IP 分桶，一个人狂点全服被锁 |
| `DB_PATH` | `/var/lib/idle-game/app.db` | 放部署目录里会被 `git clean` 类操作误伤 |

**以后发版**：push 到 main 之后 `sudo -u idlegame /opt/new-idle-game/deploy/scripts/deploy-backend.sh`。
重启会清空联机房间（设计上可接受，房主重开一局）。日志：`sudo journalctl -u idle-game-backend -f`。

## 3. 前端：S3 + CloudFront

1. **S3 桶**（us-east-1，名字随意，例如 `play-你的域名`），**关闭公开访问**——由 CloudFront 用 OAC 读。
2. **CloudFront 分发**：
   - 源：那个桶，Origin access = OAC（控制台会给你桶策略，贴进去）；
   - 默认根对象 `index.html`；
   - Viewer protocol：Redirect HTTP to HTTPS；压缩开；
   - 备用域名 `play.你的域名`，证书选第 1 步那张；
   - Error pages：按 `aws/cloudfront-spa-error-responses.json` 加 403 和 404 → `/index.html` 200（单页路由）；
   - 缓存策略用 `CachingOptimized`，脚本已经按文件类型写好 Cache-Control。
3. Route 53：`play.你的域名` → Alias 到这个分发。
4. 本机：

```bash
cp deploy/frontend.env.example Frontend-3D/.env.local   # 填 VITE_BACKEND_URL_CLOUD、VITE_GOOGLE_CLIENT_ID
cp deploy/aws.env.example deploy/aws.env                # 填桶名、分发 id、profile
deploy/scripts/deploy-frontend.sh cloud
```

首次会传 `public/music` 那 530 MB，之后 `s3 sync` 只传变化的。**前端必须在本机构建**：音乐不在 git 里，
曲库注册表是构建时扫目录生成的（`scripts/generate-music-registry.mjs`），别的机器构出来的曲库是空的。

## 4. 备份与恢复

- `idle-game-backup.timer` 每天 09:30 UTC（美东凌晨）用 sqlite3 `.backup` 做在线一致快照，gzip 传到
  `s3://BACKUP_BUCKET/sqlite/app-<时间>.db.gz`。桶上挂 `aws/s3-backup-lifecycle.json`，保留 30 天。
- 手动跑一次：`sudo -u idlegame /opt/new-idle-game/deploy/scripts/backup-db.sh`
- 恢复：`sudo /opt/new-idle-game/deploy/scripts/restore-db.sh s3://.../app-xxx.db.gz`（停服 → 当前库另存 → 替换 → 起服）。

## 5. 上线前的检查清单

- [ ] `https://api.你的域名/health` 回 `{"ok":true}`，证书有效
- [ ] 浏览器打开 `https://play.你的域名`，标题页能开、能进本地存档
- [ ] 注册 / 登录一个账号；云端存档槽能存能读（这一步走 REST + CORS）
- [ ] `/host` 拿到邀请码，另一台设备 `/join` 进得去（这一步走 websocket）
- [ ] Google 登录（如果配了）
- [ ] `sudo systemctl list-timers | grep idle-game` 看到备份定时；手动跑一次备份，S3 里有文件
- [ ] 后端 `journalctl` 里没有 `缺少环境变量` 或 CORS 拒绝

## 6. 费用估算（月）

| 项 | 约 |
|---|---|
| EC2 t4g.small + 20 GB gp3 + Elastic IP | 14 美元 |
| S3 存储（1 GB 以内） | 不到 1 美元 |
| CloudFront 流量 | 每 100 位听完全部音乐的玩家约 5 美元；前 1 TB/月有免费额度 |
| Route 53 托管区 | 0.5 美元 |
