# 账户与云存档协议（v1）

消息形状的**唯一真相源是 `Core/src/types/account.ts`**——本文描述语义和生命周期，
形状以代码为准，两边同步改。

- 传输：REST（Express，`/api/auth/*`、`/api/saves/*`），JSON 请求/响应。
- 鉴权：`Authorization: Bearer <JWT>`。JWT 由服务端签发（payload 只有 `{userId}`），
  30 天有效期，前端存 localStorage。Bearer 头天然免 CSRF。
  v1 **不做** refresh / 撤销：过期重新登录；登出只是前端忘掉 token。
- 响应统一 `XxxOk | AccountError`（判别式 `ok` 字段），错误码见
  `AccountErrorCode`，HTTP 状态码与错误码一一对应（400/401/409/413/422/429/503）。
- 限流：register/login/google 按 IP 10 次/分钟；PUT saves 按用户 12 次/分钟，
  GET saves 按用户 20 次/分钟。PUT 的额度对着客户端的节流定：正常游玩
  120 秒一次，剧情节点那条捷径也压着 15 秒下限（`EXPEDITED_PUSH_MS`），
  一分钟顶多 4 次，剩下的留给重试和多标签页——闸门挡的是失控客户端，不是玩家。
  按 IP 分桶的那两条在反向代理后面需要设 `TRUST_PROXY`，否则全服共用一个桶。
- 服务端不 log token、不 log 存档内容。

## 权威模型

**本地 IndexedDB 是运行时唯一读写的存档；云端是受控副本**，只在三个时机被触碰：

| 时机 | 动作 |
|---|---|
| 进（启动对账） | `GET head` → 决策表六选一（见下） |
| 中（节流推送） | 本地写盘成功 → 标 dirty → 最多 120s 推一次；剧情节点立即推 |
| 出（退出冲刷） | visibility hidden 时普通推；pagehide 且 ≤60KB 走 keepalive |

服务端对存档是**保管员不是裁判**（同联机哲学）：只做字节封顶（4MB）+
顶层结构探测（`meta.saveSchemaVersion` 为正整数且与请求顶层字段相等），
不逐字段校验，不做迁移——迁移知识全在客户端（`migrateSave`）。

## 端点

| 端点 | 请求 | 成功 | 失败 |
|---|---|---|---|
| `POST /api/auth/register` | `RegisterRequest` | 201 `AuthOk` | 400；409 `email_taken` / `email_uses_google`；429 |
| `POST /api/auth/login` | `LoginRequest` | 200 `AuthOk` | 400；401 `invalid_credentials`；429 |
| `POST /api/auth/google` | `GoogleLoginRequest` | 200 `AuthOk` | 401 `invalid_google_token`；503 `not_configured`；429 |
| `GET /api/auth/me` | Bearer | 200 `MeOk` | 401 |
| `GET /api/saves/me/head` | Bearer | 200 `SaveHeadOk`（无档 `head:null`） | 401 |
| `GET /api/saves/me` | Bearer | 200 `SaveGetOk` | 401；404 `no_save` |
| `PUT /api/saves/me` | Bearer + `SavePutRequest` | 200 `SavePutOk` | 401；409 `SavePutConflict`；413；422；429 |

## 账号语义

- email 一律小写归一后存储与比对；UNIQUE。
- 注册：email 已被密码账号占用 → `email_taken`；已被 google-only 账号占用 →
  `email_uses_google`（**不许密码接管 Google 账号**——攻击者可能拿别人的邮箱注册）。
- 登录：不存在 / 密码错 / google-only 账号，一律 `invalid_credentials`
  恒定时序（不存在时也跑一次假哈希 compare），不泄露账号存在性。
- Google 登录（`verifyIdToken`，aud 必须等于服务端的 GOOGLE_CLIENT_ID，
  且 `email_verified === true`）：
  1. `google_sub` 命中 → 登录；
  2. 未命中但 email 命中已有**密码**账号 → 把 sub 链接到该行
     （Google 已证明邮箱所有权，安全；与注册侧的不对称是故意的）；
  3. 都未命中 → 建新账号（`password_hash` 为 null）。
- 密码 bcrypt cost 12；长度 8–72（bcrypt 硬上限）。

