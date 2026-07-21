# Domain Context

在 Code、Version、Data Definition、Test 和 Documentation 中统一使用以下 Terms。

## Product Language

### World

一个由 Save 拥有并可持久化的魔法生活环境。World 包含 Region、House、Room、Placed Furniture、Storage、Time、Weather、Pet、Event、Mail 和 Progression。

### Player Profile

不属于某个具体 World 的 Player-level Preference 和 Metadata。未来可以绑定 Authenticated Account，但 Local Play 不依赖 Identity。

### Session

一次 Local 或 Multiplayer 游玩期间的临时 Runtime Context。Session 默认不属于 Durable State。

### Region

大型环境主题，会影响 House Variant、Weather、Pet、Resource、Ambience 和未来 Destination。

### House

Player 在一个 World 中的 Home。House 包含一个或多个 Room，并拥有 Expansion、Wallpaper 等 House-level Progression。

### Room

可游玩的 top-down 2D 区域，包含 Collision、Navigation、Placement Surface、Interaction Anchor、Audio Context 和 Environmental Condition。

### Item Definition

描述 Item ID、Category、Tag、Stack Behavior、Icon、Quality/Expiration Policy 和 Capability 的 Immutable Content。

### Item Stack

Runtime 中对某个 Item Definition 的实际持有状态，包括 Quantity，以及可选的 Quality 或 Expiration 等 Per-stack State。

### Inventory

拥有 Item Stack，并提供基于 Capability 的 Query 和 Transaction 的 Container。Player Backpack 和 Furniture Storage 都属于 Inventory。

### Furniture Definition

描述 Footprint、Placement Rule、Visual、Interaction、Storage、Audio、Station Capability 和 Action Unlock 的 Immutable Content。

### Placed Furniture

World 中可持久化的 Entity，拥有 Stable Instance ID、Furniture Definition ID、Room ID、Transform 和 Feature-specific State。

### Station

可执行 Process 的 Furniture Capability，例如 Crafting、Cooking、Cutting、Rice Cooking、Bread Making、Composting 或 Daily-task Generation。

### Recipe

data-defined Transaction，需要 Input、Station Capability/Level、可选 Unlock Condition，并产生一个或多个 Output。

### Action

Player 创建或预定义的现实计时活动。每个 Action 属于 Exercise、Work/Study、Creation 或 Rest，并声明 Requirement、Cost、Timer Semantics 和 Reward。

### Need

会影响 Behavior 的受约束 Runtime Value 或 Request。Player Hunger/Fatigue 属于 Need；Pet 对 Food 或陪伴的需求也属于 Need，但它们有不同 Owner。

### Pet Definition

描述 Species-level Preference、Behavior、Growth、Audio、Possible Need 和 Dispatch Rule 的 Immutable Content。

### Pet

World 中可持久化的个体 Entity，拥有 Identity、Memory、Affection Stage、Need、Growth、Location 和 Dispatch State。

### Affection Stage

通过 Behavior 表现的隐藏 Relationship State。当前 Stage 为 `Stranger`、`Familiar Resident`、`Life Companion` 和 `Family`。Design 不向 Player 显示具体 Affection 数值。

### Event Definition

定义 Prerequisite、Scheduling、Branch、Effect、Replay Policy 和 Multiplayer Policy 的 Immutable Content。

### Event Instance

World 中某个 Event Definition 的 Queued、Active、Completed 或 Dismissed Occurrence。

### Unlock

由 Progression 赋予的 Durable Capability。Unlock 必须引用 Stable Capability ID，而不是 UI Element 或 Scene Path。

### Daily Task

由修复后的 Daily-task Machine 解锁并生成的重复 Objective。Daily Task 与 Player 创建的现实 Action 是两个不同概念。

### Dispatch

Pet 的一次 Journey，包含 Destination、Provision、Departure Time、Return Time、Condition 和 Generated Result。

### Weather

World 或 Region 的环境状态，会影响 Visual、Sound、Pet Behavior、Dispatch Result 和 Event。

### Soundscape

根据 Room、Weather、Time、Furniture、Pet 和当前 Player Action 组合出的 Layered Audio Result。

### Save Snapshot

Player Profile 或 World State 的 Versioned Serializable Representation。它包含 Stable ID 和 Data，不包含 Live Node。

## State Ownership

| State | Owner | Persistence |
| --- | --- | --- |
| Accessibility、Audio、Language、Input Mapping | Player Profile 或 Settings | Local；未来可选 Cloud |
| Region、House、Room、Placed Furniture | World | World Save |
| Inventory 和 Storage Content | 拥有它的 World Entity | World Save |
| Day、Game Time、Weather | World | World Save |
| Pet Identity、Memory、Affection、Dispatch | World | World Save |
| Event 和 Unlock Progress | World | World Save |
| Current Menu、Hover、Transient Animation | Session/UI | 不持久化 |
| Auth Token、Connection、Multiplayer Membership | Session/Infrastructure | 按需要安全临时存储 |
| Static Item、Recipe、Pet、Event | Content Definition | Project Data，不复制进 Save |

## 必须区分的概念

- Action 不等于 Daily Task。
- Player Profile 不等于 World。
- Item Definition 不等于 Item Stack。
- Pet Definition 不等于 Pet。
- Event Definition 不等于 Event Instance。
- Save Snapshot 不等于 Live SceneTree。
- Session State 不等于 Durable Progression。
- Local Save 和 Cloud Save 是同一 Persistence Seam 的不同 Adapter，不是两套 Gameplay System。
