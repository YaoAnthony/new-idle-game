---
name: create-furniture
description: "给据点添加一件/一批新家具（Core 物品定义 + Frontend 低模配方 + 注册 + 文案 + 验收）。用户说'做一件XX家具''加个XX''设计家具'就用它。先问尺寸/功能/表现问题，定稿一张规格表，再动代码；改完必须 tsc -p + headless + /testroom 或离屏截图。"
argument-hint: "[家具名或一批家具的描述]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion
---

# 创建家具（Frontend-3D 据点）

这份技能是"家具架构"的常驻地图 + 工作流。**先读这份，不要再去满仓库查一遍**；
只有当这里写的和代码对不上时，才去读代码（并回来改这份）。

## 0. 一句话架构

**没有"家具类型"——家具 = 带 `placement` 能力块的物品**
（`Core/src/types/items.ts` → `PlaceableItem = ItemDefinition & { placement: PlacementBlock }`）。
占用/寻路/坐卧/台面/渲染/放置 UI/交互全部消费这一条记录。加家具 = 加一条物品 + 一个外观配方 + 一行注册 + 几行文案。

## 1. 工作流（严格按顺序）

1. **问清楚再动手**（见 §5 问题清单）。用户没说的尺寸/功能不要猜，一次把问题问完，
   除非用户明确说"你定"。用户说"你定"时，按 §6 的默认值和现有同类件对齐，并把选择说出来。
2. **写规格表**（每件一行：id / 放哪 / 占格 / 模型尺寸 / 台面高 / 能力 / 锚点 / 提示 / 颜色 / 光音 / 获取方式），
   给用户确认。一批 ≤ 8 件。
3. **实现**：按 §3 的文件清单顺序改。
4. **验收**：按 §4。没跑验收不许说"做完了"。
5. **提交**：commit 信息写设计取舍（为什么这个尺寸/为什么这个能力），被否掉的方案也写一句。
   不推 main，除非用户让推。

## 2. 架构地图（要动的一切）

### 2.1 Core 物品定义 —— `Core/src/Data/items/index.ts`（`itemDefinitions` 数组）

```ts
{
  id: "furniture_<name>",                    // 玩家可拿的家具一律 furniture_ 前缀
  localizationKey: "item.furniture_<name>",
  category: ItemCategory.Furniture,
  stackLimit: 9,                             // 大件 1~9，墙饰/小件可更多
  rarity: Rarity.Common,
  // origin 不填 = Otherworld（这个世界的东西）；现实奖励才是 ItemOrigin.Real
  visual: { id: "<visual_id>" },             // 视觉 id 故意不等于物品 id（换模型不动存档）
  // audio?: { ambient?: 常驻音, active?: 工作时音, use?: 用一下那一声 }  → id 必须在 Core/src/Data/audio
  placement: {
    surface: PlacementSurface.Floor,         // Floor | Wall | Surface(只能上桌，如唱片)
    footprint: { width: 2, height: 1 },      // 整格(1格=1米)，**朝北时**的宽×深
    // footprintMask?: [[0,0],[1,0],...]     // 非矩形(L 形橱柜)真正压住的格；不填=整矩形
    capabilities: [FurnitureCapability.Sitting],
    floorLayer: FloorLayer.Object,           // Covering=地毯层(可被压) | Object=实体层
    blocksMovement: true,                    // 地毯/坐垫/哑铃/地铺 false
    surfaceHeight: 0.45,                     // 东西能落上去的那个面多高。**没有可用平面就别填**（衣柜/书架/落地灯）
    // surfaceGrid?: { width: 4, height: 2 } // 顶上能摆小物：半格(0.5m)网格，= footprint×2 铺满整个顶面
    // surfaceBlocked?: [[x,y],...]          // 台面上真有洞的半格(水槽)；灶眼是 slots，自动留净空
    // surfaceFootprint?: { width: 2, height: 2 } // 自己能上别人的桌：占几个半格（和 footprint 各管各）
    // slots?: [{ slotId, localizationKey, acceptedTags: ["cookware"], offset: [x, 承托面高, z] }]
    anchors: [                               // 带 Sitting/Sleep 必须至少一条
      { anchorId: "seat", posture: BodyPosture.Sit, offset: [0, 0.45, 0], facing: Facing.South },
      // offset 相对占地中心；**y = 承托面高**（椅面/床垫面）；坐=朝正面(+Z=South)，躺=头朝床头(-Z，可省略)
      // poseId?: "sit_crosslegged"（坐垫）
    ],
    interactHint: { localizationKey: "hint.<short>", action: "interact", anchorHeight: 1.05 },
    // action: "interact" | "pickup" | "sleep"；anchorHeight ≈ 家具顶部高度
    // coversOpenings?: true                 // 只有窗帘这类"本来就该挂窗上"的墙饰
  },
}
```

