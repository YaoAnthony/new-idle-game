# Product Specification

本文档拥有长期 Product Behavior 和 Product Boundary。它不拥有当前 Release Scope；当前可实现内容始终以 `versions/` 下的 Active Version 为准。

## Vision

打造一款温暖的 top-down 2D 魔法生活游戏，让现实中的专注 Action 转化为可见的游戏 Progress。Player 租下一间 House，完成计时 Action，获得 Resource，照顾 Pet、Cooking、Crafting Furniture、Decoration，并逐渐解锁更大的 World。

游戏通过 Music、Environmental Sound、Pet 和可选 Social Play 提供安静的陪伴感。Progress 应该是个人化的，而不是竞争性的。

## Core Experience Pillars

### 现实 Action 转化为 Game Progress

Player 在四种 Category 中创建或选择 Action：

- Exercise。
- Work/Study。
- Creation。
- Rest。

可用 Action 取决于 Furniture 和已解锁 Capability。完成 Action 会消耗 Time 和相关 Need，再发放 data-defined Reward。

### Home 与 Player 一起成长

Resource 可以用于 Survival、Crafting Furniture、解锁 Action、Decoration、创建 Soundscape、种植 Plant、扩建 House 和获得 Travel 能力。

### Pet 是 Relationship，而不是 Meter

Pet 拥有 Need、Preference、Memory、Affection Stage、Behavior、Dispatch Choice 和 Growth。游戏不向 Player 显示精确 Affection Number，而通过 Behavior 和 Event 表现 Relationship 变化。

### 安静的 Social Presence

未来 Multiplayer 允许 Friend 访问 Host-owned World，观察彼此正在进行的 Action，使用被允许的 Station/Furniture，共同推进 Daily Task，并获得 Friendship Reward。Main Story 默认不在 Multiplayer 中推进。

## Core Loop

```text
选择可用的现实 Action
  -> 按 Definition 消耗 Game Time、Fatigue 和 Hunger
  -> 获得 Resource
  -> 将 Resource 用于 Survival、Pet、Crafting 或 Decoration
  -> 解锁新的 Capability、Relationship 和 Event
  -> 在多个 Day 中重复
```

## Presentation 和 Controls

- 初始游戏采用 top-down 2D。
- Player 在 Room-scale Environment 中移动，并与附近 Object 交互。
- Inventory、Interaction、Placement 和 Action Control 必须使用 Godot InputMap Action，并支持 Remapping。
- 当前设计中的 `B`、`F`、Left Click 和 Right Click 只是 Default Binding；Gameplay Logic 不得依赖这些 Physical Input。
- Camera Behavior、Collision、Navigation、Depth Sorting 和 Interaction Range 必须来自 Data/Configuration，而不是 Magic Value。

## Release Scope

Latest Released Version 是 `versions/v0.1.0-initial-screen.md`，包含 Initial Screen、基础 Button Flow 和 Native Adaptive Layout。Current Active Version：无。

## First-day Target Experience

完整 First-day Experience 是由多个小型 Vertical Slice 组成的后续 Milestone：

1. Player 获得多个 Starting Region 和 House Variant 中的一种。
2. Player 打开 Inventory 并放置 Starting Furniture。
3. 放置并使用 Workbench，开始了解 Crafting。
4. Player 遇见一只 Pet，并了解它最初的 Need。
5. Furniture 解锁一个或多个 Action Category。
6. 完成 Action 后获得 Story-critical Resource 和 General Resource。
7. Reward 可以赠送给 Pet、用于 Crafting 或由 Player Consume。
8. Cooking 引入 Food、Hunger Recovery、Utensil、Station、Timing 和 Quality。
9. Player 完成数个 Action，进入 Night，并在 Starting Bedding 上 Sleep。
10. 第二天，Pet 带着 Gift 回来，Mother 来电介绍 Daily-task Machine。
11. 游戏进入可重复的 Home-life Loop。

该 Sequence 必须由 data-driven Progression 和 Event Definition 表示，不能写成一个 Monolithic Tutorial Script。

## Required Gameplay Systems

### Foundation

- App Startup、Local New Game、Continue、Settings 和 Safe Exit。
- Top-down Movement、Collision、Camera、Interaction Targeting 和 Scene Transition。
- Input Mapping、Localization、Accessibility Settings、Audio Bus 和 Error Presentation。

### World 和 Home

- Region 和 House Variant。
- Room Anchor、Placement Surface、Collision、Navigation 和 Valid Furniture Footprint。
- Furniture Pickup、Preview、可选 Rotation、Placement、Interaction、Persistence 和 Storage Capability。
- 未来 Wallpaper、Expansion、Renovation、Weather 和 Travel Unlock。

### Inventory 和 Crafting

- data-defined Item、Category、Stack、Tag、Quality、Expiration 和 Ownership。
- Player Inventory 和 World Storage Container。
- Crafting Station 通过明确 Inventory Interface 查询被允许的 Inventory。
- Recipe 定义 Input、Output、Station Type/Level、Visibility、Unlock 和 Failure Reason。
- Requirement 缺失时必须可见，且不能产生 Partial 或 Duplicate Transaction。

### Real-life Actions

- 四种 Action Category，拥有 data-defined Requirement 和 Outcome。
- Player 自定义的 Action Name 和 Duration。
- Start、Pause/Interruption Policy、Completion、Cancellation 和 App Exit 后 Recovery。
- 基于 Furniture Capability 的 Availability。
- Fatigue 和 Hunger Constraint。
- Reward 和 First-time Story Guarantee。

### Time、Need 和 Sleep

