# 联机协议（M1 版）

对应 `old/版本期望/V0.9 - 联机功能.md` 的 3D 修订。消息形状的**唯一真相源是
`Core/src/types/net.ts`**——本文描述语义和生命周期，形状以代码为准，两边同步改。

- 传输：socket.io（默认命名空间）。事件名取 `NET_EVENTS` 常量。
- 需要应答的请求走 socket.io ack，服务端统一回 `XxxOk | NetError`。
- 服务端在 `Backend/src/multiplayer/`，只 import Core，不含渲染与 React。

## 版本协商

握手（create / join）同时带两个版本号，都不匹配就拒绝（`version_mismatch`）：

| 字段 | 含义 | 不匹配时 |
|---|---|---|
| `protocolVersion` | 协议版本（`NET_PROTOCOL_VERSION`） | 必须等于服务端的值 |
| `saveSchemaVersion` | 存档结构版本 | 必须等于**房主建房时报的值**；服务端自己不做迁移 |

服务端对存档版本只要求"同房相等"：迁移知识在客户端（读档时已迁到最新），
服务端搬一份迁移链只会造成两处漂移。客户端更新后版本抬高，旧客户端进不来，
提示升级——和联机游戏的通行做法一致。

## 权威模型

- 会话期间，服务端持有房主上传的 `WorldSave` 作为**会话世界**；`revision` 从 0 起。
- 房客的 `ownWorld` 在整个会话期间**不被读写**。房客本地暂停世界侧存档，
  玩家侧（背包、需求）照常存自己的。
- 玩家 id 由服务端分配（hex，保证不含 `:` `#`），客户端拿到后调
  `setIdIssuer(playerId)`——此后它发的对象 id 天然带自己的前缀，
  和房里任何人都不撞（见 `Frontend-3D/src/Game/State/ids.ts`）。

### 两类流量（协议 v2）

| 类 | 事件 | 投递 | 改 WorldSave？ |
|---|---|---|---|
| 瞬态 | `sync:transform` | volatile，≈12Hz，仅变化时发 | 否（服务端记"每人最后一帧"给晚加入者） |
| 瞬态 | `sync:appearance` / `sync:gesture` / `chat:*` | 可靠 | 否 |
| 世界操作 | `world:op`（**任何参与者**可发） | 可靠，发生即发 | 否（服务端只转发；收敛交给刷新） |
| 整片刷新 | `world:refresh`（仅房主可发） | 可靠，前沿立发 + 250ms 合并 | 是：服务端以切片覆盖会话世界，revision+1，广播 |

**op 管即时，refresh 管收敛。** 每次世界突变（扔/捡东西、摆/收家具、
厨房槽位、储物箱、每日任务打勾/领奖）在发生的那一刻以 `world:op` 广播，
房里其他人立即重放同一个动作——扔出去的东西各端本地跑同一条抛物线。
op 是尽力而为（服务端不逐条校验游戏规则），乱序、丢失由房主随后的
整片刷新拉平。

**每日任务的两种 op 有个额外约定**（协议 v3）：发的是**打勾后的绝对
进度**而不是 `+1`，且带 `worldDayId`。理由是这条通道不保证不重复、
不保证有序——增量在这种通道上必然算歪，而跨天边界上的迟到包会把
新一天的进度顶成 1。接收端取 max、只认今天的包（`applyRemoteProgress`）。

进度存 `WorldSave.dailyBoard`（世界顶层，不属于任何一台机器），所以
两种 op 都不带 `instanceId`。任务池是**个人**的（`PlayerSave.dailyTasks`），
永远不上网——房客在别人家看到的还是自己的待办。

**唱片机（协议 v4）**：`gramophone_record_set` 广播"这台机器现在装着
哪张唱片"（幂等，同张跳过）；旧唱片弹出走现成的 `item_thrown`。装着哪张
唱片是世界状态（`WorldSave.gramophones`，刷新新增 `gramophones` 切片），
但**播放模式/音量是个人的**（localStorage，不上网）——音乐各端各放，
共享的只有"物理上装着哪张"。

**浴缸（协议 v5）**：`bath_water_set` 广播水位的**转折点**（开始注水 / 满 /
开始放水 / 空），带绝对 `level` + `flow`；中间的涨落各端按同一速率自己推进，
不逐帧发。幂等：同值再设跳过。

**权限（2026-08-04 定）：所有参与者默认满权限**——房客可以扔、捡、
摆家具、用厨房、开储物箱。分级权限（例如"访客不能拆家"）是后续版本，
客户端的守卫机制（worldLock）保留为那时的挂点。已知取舍：两人同一瞬间
抢同一件东西可能各拿到一份，服务端仲裁在 M2 的 ack 模型里解决。