**能力清单**（`FurnitureCapability`，复用零代码；发明新能力要改 `RoomScene` 交互链 + 面板）：
Crafting / Cooking / Storage / Sleep / Sitting / Ambience / WaterSource / Unpack / DailyBoard / MusicPlayer /
**Bath**（浴缸：空→F 注水 6s→满→F 坐进去泡→起身自动放水 4s；水位是实例状态 `state.water`，`Systems/bath.ts` 推进，
`BathAnimator` 按名 `bath-water` 缩放水面；联机只同步转折点 op `bath_water_set`）；
行动支撑 Study / Exercise / Creation / Rest（决定家里能做哪类行动，见 `Core/src/Data/actions`）。

**实例状态**（`PlacedFurnitureState`，按实例不按定义）：`fixed`（房子自带拿不走，右键提示 `placement.fixed`）、
`water`（浴缸水位）、`slotContents`、`storageInventoryId`、`lootTableId`。开局自带的固定装置写在 `seedInitialFurniture`
+ 给老档补一条迁移（v26 隔断 / v27 浴缸是样板：放数组最前让 `revalidatePlacements` 把压住的家具退回背包）。

**发明新能力的完整清单**（浴缸那次走过一遍）：Core `FurnitureCapability` + 需要的实例状态字段 → 需要联机同步的状态加
`WorldOp` + `NET_PROTOCOL_VERSION`+1 + `Backend/src/multiplayer/validate.ts` 白名单 + `contracts/multiplayer_protocol.md` +
`Game/Multiplayer/opApply.ts` → `EventBus.StationCapability` → `RoomScene` 交互链/分派/气泡覆盖 → 需要的话 `Game/Systems/<x>.ts`
（`index.tsx` 里 start/stop）+ `World/<X>Animator.ts` → i18n。

**已有件参考尺寸**（对齐用）：椅 1×1 座高 0.49；凳 1×1 0.565；坐垫 1×1 0.24 不挡路；沙发 3×1 座 0.42（3 锚点 x=−0.92/0/0.92）；
园林长椅 2×1 座 0.45；床 2×3 床面 0.64；地铺 1×2 0.12 不挡路；桌 2×1 台面 0.83 台面网格 4×2；书桌 2×1 0.805；
矮几 2×1 0.45；工作台 2×1 0.91；橱柜 6×4 L 形 0.98；箱 1×1 0.76；书架/衣柜 2×1 无台面；
壁炉 2×1；落地灯 1×1；桌灯（月牙/蘑菇/云朵）1×1 不挡路、上桌 1×1 半格、模型 ≤0.36×0.48×0.35；盆栽 1×1（上桌 2×2 半格）；富贵竹 1×1 高 0.95；地毯 3×2/4×3/3×3/2×1 Covering；相框/挂钟 1×1 墙；窗帘 2×3 墙 coversOpenings（上一格杆子、下 2×2 帘子罩窗）；
日式浴缸 4×3（踏步 0.42、缸沿 0.8、坐台 0.35 = Sit 锚点 y，3 个坐位 x=−1.1/0/1.1，浴室南端 (11,17) 朝北 fixed）。

### 2.2 外观配方 —— `Frontend-3D/src/Game3D/Visual/recipes/<主题>.ts`