**已知风险（v1 接受）**：不做邮箱验证 / 忘记密码——密码丢了只能靠
同邮箱 Google 登录找回；两边都丢就是丢了。

## 云存档并发（revision 乐观锁 + writeId 幂等）

服务端每用户一行 `cloud_saves`，`revision` 从 1 起自增。PUT 在单事务内判定：

1. `writeId === last_write_id` → 幂等命中（上次写成功但响应丢了的重试），
   直接返回当前 revision，成功，不重复写。
2. 云端无档：仅接受 `baseRevision === 0`，写入后 revision=1。
3. 云端有档：`baseRevision === 当前 revision` → 当前 payload 挪进
   `prev_payload`/`prev_revision`（一份轮转备份，防这次写坏）→ 写入，revision+1。
4. `baseRevision === -1`（`FORCE_OVERWRITE_REVISION`）：**强制覆盖**——
   只有冲突框里玩家手点"用本机"才发；同样先挪 prev_*。
5. 其余 → 409 `SavePutConflict`（带云端现状），一个字节不写。

客户端持久化 `lastSyncedRevision`（IndexedDB，不进 GameSave）作为三方基准，
借此区分 fast-forward（云端领先且本地没动过 → 静默下载）与真分叉（两边都动过
→ 弹冲突框）。

### 认领"自己那一版"（响应丢了的写）

推送**成功了但响应没回来**——关标签页、pagehide 的 keepalive、网络抖动——
是常态而不是意外：云端 revision 涨了，本地基准还停在旧值。光比 revision 的话，
下次启动会把自己那一版当成"另一台设备改的"，给单机玩家弹一个本机跟本机
二选一的荒唐弹框。

所以 `SaveHead` 带 `lastWriteId`，客户端也持久化 `pendingWriteId`
（**发送前**落盘——落在发送之后就等于没落，收不到响应的那些情况根本
走不到那行代码）。启动时两条认领依据，从强到弱：

1. `head.lastWriteId === syncState.pendingWriteId` → 确凿就是那一次推送；
2. `head.deviceId === syncState.deviceId` → writeId 已轮换（推完又玩了一会儿），
   但写云端的还是这台机器。同机没有"别人的进度"要保。

认领后**把基准挪到 `head.revision`**（不挪的话下一次推送必然拿着过期基准撞
409），本地照玩，dirty 就补推一次。deviceId 也不同的才是真分叉，照旧弹框。

## 启动对账决策表（客户端 `decideEntry`）

| 条件 | 动作 |
|---|---|
| 云空 + 本地空 | fresh（新玩家） |
| 云空 + 本地有 | upload_then_local（首登绑定上云） |
| 云 saveSchemaVersion > 客户端 | local_readonly_sync_off（旧客户端照玩本地，本会话禁推 + 提示更新） |
| 云 revision == lastSynced | local（本地等于/领先；dirty 则入场立即推） |
| 云 revision > lastSynced 且 writeId/deviceId 认得出是本机写的 | local + adoptRevision（认领自己那一版，见上节） |
| 云 revision > lastSynced 且 !dirty | fast_forward（静默下载写本地主档；旧主档被本地双份轮写保底） |
| 云 revision > lastSynced 且 dirty | conflict（弹框二选一） |
| syncState.userId ≠ 当前 userId | conflict（换账号一律弹框） |

冲突二选一：**用云端** → 本地主档转存 `world.conflict` 键（后悔药）→ 云档写主档
→ 重新读档；**用本机** → `baseRevision: -1` 强制覆盖云端。两条路都收敛到
`lastSyncedRevision = 云端当前值`、dirty 清空。

联机互斥：hosting/guest 期间挂起推送与对账（存档合成见联机契约），回 idle 恢复。

## 手工端到端验收

双浏览器 profile 模拟双设备：
1. A 注册 → 玩一会 → B 登录 → 应 fast_forward 看到 A 的进度。
2. A、B 各自离线改 → 后上线的一方应见冲突框；两条出路各验一次，
   "用云端"后 `world.conflict` 键应有覆盖前的本地档。
3. 拔掉后端 → 游客与已登录都能纯本地照玩；恢复后端 → 下次启动补推 dirty。
4. 注册 → 登出 → 登录 → 刷新页面：登录态（persist）与存档均在。
