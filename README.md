# new-idle-game

一个温暖的 3D 生活 / 挂机游戏。**核心循环是"现实里真的做完一件事 → 游戏里换来资源 → 把小屋布置起来 → 被住在这儿的小生物陪着"**——行动按绝对时间结算，关掉游戏也在走。

它首先是个专注陪伴工具，其次才是游戏。这条定位在代码里是**有牙齿的**，不是宣传语：

- 离线补算封顶 12 小时（出差一周回来不该看到一个饿晕的角色）
- 过期食物只降品质不删除（让攒的东西凭空消失会制造焦虑）
- 烹饪的"上乘"窗口给到 45%（不做功亏一篑的判定）

> **叙事正在重构中**（2026-08-13）。旧的"租到出租屋"那条线已整套删除，新设定是「魔女在深山收你这个学徒」。剧情注册表现在是空壳，机制完好。详见文末「当前进行中」。

---

## 仓库地图

| 目录 | 状态 | 是什么 |
|---|---|---|
| **`Frontend-3D/`** | **活跃，主客户端** | React + Vite 外壳，**自研 three.js 3D 场景**（不是 Phaser，不是引擎） |
| **`Core/`** | **活跃** | 前后端共享的 TS 契约：类型 + 纯规则 + 内容注册表。零运行时依赖 |
| **`Backend/`** | **活跃：联机 + 账户 + 云存档** | Express + socket.io 会话；`/api/auth`（邮箱密码 + Google，JWT）、`/api/saves`（云存档，SQLite）。commerce/llm/rooms 仍是 `.gitkeep` 空壳 |
| `contracts/` | 活跃 | 人读的协议说明：联机（`multiplayer_protocol.md`）+ 账户与云存档（`account_protocol.md`）。形状的真相在 `Core/src/types/{net,account}.ts` |
| **`old/`** | **全是历史，不要改** | 见下 |
| `production/` `prompt/` | 杂物 | 工具生成的状态文件、提示词草稿 |

**活的只有三个包**：`Frontend-3D`、`Core`、`Backend`。除此之外根目录下没有任何在跑的代码。

### ⚠️ `old/` 里有什么

| | |
|---|---|
| `old/版本期望/` | 18 篇按版本写的设计草案，**不是当前真相**，见下 |
| `old/Frontend/` `old/Oldfrontend/` | 早期 Phaser 客户端，458 个 TS 文件 |
| `old/godot/` | 已退役的 Godot 客户端（目录已空） |
| `old/TileMap/` | 早期地图工具 |

`old/` 整个目录**只作考古用**。里面的代码不构建、不测试、不参与任何依赖；里面的文档记录的是当时怎么想的，不是现在是什么样。

`old/版本期望/` 那 18 篇是**按版本写的路线图**（V0.5 天气系统、V0.9 联机功能…），不是按系统写的当前真相。**其中相当一部分已经过期**——尤其 `整体架构.md` 的「第一天流程」和「事件解锁功能」两节，描述的是已经删掉的租房剧情。

把它们当**设计意图的档案**读，不要当实现规格读。要知道系统现在是什么样，读代码——这个项目的代码注释密度很高，每个非显然的决定都写了为什么以及否掉了什么备选。

---

## 依赖形状

```
Core（纯 TS，零运行时依赖，strict）
 ├── Frontend-3D  ← vite alias 直指 ../Core/src/index.ts
 └── Backend      ← tsconfig paths 直指 ../Core/src/index.ts
```

**开发期两边都读源码，改完 Core 立刻生效，没有任何构建步骤。** 前端靠 vite alias，后端靠 tsconfig `paths`（`tsx` 和 `tsc` 都认）。

只有一处例外，而且只在**部署**时发生：`Backend` 的 `npm run build` 用另一份 `tsconfig.build.json`（不带 paths），产出的 `dist/*.js` 里仍然是 `from "core"`，运行时由 node 解析到 `Core/dist`——所以 `prebuild` 会先把 Core 编出来。日常开发碰不到这条路。

> 这个安排是 2026-08-13 统一的。之前后端走 node 解析吃 `Core/dist`，两个真实代价：Core 没 build 过时报 `Cannot find module 'core'`；**build 过期时更糟**——`typecheck` 拿着旧的 `.d.ts` 一路绿灯，骗你说类型没问题。

`Core` 不得依赖 three.js、React、Express。three.js / React / Canvas / 音频播放 / 资源加载全部属于 `Frontend-3D`。

---

## 客户端分层

```
Game/          状态与系统——碰不到 three.js
   ↕
EventBus       约 60 个带类型的事件
   ↕
Game3D/  +  Components/     渲染      React UI
```

纪律写在 [`Game/EventBus.ts`](Frontend-3D/src/Game/EventBus.ts) 的文件头：**渲染层只能通过事件影响游戏状态，不能直接改存档数据。**

启动链：

```
main.tsx        DEV 下跑三个注册表体检（剧情 / 捏人 / 门）
  → App.tsx     title → creator → loading → playing
                 加载在 hydrate 之后——先知道是哪个世界，才知道预热什么
  → Game3D/index.tsx   常驻系统的生命周期 + 二十来个调试命令
  → RoomScene.ts       2100 行，场景总装
```

主要子目录：