- 图元：`box(size, opts)` / `cylinder(rTop, rBottom, h, segments, opts)` / `sphere(r, wSeg, hSeg, opts)` / `blob(r, detail, opts)` / `group(name, children)`
  来自 `Frontend-3D/src/Game3D/Visual/primitives.ts`。`opts: { position, rotation, color, castShadow?, receiveShadow?, openEnded?, doubleSide? }`；
  color 传字符串走**共享材质缓存**（要改色/透明度必须先 clone）。castShadow/receiveShadow 默认 true；薄片装饰件手动 `castShadow: false`。
- 颜色只从 `Frontend-3D/src/Game3D/Visual/palette.ts` 的 `PALETTE` 拿；缺色才加，加在对应主题组里并写注释。
  规矩：六成画面高明度低饱和，饱和只点缀。现有：woodDark/Mid/Light、fabricCream/Rose/Sage/Teal、sofaFabric*、rug*、
  strawMat*、terracotta*、leafGreen*、stoneWarm*、brass、lampGlow、iron*/ceramic*、cardboard*、book* 等。
- **坐标约定（必须遵守）**
  - 地面件：原点 = 占地中心，y=0 在地板，**正面朝 +Z**（椅背/床头在 −Z）。模型必须装在 footprint 里，别外扩挤邻居。
  - 墙饰：原点贴墙面，XY 落在墙平面里，**+Z 朝屋内**（挂钟 `decor.ts` 是样板：厚度沿 +Z 堆）。
  - 台面件（上桌的东西）：同地面件，y=0 是桌面。
- 灯：`lampLight(PALETTE.lampGlow, x, y, z, opts?)` + `makeGlow(mesh, emissive, intensity)`（`recipes/ambience.ts`）。
  点光名字 **`lamp-light` 是 Lighting 扫描约定，别改**；昼 0 / 黄昏 9 / 夜 18，雾天全天亮。
  **那个数是"昼夜调光旋钮"，不是这盏灯的瓦数**——瓦数写在 `opts.strength`（不填 = 1 = 落地灯那一档），
  `Lighting.refreshLamps` 把两者相乘。摆得低、贴着墙的灯**必须自己调小**：
  平方反比在半米这个距离上是九倍的差距，套用落地灯的 18 会把整面墙烧成白斑
  （桌灯第一版的教训，用户实拍）。桌灯用 `TABLE_LAMP`（strength 0.06 / range 4.5 / **decay 1**）——
  decay 1 是因为一块 30 厘米的发光灯罩根本不是点光源，近场用平方反比就是错的。
- 动件：给节点起稳定的 kebab-case 名，Animator 每帧按名找（`DailyBoardAnimator` 事件驱动 / `GramophoneAnimator` 状态驱动 两个样板）。
- 建模要读 Core 的权威数值别抄数字：`findPlaceableItem("furniture_x")?.placement.surfaceHeight`（橱柜 `kitchen.ts` 是样板）。
  同一个高度出现在配方 + surfaceHeight + anchor.y 三处时（长椅的教训），三处一起改。
- 描边自动加（`Engine/Outline`），`userData.noOutline = true` 可让某个 mesh 不描。
- 手持/掉落/虚影/远端玩家全部复用同一配方（`buildItemVisual`），不用另做。

### 2.3 注册 —— `Frontend-3D/src/Game3D/Visual/VisualRegistry.ts`
`REGISTRY` 里加一行：`<visual_id>: { kind: "procedural", build: build<Name> }`。（`gltf` 通道预留，以后有模型换这行不动 Core。）

### 2.4 文案 —— `Frontend-3D/src/i18n/t.ts`（目前只有中文；日文词典还没建）
`item.furniture_<name>`、`item.furniture_<name>.desc`、有交互就 `hint.<short>`、可制作就 `recipe.<recipeId>`、有槽位就槽位 key。

### 2.5 可选
- 工作台配方：`Core/src/Data/recipes/index.ts`（`stationCapability: Crafting`）。
- 掉落/开局：`Core/src/Data/loot/index.ts`、`Frontend-3D/src/Game/State/world/furniture.ts` 的 `seedInitialFurniture`
  （**北窗前 x17–21 五格不许种开局家具**）。
- 音频档案：`Core/src/Data/audio/index.ts`。

