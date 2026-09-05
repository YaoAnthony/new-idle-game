# 00 · 改名：Pet 系统 → Resident 系统

> 状态：**清单，待执行** · 2026-09-05
>
> 目标：把「一只活物」这一层的统称从 Pet 换成 Resident（用户定）。**零行为变化**，
> 单独一个提交，全量测试前后对照。为后面往这一层加作息、场所、委托腾地方。

## 命名约定

| 现在 | 改成 | 说明 |
|---|---|---|
| `PetAgent` | `ResidentAgent` | 那个 1268 行的类 |
| `PetDefinition` / `PetDefinitionId` | `ResidentDefinition` / `ResidentDefinitionId` | 注册表条目 |
| `PetSave` | `ResidentSave` | 存档形状（**字段名不改**，见下） |
| `PetId` | `ResidentId` | 实例 id 类型 |
| `PetBehavior` / `PetActivity` / `PetState` / `PetRuntime` | `ResidentBehavior` / `ResidentActivity` … | 后两个是旧别名，顺手删 |
| `PetTaste` / `petTastes` / `findPetTaste` | `ResidentTaste` … | 口味表 |
| `petDefinitions` / `findPetDefinition` | `residentDefinitions` / `findResidentDefinition` | |
| `getPet` / `getPets` / `spawnPet` / `spawnPetAt` / `removePet` / `tickPets` / `snapshotPets` / `restorePets` / `feedPet` / `setPetAffection` / `markPetGifted` | `getResident` / `getResidents` / `spawnResident` … | petsRuntime 的整套 API |
| `petId`（参数名、字段名，整词 176 处） | `residentId` | 量最大的一项，分布见文末附表；其中剧情效果字段名和 `PetSave.petId` 两类要单独看 |
| `pet_changed` / `pet_gesture` / `pet_spawned` / `pet_entered` / `pet_wake` / `pet_sleep` | `resident_*` | EventBus 事件名 + 剧情信号名 + 剧情效果 kind。**剧情信号名进了 storyRules 数据**，Core 的 Data/story 要同步改 |
| `dialoguePet` / `dialoguePetId` / `cutscenePetId` / `frozenPetId` | `dialogueResident` … | 局部变量 |
| 实例 id `pet-slime` / `pet-fox` / `pet-spirit` / `pet-otter` / `pet-dragon`，以及 `` `pet-${definitionId}` `` 这个拼法 | `resident-slime` … / `` `resident-${definitionId}` `` | 用户定 2026-09-05。**进了存档，要迁移**，见下面「实例 id 迁移」——这是本任务里唯一要碰存档的部分，按规矩单独成提交 |
| `/pet <物种id>` 调试指令 | `/spawn <物种id>` | 用户定 2026-09-05。它召的本来就不只宠物（石傀儡、水獭都能召） |
| `CreatureRole.Pet` | **不改** | 「宠物」是四种身份之一，这里它是对的 |
| `CreatureRole`、`placeCreatureAt`、`seedInitialCreatures`、`creatureBlockedAt` 等 | **不改** | 已经是中性词，不在 Pet 这个统称下 |

### 文件与目录

| 现在 | 改成 |
|---|---|
| `Core/src/types/pets.ts` | `Core/src/types/residents.ts` |
| `Core/src/Data/pets/index.ts` | `Core/src/Data/residents/index.ts` |
| `Frontend-3D/src/Game/State/petAgent.ts` | `Frontend-3D/src/Game/State/residentAgent.ts` |
| `Frontend-3D/src/Game/State/petsRuntime.ts` | `Frontend-3D/src/Game/State/residentsRuntime.ts` |
| `Frontend-3D/src/Game3D/World/PetView.ts` | `Frontend-3D/src/Game3D/World/ResidentView.ts` |
| `Frontend-3D/src/i18n/petName.ts` | `Frontend-3D/src/i18n/residentName.ts` |
| `Frontend-3D/src/Game/Systems/residents.ts` | `Frontend-3D/src/Game/Systems/residents/moveIn.ts`（用户定 2026-09-05：收进 `Systems/residents/` 目录，和 `residentsRuntime.ts` 不再撞名） |
| `Frontend-3D/src/Game/Systems/residentCommands.ts` | `Frontend-3D/src/Game/Systems/residents/commands.ts`（同上，居民相关的系统都住这个目录） |

