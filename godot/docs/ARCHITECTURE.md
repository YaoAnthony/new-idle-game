# Architecture

## System Context

```text
Player
  -> Godot Client
       -> Local Definition 和 Local Save
       -> 使用 Online Feature 时连接 Backend Adapter
            -> Identity 和 Cloud Save
            -> Multiplayer Session
            -> LLM Generation
            -> Commerce Verification
```

Godot Client 拥有完整 Offline Gameplay Loop。在 Feature 明确需要 Identity 或 Shared Authority 之前，Backend Service 都是 Optional Adapter。

## Dependency Direction

```text
Scene 和 UI
  -> Feature Interface
       -> Runtime State 和 Content Definition
            -> Infrastructure Interface
                 -> Local 或 Remote Adapter
```

Dependency 不得反向。Static Data 不依赖 Scene；Runtime State 不调用 UI；Feature Rule 不直接打开 File 或发送 HTTP Request；Infrastructure Adapter 不决定 Reward、Progression、Affection 或 Crafting Outcome。

## Top-level Godot Ownership

### `app/`

拥有 Bootstrap、Root Scene、Scene Transition、Lifecycle、Pause、Shutdown，以及 Active World 与 UI 的 Composition。

在 `v0.1.0` 中，`app/` 只负责加载 Main Scene。Initial Screen 的 Presentation 放在 `ui/menus/`，由 Main Scene 组合。此 Version 不创建通用 Menu Router、Save-aware Menu State 或 Scene-transition Framework。

目标 Root SceneTree 的形状是 Concept，不是强制 Node-name Contract：

```text
Main
├── WorldHost
│   └── ActiveWorld
├── SessionSystems
└── GUI
```

Feature 不得通过 hardcoded Absolute NodePath 寻找这些 Node。Dependency 应由 Composition 提供，或使用明确 Signal/Interface。

### `features/`

拥有 Player-visible Gameplay Behavior。每个 Feature Directory 将 Scene、Script、Local Asset、Feature Test 和可选 Feature Documentation 放在一起。

Feature 可以包含：

```text
feature_name/
├── feature_scene.tscn
├── feature_scene.gd
├── feature_rules.gd
├── definitions/
├── assets/
└── tests/
```

不要提前创建每个 Subdirectory。Active Version 创建实际 Content 时再添加。

### `data/`

拥有 Immutable Content Definition 和 Catalog。由 Editor 创作的 Content 可以使用 Godot Resource；需要跨项目共享或 Remote Delivery 时，可以使用经过 Validation 的 JSON。实现某类 Content 前，必须通过 Decision 确定 Format。

### `state/`

拥有 Serializable Runtime State Shape 和 Invariant。State Object 不是通用 Global Manager；它只包含 Durable Data 和 Focused Domain Operation，不包含 Rendering、File Access 或 Network Code。

### `infrastructure/`

拥有 Persistence、Backend Call、Authentication、Multiplayer Transport、Audio Device、Analytics 和 Platform Service 的 Adapter。

### `ui/`

拥有 Cross-feature Menu、HUD、Dialog、Reusable Widget、Focus Navigation、Accessibility Presentation 和 View-only State。只被一个 Feature 使用的 UI 可以留在该 Feature 内。

`v0.1.0` 的 Initial Screen 是第一个 Cross-feature Presentation Shell。它只包含 Background Slot 和 Title Slot；Future Asset 替换这些 Slot，而不是创建第二套 Entry Screen。

### `tests/`

拥有 Cross-feature Integration Test、Shared Fixture、Save Fixture 和 Complete Flow Test。Feature-local Unit Test 可以放在 Feature 附近。

## Transitional Directories

仓库目前存在较早的 Placeholder Directory，例如 `/Core/`、`/TileMap/`、`godot/scene/` 和 `godot/scripts/`。它们不属于已接受的 feature-first Architecture。不得继续向其中加入 Production Behavior，也不得顺手删除或移动。Focused Migration/Cleanup Version 必须先识别 Ownership，并保留所有 User-created Content。

## Autoload Policy

只有同时满足以下条件时，Autoload 才合理：

- 必须跨 Scene Transition 存活。
- 只有一个 Global Owner。
- Public Interface 小而稳定。
- Test 能够替换或 Reset。
- 不会演变为 Miscellaneous Dependency Container。

潜在用途包括 Application Lifecycle、Active Profile/World Coordination、Save Orchestration、Audio Bus Coordination 和 Scene Routing。Inventory、Pet、Crafting、Cooking、Event 和 Furniture 不应自动变成 Autoload；它们通常属于 Active World 或 Feature Scene。

## Scene 和 Node Design

- Reusable Visual/Physical Entity 和 Composed Behavior 使用 Scene。
- 不需要 SceneTree Lifecycle 的 Rule 和 State 使用 RefCounted/Data Object。
- 适合 Editor 创作的 Immutable Definition 可以使用 Resource。
- 优先使用 Composition 和 Capability，避免 Deep Inheritance Tree。
- Signal 用于跨 Seam 发布已发生的 Fact 或 Request，但不能代替明确的 State Ownership。
- Node Name 使用 PascalCase；File 和 Directory 使用 snake_case。
- Core Behavior 避免 Fragile `get_parent()` Chain、Absolute NodePath 和 String-based Method Dispatch。

## Top-down 2D World

World Module 必须考虑：

- Movement/Collision 与 Animation 分离。
- Interaction Detection 和 Deterministic Target Selection。
- Player、Pet 和 Furniture 的 Y/Depth Ordering。
- Camera Constraint、Room Bound、Transition 和 Event Cue。
- Pet 与未来 Visitor 的 Navigation。
- 根据 Footprint、Surface、Collision、Access Path 和 Room Rule 执行 Placement Validation。
- Spawn Anchor 和 Stable Placed-entity ID。
- Tile-based 或 Free-form Map Authoring 由正式 Decision 选择。