## 生命周期

```
建房   host  → session:create {versions, profile, world}
       server← ack {sessionId, joinCode, playerId, revision:0}
加入   guest → session:join {versions, joinCode, profile}
       server← ack {playerId, hostPlayerId, world, participants, revision}
       房内广播 participant:joined
游玩   各端互发瞬态；房主变世界 → world:refresh → 广播
离开   guest → session:leave → 广播 participant:left
结束   host 断开或 leave → 广播 session:ended {reason:"host_left"}，会话销毁
```

- 房主结束时服务端把最终 `WorldSave` + revision 回给房主写回 `ownWorld`
  （M1 里刷新流本来就以房主为源，写回是恒等操作；M2 起有意义）。
- 断线宽限（房主 60s 重连）是 M4：M1 房主断开即结束。
- 加入时服务端下发每人的 `WireParticipant`（侧写 + 最后 transform/appearance），
  晚加入者第一帧就能把人摆对，不用等下一轮同步。

## 客户端纪律（房客）

1. 入房前把自己的 `GameSave` 快照留在内存；退出（或被 `session:ended`）时
   合成"自家世界 + 现在的玩家数据"灌回运行时。
2. 会话期间装上**存档合成器**（`setSaveComposer`，单一闸口）：落盘时
   玩家侧取运行时现状（做客捡到的东西实时入档），世界侧永远用入房前的快照
   ——房主的世界进不了房客的档。第一版是"全程挂起写盘"，代价是做客期间
   捡的东西一崩就丢，两头都吃亏。
3. 会话期间抑制世界侧的**自治**系统：天气重掷、剧情规则。那是房主的权威，
   不是权限限制。时钟照跑（纯 UTC 推导），自己的饱食/精力照常。
   每日任务的个人清单也照常——它跟着玩家走，不属于任何世界。
4. 宠物在房客端按快照本地模拟，位置可能和房主端漂移——M1 已知妥协，
   M3 由房主广播宠物 transform 修正。

## 限制与安全（服务端强制）

- 上限见 `NET_LIMITS`：5 人/房、世界 ≤3MB、聊天 ≤200 字、名字 ≤24 字。
- 所有入站载荷做结构校验，非法直接 `bad_request`，不崩房。
- `world:refresh` 只接受房主 socket 发的；聊天/瞬态事件的 `playerId`
  一律以服务端连接表为准，**不信任载荷里自称的身份**。
- 不记录聊天内容与完整世界数据到日志（Backend AGENTS.md）。
- 会话 token、频控、公网 TLS 是 M5。

## 验收清单（Backend/tests/multiplayer.test.ts）

- [ ] 版本不匹配拒绝（协议 / 存档各测一路）
- [ ] 建房得到可用邀请码；错码 `not_found`；第 6 人 `session_full`
- [ ] 超限世界 `payload_too_large`；超长聊天被拒
- [ ] A 的 transform 到达 B，带服务端认定的 playerId
- [ ] 晚加入者快照含先到者的最后位置
- [ ] 房主 `world:refresh` 后：房内广播 + 之后加入者拿到新世界
- [ ] 房客断开 → `participant:left`；房主断开 → `session:ended` 且会话销毁
- [ ] `world:op` 双向转发，身份由服务端认定；未知 kind / 超大载荷静默丢弃
- [ ] 每日任务两种 op（`daily_board_ticked` / `daily_board_claimed`）在白名单内
- [ ] 换唱片 op（`gramophone_record_set`）在白名单内；`gramophones` 刷新切片被接受
- [ ] 浴缸水位 op（`bath_water_set`）在白名单内

## 活物同步（协议 v8，居民系统 01c）

房主权威，房客是木偶。三条通道：

| 通道 | 方向 | 内容 |
|---|---|---|
| `world:op` 里的 `resident_intent` | 房主 → 全房 | 某只活物换上了新 Intent（动词序列 + 解析好的目标）。房客用同一套动词自己走 |
| `sync:residents` | 房主 → 全房（volatile，2 Hz，只发有变化的） | 关键帧：位置 / 朝向 / 正在做的动词 / 隐身。房客偏差 < 0.6 m 忽略、0.6~3 m 插值、> 3 m 直接放 |
| `world:refresh` 的 `pets` 切片 | 房主 → 全房 | 生灭与对账：多的造木偶、少的移除、位置差太多放回去 |

房客发 `sync:residents` 或 `resident_intent` 是坏客户端，服务端丢弃。形状的真相在 `Core/src/types/net.ts` 与 `types/residents.ts`。