### 刻意不改的（durable strings）

改这些要动存档版本、迁移、Backend 白名单、`net.ts`，不属于改名任务：

| 东西 | 位置 | 为什么不改 |
|---|---|---|
| `WorldSave.pets` 字段 | `Core/src/types/world.ts:186`、migrations.ts 7 处、entities.ts、Backend 3 个测试 fixture | 进了每一份存档和联机快照，改它牵动 Backend 白名单和 `net.ts`。**这次不改**；如果要改，并进上面那个迁移提交 |
| 文案键 `pet.*` 23 条 | `i18n/t.ts` | 数据不是代码 |
| `pet_promise` / `pet_missing` / `pet_arrival` | 旧剧情注释里的残留 | 早已删除的内容，注释顺手清 |

## 实例 id 迁移（单独一个提交）

`pet-*` 出现在三种地方，前两种是代码改字面量，第三种要迁移：

| 在哪 | 怎么改 |
|---|---|
| **代码里的字面量与拼法**：`Data/story/index.ts`（11 处 `petId: "pet-slime"` 这类）、`Systems/trading.ts` 的 `OTTER_PET_ID` / `FISH_PET_ID` / `DRAGON_PET_ID`、`Systems/residents.ts` 的 `residentPetId()`、`petsRuntime.ts` 与 `Game3D/index.tsx` 的 `` `pet-${definitionId}` ``、`Core/types/pets.ts` 注释 | 全部换成 `resident-`。拼法**只留一处**：`residentIdOf(definitionId)` 放 Core（剧情数据和运行时都从它拿），别再各写一遍模板串 |
| **`NewspaperPanel.tsx` 从 id 反推文案键**：`who.replace("pet-", "")` 再拼 `pet.<x>_neighbor` | 这是靶子写错了地方的活证据——id 不该能反推出文案。改成从 `residentDefinitions` 按 id 查 `localizationKey`。顺带迁移老事实（见下） |
| **存档**：`WorldSave.pets` 的键和每条 `PetSave.petId`；`WorldSave.dayFacts` 里 `shop_sold` 的 subject `"furniture_chair|pet-fox"`；`PlayerSave` / 剧情进度里若有引用 petId 的字段（`signalCounts` 的键 `pet_spawned|pet-slime`、`firedRules` 不含 id、`dialogue` 无） | 迁移 vN+1：三处字符串 `pet-` 前缀 → `resident-`。`signalCounts` 的键同时要把信号名 `pet_spawned` 换成 `resident_spawned`（改名任务已经把信号名改了，键里的旧名一起迁） |

迁移的验收：拿一份改名前的真档（先备份，见 [[verify-in-dedicated-page]] 那条规矩）读入，`/npc list` 三位在场、报纸旧一期里"阿茜买走了椅子"仍显示名字而不是空、`/story` 里 `resident_spawned|resident-slime` 计数和迁移前 `pet_spawned|pet-slime` 一致。

`recipes/creatures.ts` 里的 `group("pet-moss-wisp")` 是 three.js 节点名，不是实例 id，跟着改成 `resident-` 保持一致即可，不进存档。

## 要改的文件（按层）

计数是"沾到 Pet 命名的行数"，不是要改的行数——含注释。

### Core