Art Coordinate、Physics Layer、Navigation Layer、Tile Size、Interaction Range 和 Camera Value 必须进入 Project Configuration、Definition 或 Exported Property，不能复制为 Literal。

## Gameplay Modules

### Player

把 Mapped Input 转换为 Movement 和 Interaction Intent。Player 拥有当前 Controllable-character State，但不拥有 World Inventory、Crafting 或 Save Behavior。

### Interaction

使用 Capability Query，例如 Interactable、Placeable、Storage、Crafting Station、Cooking Station、Bed、Pet 或 Pickup。添加新 Interactable Content 时，不应修改一个 Central Switch Statement。

### Inventory

对一个或多个 Inventory 提供 Atomic Transaction。Crafting 和 Cooking 先构建 Transaction Plan，再一次性 Consume Input 和 Grant Output。Operation 失败时，所有 Inventory 保持不变。

### Furniture

分离 Furniture Definition 和 Placed Furniture Entity。Placement 包含 Preview、Validation、Confirmation、Cancellation 和 Persistence。Furniture 通过 Capability 暴露 Behavior，不检查 Content Name。

### Workbench 和 Cooking

二者都是 Station Process Feature，可共享 Transaction Concept，但不强制使用相同 Workflow。Recipe 声明 Requirement 和 Output；各 Station Feature 拥有自己的 Timing、Quality、Interaction 和 Presentation。

### Actions

拥有 Player-authored Action Metadata、Availability、Timer Semantics、Need Cost、Completion、Cancellation 和 Reward。Clock Seam 使 Action 可 Deterministic Test，并支持未来对 Offline Progress 的 Decision。

### Pets

拥有个体 Pet State 和 Behavior Policy。Pathfinding/Animation 渲染 Intent；Need、Affection、Preference、Memory、Dispatch 和 Event Rule 保持 Deterministic、可测试。

### Events

评估 data-defined Condition，并通过已注册 Capability 应用 data-defined Effect。Event Progression 必须可 Resume 并进入 Save。Production 使用长 Cutscene 前，必须具备安全 Skip/Recovery Policy。

### Soundscape

根据 World State 解析需要的 Audio Layer，并将 Mixing Intent 发送给 Audio Adapter。不能让每件 Furniture 或每只 Pet 直接控制 Global Audio Bus。

## State Change Model

Conceptually 使用 Explicit Command 和对应 Domain Event：

```text
Player Intent
  -> Validate Command
  -> Apply Atomic State Change
  -> Emit Domain Event
  -> Update Presentation
  -> Durable 时 Schedule Autosave
```

例如 `place_furniture`、`craft_recipe`、`start_action`、`complete_action`、`give_item_to_pet` 和 `sleep_until_next_day`。具体 Type 属于 Implementation Decision，但每个 Durable Mutation 都必须拥有命名明确、可测试的 Path。

## Persistence Architecture

```text
Feature State
  -> Save Snapshot Builder
  -> Save Repository
       -> Local Save Adapter
       -> Future Cloud Save Adapter
```

Requirements：

- Versioned Envelope 和 Content Version。
- Definition 和 Runtime Entity 使用 Stable ID。
- 在 Platform 支持时，通过 Temporary File 和 Replace 实现 Atomic Write。
- Last-known-good Backup。
- Schema Validation 和有用 Error。
- 从受支持 Older Version Migration。
- 对 Unsupported Newer Version 执行 Reject 或 Read-only Recovery。
- Settings/Configuration 与 World Save 分离。
- 明确 Autosave Trigger 和 Debounce Policy。
- 为 Migration 与 Corrupted-save Test 提供 Fixture。

## Backend Architecture Boundary

Godot 通过 `/contracts/` 下 Versioned Contract 通信。Backend 拥有：

- Account Identity 和 Secure Session。
- Cloud Save Storage、Revision、Conflict Metadata 和 Quota。
- Multiplayer Room Lifecycle 和未来选择的 Authoritative Mutation。
- LLM Prompt、Safety、Generation、Cache 和 Cost Control。
- Purchase Verification 和 Idempotent Entitlement Grant。

Godot Client 可以拥有 Optimistic UI 和 Offline Behavior，但不能被信任去决定 Currency、Purchase、Online Reward 或 Access Control。

## Failure Behavior

每个 Adapter 都应暴露有用 Failure Category，例如 Unavailable、Timeout、Unauthorized、Conflict、Invalid Data、Quota、Unsupported Version 和 Unknown Error。Feature/UI Layer 再将其转换为 Player-safe Outcome。

必须支持的 Recovery Pattern 包括：

- 对 Transient Operation 执行有界 Retry。
- Cancel 并返回 Stable State。
- 合法情况下继续 Offline。
- Cloud Conflict 时保留可恢复的 Local Data。
- LLM Failure 时提供 Fallback Text/Image。
- Crafting、Reward、Save 或 Purchase Retry 后不重复 Grant。

## Performance 和 Observability

- Event 或 Timer 足够时，不做 Per-frame Polling。
- 只有经过 Measurement 后，才 Pool 或 Batch 重复 Visual/Audio Effect。
- Development Build 中记录 Scene Load Time、Save/Load Duration、Active Node、Memory、Frame Time、Network Latency 和 Adapter Error Category。
- Log 使用 Category 和 Stable Event Name；Production 中不得记录 Secret、Token、Personal Text 或完整 Generated Prompt。
- Target Platform 确定后再定义 Performance Budget。