### 2.6 运行时谁在读什么（改动影响面）
- 占用/寻路：`Core/src/logic/occupancy.ts`（footprint/mask/facing→格；floorLayer 分层；blocksMovement→blocked+surfaces（重叠取**最低**台面）；Sitting/Sleep→宠物目标）。
- 放置校验：`Core/src/logic/placement.ts`（`checkPlacement`，虚影和提交同一份）；台面：`logic/surfaces.ts`（半格，槽位自动留 0.55m 净空）；坐卧：`logic/anchors.ts`。
- 放置面：`Core/src/logic/placementFaces.ts`（地面/外墙/内墙两面都是 face，按 frame 算，**没有按 id 的分支**）。
- 视图：`FurnitureView.ts`（摆放/淡出/描边）、`SurfacePlacement.ts`；交互链 `RoomScene.ts`（Unpack > DailyBoard > MusicPlayer > Crafting > Cooking > Storage > Sleep > Sitting；距离量到占地边缘）；
  储物 `Game/State/storage.ts`（**每个箱子固定 24 格**，要分大小得改成数据）；坐卧 `Game/Systems/resting.ts`；槽位 `Game/Systems/kitchen.ts`；音景 `Engine/Soundscape.ts`。
- 存档：**新增 id 不用迁移**（未知 id 读档时丢弃）；改名/删除要 `Data/Save/migrations.ts` 的 `LEGACY_FURNITURE_ID` 冻结表 + `SAVE_SCHEMA_VERSION`。

## 3. 改动清单（按顺序）
1. `Core/src/Data/items/index.ts` 加物品（§2.1）
2. `recipes/<主题>.ts` 写 `build<Name>()`（§2.2）
3. （缺色）`palette.ts`
4. `VisualRegistry.ts` 注册一行
5. `i18n/t.ts` 文案
6. （可选）配方 / 掉落 / 开局 / 音频
7. 验收（§4）→ 提交

## 4. 验收（缺一不可）
- `cd Frontend-3D && npx tsc -p tsconfig.app.json --noEmit`（**必须带 -p**，裸 --noEmit 永远绿）；Core：`cd Core && npx tsc --noEmit -p .`
- headless（Frontend-3D 没测试框架）：**现成守门脚本** `Frontend-3D/Agent/create-furniture/check-furniture.ts`（定义存在 / 文案 item·desc·hint /
  外观已注册 / 坐睡必有锚点 / surfaceGrid 必配 surfaceHeight / 模型不出占地且贴地 / 客厅空地能落）。在 Frontend-3D 目录下：
  `npx esbuild Agent/create-furniture/check-furniture.ts --bundle --platform=node --format=cjs --alias:game=./src --alias:core=../Core/src --alias:three=./node_modules/three "--define:import.meta.env={}" --outfile=<scratchpad>/check-furniture.cjs && node <scratchpad>/check-furniture.cjs furniture_a furniture_b`
  （参数是要查的物品 id，可多个）。有新规则往这个脚本里加，别另起炉灶。
  已有规则：定义存在 / 文案 / 外观注册 / 坐睡锚点 / surfaceGrid 配 surfaceHeight /
  模型不出地面占地且贴地 / 客厅能落 / **模型不出台面半格占地** / **每张有台面的家具都摆得上**。
  注意：**带贴图的配方建不出来**（唱片封套要 `document`），这个脚本只守程序化家具。