| 文件 | 行 | 改什么 |
|---|---|---|
| `src/types/pets.ts` → `residents.ts` | 17 | 全部类型名；文件头注释 |
| `src/Data/pets/index.ts` → `residents/index.ts` | 37 | 注册表名、查找函数、口味表 |
| `src/index.ts` | 1 | `export * from "./types/residents.js"` |
| `src/Data/index.ts` | 1 | `export * from "./residents/index.js"` |
| `src/types/world.ts` | 2 | import `ResidentSave`（字段名 `pets` 不动） |
| `src/types/story.ts` | 9 | 信号种类 `pet_spawned` / `pet_entered` → `resident_*`；效果 `spawn_pet` / `pet_wake` / `pet_sleep` → `spawn_resident` / `resident_wake` / `resident_sleep`；`petId` 字段 |
| `src/types/dialogue.ts` | 3 | `petId` 字段、`PetId` 类型 |
| `src/types/doors.ts` / `roomStyle.ts` | 2+2 | 注释或类型引用 |
| `src/Data/story/index.ts` | 13 | 效果 kind 和 `petId:` 字段名（值 `pet-slime` 不动） |
| `src/Data/dialogues/index.ts` | 13 | `speaker: "npc"` 不动；`petId` 引用 |
| `src/Data/events/index.ts` | 2 | 注释 |
| `src/Data/items/index.ts` / `dailyTasks/index.ts` | 1+1 | 注释 |
| `src/logic/giftRules.ts` | 3 | `PetTaste` |
| `src/logic/storyAudit.ts` | 1 | 效果 kind 字面量 |
| `tests/content.test.ts` | 25 | import 路径、`petDefinitions` |
| `tests/giftRules.test.ts` | 2 | |
| `tests/newspaper.test.ts` | 1 | |

### Frontend-3D · 运行时

| 文件 | 行 | 改什么 |
|---|---|---|
| `Game/State/petsRuntime.ts` → `residentsRuntime.ts` | 92 | 整套 API 名、`pets` Map 变量名、事件名 |
| `Game/State/petAgent.ts` → `residentAgent.ts` | 45 | 类名、`PetActivity`、文件头 |
| `Game/State/world/entities.ts` | 17 | import、`pets` 字段（存档形状，**不改**）、局部变量 |
| `Game/State/world/walkable.ts` / `state.ts` | 3+2 | 注释、import |
| `Game/State/doorsRuntime.ts` | 6 | `petId` |
| `Game/EventBus.ts` | 4 | `pet_changed` / `pet_gesture`；`interact_target_changed` 的 `kind: "pet"` → `"resident"` |
| `Game/Systems/dialogue.ts` | 15 | `petId`、`getPet`、`dialoguePet` |
| `Game/Systems/gifting.ts` | 12 | `feedPet` / `markPetGifted` / `findPetTaste` |
| `Game/Systems/story.ts` | 10 | 效果 kind、`spawnPet` |
| `Game/Systems/residents.ts` → `residents/moveIn.ts` | 13 | `getPets` / `spawnPetAt`；import 路径随目录变 |
| `Game/Systems/residentCommands.ts` → `residents/commands.ts` | 12 | `getPets`；index.tsx 的 import 路径跟着改 |
| `Game/Systems/trading.ts` | 4 | `getPet` / `removePet` / `spawnPet` |
| `Game/Systems/actions.ts` | 5 | `petCompanion` 之类的局部名 |
| `Game/Systems/shopkeeping.ts` / `navigation.ts` | 2+2 | 注释、`petId` |
| `Data/Save/serialize.ts` | 4 | `snapshotPets` / `restorePets`（存档键 `pets` 不动） |
| `Data/Save/migrations.ts` | 15 | **只改局部变量名**（`for (const pet of …pets)`），字段访问 `ownWorld.pets` 一律不动 |
| `Data/Save/autosave.ts` | 1 | 注释 |

### Frontend-3D · 表现与 UI