- `Game/State/` — 背包、掉落物、宠物、门、储物、唱片机、时钟、天气、`world/`（地图与家具）
- `Game/Systems/` — 厨房、行动、导航、自动寻路、换图、剧情、对话、制作、每日任务
- `Game/Multiplayer/` — 会话状态机、名册插值、同步泵、op 重放（**不碰 socket**）
- `Api/game/websocket/` — **和 server 说话的唯一出口**：连接、三条 ack 请求、六种出站、九种入站订阅
- `Game3D/Engine/` — 渲染器、相机、光照、后期、音频、音景、BGM
- `Game3D/World/` — 场景、房屋、家具、角色、宠物、远端玩家
- `Game3D/Visual/recipes/` — **程序化建模**，没有外部 3D 资源
- `Maps/` — **一张箱庭一个文件夹**（`base` 据点 / `town` 小镇 / 六家店铺内部）

---

## 几条贯穿全局的规矩

**世界的东西归世界，人的东西跟着人走。**
`WorldSave` 装家具、宠物、房间几何、门、地上的东西、储物箱、每日进度；`PlayerSave` 装背包、饥饿疲劳、已学配方、位置、坐姿、正在进行的行动。联机做客时你带着自己那半进别人的世界。

**内容零硬编码。**
物品、配方、宠物、对话、剧情、天气、门、行动、战利品全部是 `Core/src/Data/` 里的注册表数据。gameplay 代码里不许出现内容分支、平衡数值、用户可见文案、按键字面量、Service URL、存档版本号。

**一张箱庭一个文件夹。**
`Maps/<id>/` 里自带户型、外景、出入口。加一张图 = 新建兄弟文件夹 + 在 `Maps/index.ts` 登记一行。地图定义**刻意住在 Frontend 而不是 Core**——一张图必须连外景才完整，而外景是 three.js 代码。

**承托面模型。**
"脚下踩的是什么"只有一个答案来源（`Core/src/logic/groundMap.ts`）。地形网格和碰撞读同一份数据。**悬崖不用声明**——地形只要比可走坡度陡，寻路和迈步自己就会说不。

---

## 存档

`SAVE_SCHEMA_VERSION = 25`，24 条迁移链（v2 → v25）。IndexedDB，主档 / 备份 / 冲突三键，**双份轮写**：写主档前先把当前主档复制到备份，读不出来自动回退（回退必须告诉玩家）。

改 `GameSave` 的形状就要问一次"需要迁移吗"，并且 `SAVE_SCHEMA_VERSION` **必须等于迁移链里最大的 `to`**——小于它会导致每次读档都把最后几条迁移重跑一遍。

---

## 联机

协议 v4，socket.io，形状的唯一真相源是 `Core/src/types/net.ts`（客户端和服务端 import 同一个文件）。

**服务端是保管员不是裁判**：只做结构与字节封顶的校验，身份一律查连接表（载荷里自称的 playerId 直接无视），游戏规则不校验。两类流量——`world:op` 管即时（谁做了什么立刻广播），`world:refresh` 管收敛（房主定期整片刷新）。

**网络边界**：`socket.emit` / `socket.on` / `NET_EVENTS` 只允许出现在 `src/Api/` 里。`Game/Multiplayer/` 只调 `Api/game/websocket` 导出的类型化函数，拿不到 socket 实例，也不知道事件名和协议版本长什么样。这条界由 [`tests/netBoundary.test.ts`](Frontend-3D/tests/netBoundary.test.ts) 守着——写在文档里的约定只有人记得时才有效，写成测试才是真的。

**房客的存档纪律**是整个联机里最容易出事的一段：入房前抓一份自家世界的快照 → 装存档合成器（玩家侧照抄运行时、世界侧永远用快照）→ 退出时合成回去。顺序错一步，要么丢做客期间的收获，要么把别人家写进自己档。见 [`Game/Multiplayer/session.ts`](Frontend-3D/src/Game/Multiplayer/session.ts)。

---

## 跑起来

```bash
cd Frontend-3D && npm install && npm run dev
```

联机要另起后端：

```bash
cd Backend && npm install && npm run dev
```

## 测试

625 个用例，全绿。

```bash
cd Core && npm test && cd ../Backend && npm test && cd ../Frontend-3D && npm test
```

| 包 | 用例 | 运行器 |
|---|---|---|
| Core | 273 | `tsx --test`（node:test） |
| Backend | 91 | 同上（含真 socket.io 端到端） |
| Frontend-3D | 261 | vitest + jsdom + fake-indexeddb |

三个包都另有 `typecheck:tests`——各自的 `tsc` include 只覆盖 `src`，不单独跑这个的话测试里的类型错误会整个漏过去。

---

## 当前进行中

**剧情重构**（2026-08-13 起）。旧的租房主线整套删除：10 条规则、6 段对话共 56 个节点、6 个事件、6 步教程、83 条文案。新设定是「魔女在深山收你这个学徒」，参照《魔女之旅》的口味。

已定的：修行 = 四维修为（术式 / 脚力 / 调合 / 魔力），从行动系统按**时长**累加、**只增不减**；数值不做效率加成，只用来推剧情和决定出师时师父给的二つ名；魔女间歇登场，不做常驻 NPC。

写剧情只碰四个文件：`Core/src/Data/{story,dialogues,events}/index.ts` + `Frontend-3D/src/i18n/t.ts`。

**已知未修**：
- `Systems/dialogue.ts` 的 `event_completed` 条件实为"触发过"而非"完成了"
- 对话条件 `feature_unlocked` 和 `weather_is` 恒返回 false
- `logic/storyAudit.ts` 不检查 `eventDefinitions` 自己的文案键
- `Backend` 的 `applyRefresh` 漏了 `gramophones` 切片（测试里标了 todo）