- Game Day 和 Time Progression。
- Fatigue Consumption 和 Recovery。
- Hunger Consumption、Food Recovery，以及最低 Hunger 时阻止 Action。
- Sleep 推进 Day，并可触发 Queued Event。
- 每个 Timer 都必须明确 Real-time 和 Game-time Semantics。

### Pets

- Species 和 Individual Identity。
- Need、Preference、Incompatible Food、Weather Preference 和 Memory。
- 通过 Stage 和 Behavior 表达的 Hidden Affection Progression。
- Dialogue 和 Event Interaction。
- Dispatch Destination、Provision、Duration、Result 和 Return Event。
- 初期只实现 Growth Value；Evolution Behavior 继续 Deferred。

### Cooking 和 Food

- Stove、Cutting Board、Rice Cooker、Bread Maker 和 Plate 等 Station Capability。
- Ingredient Compatibility、Recipe Discovery、Process Step、Timing、Quality、Serving 和 Consumption。
- Timing 不佳可以降低 Quality，但除非有明确 Design Decision，不得摧毁 Rare Material。
- Food Expiration 和 Prepared-meal Behavior 需要独立 Decision。
- 未来 Pet Cooking Delegation 依赖已 Unlock Recipe 和 Pet Capability。

### Events 和 Progression

- 基于 Day、Weather、Inventory、Furniture Capability、Pet State、Prior Event 和 Player Choice 的 Condition。
- Dialogue、Reward、State Change、Unlock、Camera Cue、Weather 和 New Capability 等 Effect。
- One-time、Repeatable、Queued、Mutually Exclusive 和 Multiplayer-disabled Policy。
- 初始 Unlock Event 包括损坏的 Daily-task Machine，以及救助大河后解锁 Travel/Social Access。

### Daily Tasks

- 通过修复后的 Daily-task Machine 解锁。
- Reward 可包括 Address Fragment、Stamp、Weather Bottle、Film、Photo Paper、Fuel 和 Travel Ticket。
- Daily Reset、Generation、Completion 和 Offline Recovery Semantics 必须明确。

### Plant 和 Compost

- Pot、Seed、Growth、Fertilizer 和 Environmental Condition。
- Expired Food 可以通过 Compost Station 变成 Fertilizer。
- 因为 Smell Constraint，Station Placement 可能要求独立 Area。
- Fertilizer 和 Food 拥有 data-defined Quality/Level Relationship。

### Dynamic Soundscape

- Layered Ambience 根据 Weather、Furniture、Pet、Player Action、Room 和 Time 变化。
- 示例包括 Rain、Wind、Fire、Water、Wind Chime、Clock、Cooking、Pet Movement、Study、Exercise 和 Creation Sound。
- Layer 必须可独立调节，并遵循 Master、Music、Ambience、Effects 和 Accessibility Settings。

## Deferred Online 和 External Systems

### Account 和 Cloud Save

Local Play 优先。只有 Cloud Save、Friend、Multiplayer、Purchase 和 Cross-device Identity 等 Identity-dependent Service 才需要 Login。Guest-to-account Migration 必须保留 Local World。

### Multiplayer

- Host-owned World Session。
- 明确的 Visitor Permission 和 Authority。
- Shared Daily-task Contribution 和 Friendship Stamp。
- 默认不推进 Main Story。
- Implementation 前必须定义 Disconnect、Conflict、Rollback 和 Session Finalization Policy。

### LLM Photo 和 Letter

- Photo 和 Letter 根据有界 Event Context 生成。
- Generation 属于 Cosmetic/Narrative，不得直接发放 Authoritative Reward。
- Backend 拥有 Prompt、Credential、Moderation、Retry、Fallback Content、Cache 和 Cost Control。

### Commerce

- 潜在 Product 包括 Magic Wand、Wallpaper 和 Cosmetic Content。
- Purchase 必须经过 Authenticated、Idempotent 的 Server Verification，并支持符合 Platform 规则的 Restore。
- Commerce 不属于 Initial Screen 或 First Gameplay Vertical Slice。

## Non-functional Requirements

- offline-first Core Loop。
- Versioned、Recoverable、Atomic Local Save。
- data-driven Content 和 Stable ID。
- 通过 Injectable Time/Randomness 实现 Deterministic Tests。
- 初期支持 Keyboard/Mouse，并通过 Input Abstraction 为 Controller 做准备。
- UI 和 Content 从一开始就 Localization-ready。
- 提供 Audio Control，并为重要 State 提供 Non-audio Feedback。
- Backend、Network、LLM 或 Commerce Service 不可用时，有明确 Degraded Behavior。
- Client 中不包含 Secret 或 Authoritative Purchase Logic。
- Asset Attribution 和 Licensing Record。
- Optimization 前先根据 Target Platform 记录 Performance Budget。

## Delivery Boundary

Milestone 顺序和候选 Vertical Slice 由 `ROADMAP.md` 描述。任何未来 Product Behavior 都必须先进入状态为 `active` 的独立 Version Document，才能获得 Implementation 权限。

## Open Product Questions

以下问题必须由未来 Version 或 Decision 解决，不得在 Code 中擅自假设：

- Target Desktop Platform 和 Minimum Hardware。
- Pixel Art、Hand-painted 或其他 Visual Direction。
- Tile/Grid Size、Free Placement 或 Snapped Placement，以及 Rotation Rule。
- App 关闭时 Action Timer 是否继续。
- Action Pause 和 Cancellation 的 Consequence。
- Hunger、Fatigue、Food Expiration 和 Day Length 的具体 Balance。
- Save-slot Count 和 Guest-to-account Merge Behavior。
- Multiplayer Authority 由 Host 还是 Dedicated Server 负责。
- Generated Letter/Photo 的 Moderation、Privacy 和 Retention Rule。
- Monetization Platform 和 Restore/Refund Policy。