| 文件 | 行 | 改什么 |
|---|---|---|
| `Game3D/World/PetView.ts` → `ResidentView.ts` | 33 | 类名、`views` 键、事件订阅 |
| `Game3D/World/RoomScene.ts` | 51 | `petView`、`cutscenePetId`、`interactTarget.kind === "pet"`、`getPet` |
| `Game3D/World/RemotePlayersView.ts` | 1 | 注释 |
| `Game3D/index.tsx` | 13 | `/pet` 指令改名 `/spawn` 并改指令体、`getPets`、`petDefinitions`、`tickPets` |
| `Game3D/Visual/recipes/{golem,shushu,otter,slime,fox,fishTrader,dragon,spirit,creatures,dailyBoard}.ts` | 10/8/7/6/6/6/6/5/4/1 | `buildPetVisual` 签名、`petEye` / `petFur` 这类色名、注释 |
| `Game3D/Visual/palette.ts` | 4 | `petFur` / `petFurLight` 色名 |
| `Components/Dialogue/DialoguePanel.tsx` / `GiftBox.tsx` | 5+2 | `petId` |
| `Components/NewspaperPanel/NewspaperPanel.tsx` | 5 | `petName` |
| `Components/ActionHub/ActionToast.tsx` | 2 | `petName` |
| `i18n/petName.ts` → `residentName.ts` | 13 | 函数名、import |
| `i18n/t.ts` | 25 | **文案键 `pet.*` 不动**；只有注释 |
| `Buildings/{slime,fox,spirit}House.ts` | 1×3 | 注释 |

### Frontend-3D · 测试

`residents.test.ts`(24) `shopkeeping.test.ts`(14) `theftChain.test.ts`(13) `yielding.test.ts`(10)
`golem.test.ts`(6) `residentCommands.test.ts`(6) `migrations.test.ts`(5) `i18n.test.ts`(5)
`construction.test.ts`(5) `navSize.test.ts`(4) `saveShape.test.ts`(3) `golemPhasing.test.ts`(3)
`buildSpeed.test.ts`(3) `doors.test.ts`(2) `saveRepository.test.ts` / `cottage.test.ts` /
`consigning.test.ts` / `cloudSyncRepository.test.ts`(各 1)

全是 import 名和 API 调用名。`migrations.test.ts` / `saveShape.test.ts` 里的 `pets: {}` 是存档形状，不动。

### Backend

| 文件 | 行 | 改什么 |
|---|---|---|
| `tests/handlers.test.ts` / `multiplayer.test.ts` / `sessions.test.ts` | 1×3 | 都是 fixture 里的 `pets: {}` 存档字段，**不动**。Backend 源码零处引用 |

### 文档

`README.md`（客户端分层那节写着"宠物"）、`AGENTS.md`（无）、`小动物经济圈/*.md`（提到 `petDefinitions` 的地方加一行"已改名"，历史文档不重写）。

## 执行顺序

1. `git mv` 八个文件（六个改名 + 两个搬进 `Systems/residents/`），改文件内标识符（Core 先，Frontend 后）。
2. 全仓 `petId → residentId`、API 名替换。用 tsc 当清单：改到 `tsc -p` 三个包全绿。
3. 事件名与剧情信号名：EventBus、story.ts、`Core/types/story.ts`、`Data/story`、`storyAudit`、测试里的 `getSignalCounts()["pet_spawned|…"]` 一起改。
4. 注释里的"宠物"按语义改：泛指活物的改"居民"，指 wisp / 舒舒的保留。
5. 全量九条验收命令；`Core/dist` 重新 build（旧的 `dist/types/pets.*` 会留下，`build` 前清一次）。
6. 提交（改名）。提交信息写清楚：为什么统称叫 Resident、为什么 `CreatureRole.Pet` 和存档字段 `pets` 不动。
7. **第二个提交：实例 id 迁移**（见上节）。版本号 +1、迁移、用真档验。

## 联机验收

改名本身不改协议：`WorldSave.pets` 字段不动、活物今天也不在刷新切片里。但**实例 id 迁移**会：房主和房客的存档版本必须一致才能进房（Backend 已经拒版本不同的），所以两端要么都迁了要么都没迁，不会出现一端 `pet-slime` 一端 `resident-slime`。验收补一条：