- **观察台**（看长相用）：`Frontend-3D/Agent/create-furniture/preview.html`。dev 服起着的时候开
  `/Agent/create-furniture/preview.html?ids=furniture_a,furniture_b&phase=night&view=front`
  （`phase` day|dusk|night、`view` front|angle|top、`table` 桌面高、`spacing` 间距、`w`/`h` 画幅）。
  每件摆两份——桌面上一份、地板上一份，桌面画了 0.5 米半格线，**桌子背后立着一堵墙**。
  验灯请把 `table` 设成 0.56（床头柜高）：那是台灯最常见的摆法，也是唯一能看出"照墙太亮"的摆法。
  **不进游戏、不碰存档**（记忆 verify-in-dedicated-page）。它和 Engine/Renderer 一样开了
  ACESFilmic + 曝光 1.15，不抄这两行会骗人：没有色调映射时夜里发光面全顶成纯白。
  面板 hidden 时用 `window.__preview.shot()` 取 JPEG（记忆 offscreen-render-when-pane-hidden）。
  **灯具必须看夜景，而且要靠着墙看**：
  ① 点光装在壳里，壳的外表面拿不到自己的光，夜里只剩冷蓝环境光——emissive 是它唯一的暖色来源，
  而且 emissive 色要比固有色**更饱和**，否则 ACES 会把它压成白灯；
  ② 判"照墙会不会过亮"别靠眼睛，`gl.readPixels` 量墙面最亮那点——**顶到 255 就是丢了色相**，
  留在 200 上下才是"亮着但还是奶白墙"。第一版三盏灯在空地里怎么看都好，一靠墙就烧穿。
- 实机：DEV 控制台无 `auditItemVisuals` 警告（观察台里 `import("/src/Game3D/Visual/VisualRegistry.ts")`
  再调一次就行，不用进游戏）；`/testroom` 里 `placed` 含新件且 `walkableRegions === 1`；
  面板不显示时按 `offscreen-render-when-pane-hidden` 记忆离屏截图（`window.__scene` 手动 update+render → JPEG POST 本地 5199）。
  截图看：比例/朝向(+Z 正面)/贴地/描边/夜里发光/坐上去人不悬空。

## 5. 每件要问用户的问题（一次问完；用户答"你定"再用 §6 默认）
1. 是什么、放哪（地面/墙/只上桌）、名字 + 一句描述。
2. **尺寸**：占几格（朝北的宽×深；非矩形画掩码）；模型实际长宽高（米）；有没有可用台面、多高；顶上能不能摆小物；能不能上别人的桌。
3. 挡不挡路；地毯层还是实体层；能不能放院子。
4. **功能**：坐/睡（几个位、朝向、特殊姿势）/储物/照明/氛围/做饭槽位/支撑哪类行动/一次性容器；交互提示文案、气泡高度。
5. **表现**：主色调（调色板现有或新增）；发光/真光源；常驻音/使用音；动件。
6. **获取**：工作台配方（材料）/掉落/开局自带/以后商店；稀有度、堆叠上限。

## 6. 默认值（用户让我定时）
- 坐具座高 0.42–0.49，桌 0.75–0.83，矮几 0.45，柜/架不填台面高；1 格 = 1 米，人高约 1.7。
- 实体家具 blocksMovement=true；地毯/坐垫/地铺/小摆件 false。
- 有台面就给 `surfaceGrid = footprint×2`；上桌小物 `surfaceFootprint` 1×1 或 2×2 半格。
- 灯具：Ambience + `lamp-light` + 暖色 emissive；提示 `hint.<name>` "点亮/熄灭"类文案只是提示，Lighting 自动按昼夜开。
- 颜色：木用 woodMid 主体 + woodDark 收边；布用 fabric* / sofaFabric*；金属 brass/iron*。
- 稀有度 Common，堆叠 9；先不写配方，用 `/give` 验。

## 7. 已知坑
- Core **没有 furniture 审计**：surfaceGrid 缺 surfaceHeight、Sitting 缺 anchors、hint 漏翻译都不会报——headless 自己守（§4）；做第一批时建议顺手照 `Core/src/logic/doorAudit.ts` 补一个 `furnitureAudit`。
- 储物容量全局 24（`storage.ts`），要分大小先把常量变成 placement 字段。
- `hint.*` key 不是从 id 推的（`furniture_storage_chest` → `hint.chest`），命名短一点、别撞。
- 墙饰 facing 固定 North、不可旋转；朝向由放置面决定。
- **共面 = 锯齿**：叠在另一块体表面上的薄片（压条、面板、衬板）要么凸出 ≥1cm 盖住，要么缩进 ≥1cm，
  别和底下那张面贴平——两张脸争深度，远看是一条条横纹（浴缸第一版的教训）。
- 台面件不能叠台面件（桌上的箱子上不能再放东西）。
- 记忆规矩：改动前给规格表确认；commit 写取舍不写清单；1 格 = 1 米。