- Backend `tests/multiplayer.test.ts` 里"存档版本和房主不同被拒"那条用新版本号跑一遍仍然拒。
- 浏览器双端：迁移后房主建房、房客进场，房客 `/npc list` 看到三位的 id 都是 `resident-*`。

## 验收

- 三个包 `test` + `typecheck` + `typecheck:tests` 全绿，用例数与改前一致（Core 425+3 红时区、Frontend 672）。
- `grep -rE "\bPet[A-Z]|petsRuntime|petAgent|PetView|pet_changed|pet_spawned" --include=*.ts --include=*.tsx Core/src Frontend-3D/src` 只剩 `CreatureRole.Pet`、`WorldSave.pets`、`"pet-*"` id、`pet.*` 文案键。
- 改名提交：老存档读入不迁移、不报错（存档形状一个字节没变）。迁移提交：见上节。
- 浏览器起一次：`/npc list`、`/spawn shushu` 后按 F 和它说话、水獭班表，三条链各跑一下。

## 附：`petId` 的 176 处在哪

按整词统计（之前说的 189 含了 `cutscenePetId` 这类子串）。

| 处 | 文件 | 性质 |
|---|---|---|
| 41 | `Game/State/petsRuntime.ts` | API 参数名、Map 键 |
| 31 | `Game/State/petAgent.ts` | 类字段 `readonly petId`、构造参数 |
| 19 | `Game3D/World/RoomScene.ts` | 交互目标、过场、对话冻结 |
| 12 | `Game3D/World/PetView.ts` | 视图表键、事件订阅 |
| 11 | `Game/Systems/dialogue.ts` | `ActiveDialogue.petId`、条件判定 |
| 11 | `Core/src/Data/story/index.ts` | **数据字段名** `petId: "pet-slime"`（值不动） |
| 7 | `Game/Systems/story.ts` | 效果执行 |
| 6 | `Game/Systems/gifting.ts` | 送礼、节流 |
| 5 | `i18n/petName.ts` | 显示名查询 |
| 5 | `Core/tests/content.test.ts` | 审计 |
| 5 | `Core/src/types/story.ts` | **类型字段** `spawn_pet.petId`、`start_dialogue.petId` |
| 3 | `Game3D/index.tsx` | 指令 |
| 3 | `Game/EventBus.ts` | `pet_changed` / `pet_gesture` / `interact_target_changed` 载荷 |
| 3 | `Components/Dialogue/DialoguePanel.tsx` | 面板 |
| 2 | `Game/Systems/shopkeeping.ts` | 客源名单 |
| 2 | `Game/Systems/residents.ts` | 搬入 |
| 2 | `Game/State/world/entities.ts` | 分图装卸 |
| 2 | `Components/Dialogue/GiftBox.tsx` | 送礼框 |
| 2 | `Core/src/types/pets.ts` | `PetSave.petId` |
| 2 | `tests/navSize.test.ts` | |
| 1+1 | `tests/residents.test.ts`、`tests/golem.test.ts` | |

两类要单独看：

- `Core/types/story.ts` 与 `Data/story/index.ts` 的 `petId` 是**剧情效果的字段名**，改了 storyAudit 和全部规则数据要同步。
- `Core/types/pets.ts` 的 `PetSave.petId` 是**存档字段名**，属于 durable string：要么不改，要么归到迁移提交。

其余 150 多处是运行时参数名，纯机械替换。

## 附：Backend 为什么不在清单里

复核过（2026-09-05）：`Backend/src` 16 个文件里 **零处**引用 pet / Pet / creature；`Core/src/types/net.ts` 和 `contracts/` 也零处。
Backend 只把 `WorldSave` 当整块转发，不解析活物那一层。唯一沾到的是三个测试 fixture 里的 `pets: {}`，那是存档字段名，本任务不动。
