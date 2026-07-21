# Data Model 和 Persistence

本文档定义 Ownership 和 Extensibility。它有意不在相关 Feature 进入 Active Version 前猜测 Balance Value 或完整 Schema。

## 三种 Data

### Content Definition

随游戏发布或下载的 Immutable Authored Data，例如 Item Definition、Recipe、Furniture Definition、Pet Species、Event、Weather、Region、Dialogue Reference 和 Audio Rule。

Definition 使用稳定且 Language-neutral 的 ID，Saved State 只引用这些 ID。

### Runtime State

Active Game 中的 Mutable State，例如 Quantity、Position、Current Day、Pet Memory、Completed Event 和 Active Action。

### Presentation State

临时 State，例如 Open Panel、Selected Tab、Hover Target、Animation Progress 和 Camera Transition。除非某个明确 UX Requirement 需要，否则不进入 Save。

## ID Policy

- ID 在其 Type 内必须 Stable、Unique、Lowercase 且 Language-neutral。
- Display Name 和 Localization Key 可以变化，而 ID 保持不变。
- 需要个体 Identity 的 Runtime Entity 使用生成的 Stable Instance ID。
- Definition ID 被 Rename 或 Remove 时，必须提供 Alias 或 Migration。
- Scene NodePath 和 Array Index 不得作为 Durable ID。

以下 ID Shape 只作示例，不代表已确定完整 Catalog：

```text
item.wood
recipe.basic_table
furniture.workbench.basic
pet_species.forest_cat
event.first_day.pet_returns
region.forest
```

## Content Definition Families

### Item Definition

应包含的 Concept：

- ID 和 Localization Key。
- Category 和 Tag。
- Stack 和 Uniqueness Policy。
- Icon/Visual Reference。
- Quality 和 Expiration Policy。
- Usable、Edible、Placeable、Ingredient、Currency、Quest 或 Key-item Capability。
- 相关情况下的 Sell、Discard 和 Trade Restriction。

### Recipe Definition

应包含的 Concept：

- ID 和 Localization Key。
- Station Capability 和 Minimum Station Level。
- 按 Exact ID、Category、Tag、Quality 或 Condition 表示的 Ingredient Requirement。
- Output 和 Quantity。
- Unlock 和 Visibility Condition。
- Processing Mode 和 Timing Reference。
- Quality Rule 和 Failure Behavior。

### Furniture Definition

应包含的 Concept：

- ID 和 Localization Key。
- Scene/Visual Reference。
- Footprint 和 Placement Constraint。
- Collision 和 Navigation Behavior。
- Pickup、Rotation、Ownership 和 Multiplayer Permission Rule。
- Storage、Station、Bed、Action Unlock、Ambience 或 Decoration 等 Capability。
- 需要时的 Persistent Feature-state Schema。

### Action Definition

应包含的 Concept：

- ID 和 Category。
- Furniture/Capability Requirement。
- Duration Constraint 或 Preset。
- Fatigue/Hunger Cost。
- Reward Table 和 Guaranteed First-time Reward。
- Start、Interruption、Cancellation、Completion 和 Offline Policy。
- Animation 和 Soundscape Tag。

Player-authored Action State 引用 Action Definition 或 Category，并将经过 Sanitization 的 Player-entered Text 单独存储。

### Pet Definition

应包含的 Concept：

- Species ID 和 Visual。
- Need 和 Behavior Pool。
- Food 和 Weather Preference。
- Affection-stage Threshold 和 Behavior Unlock。
- Dispatch Destination/Result。
- Growth Rule。
- Audio 和 Animation Reference。

### Event Definition

应包含的 Concept：

- ID、Priority、Replay Policy 和 Multiplayer Policy。
- 基于 Time、Weather、Item、Furniture Capability、Pet State、Choice 和 Prior Event 的 Condition。
- Dialogue、Camera Cue、Movement Request、Reward、State Mutation、Choice、Unlock、Wait 和 Scene Transition 等 Step。
- Completion、Cancellation、Skip 和 Recovery Effect。

### Region 和 House Definition

应包含的 Concept：

- Region ID、Environment、Weather Table、Content Pool 和 Ambience。
- House ID、Compatible Region ID、Room Scene、Anchor、Starting Inventory Pool、Pet Encounter Pool 和 Initial Event Set。

## Runtime State Families

### Player Profile

保存不属于某个 World 的 Settings 和 Metadata：

- Profile/Save-slot Metadata。
- Accessibility、Language、Audio 和 Input Preference。
- 可选 Account Binding 和 Cloud Revision Metadata。
- 引入 Online Commerce 后的 Entitlement Reference。

Sensitive Token 不进入普通 Player Profile Save。

### World State

保存 Durable Progress：

- World Instance ID 和 Version Metadata。
- Region 和 House Definition ID。
- Day、Game Time 和 Weather。
- Player State 和 World-owned Inventory。
- Room 和 Placed Furniture。
- Pet 和 Dispatch。
- Active/Completed Action 和 Daily Task。
- Event Queue、History、Choice 和 Unlock。
- Mail、Photo、Discovered Recipe 和 Content-specific Progression。

### Session State

保存 Temporary State：

- Current Mode 和 Active World Reference。
- UI Navigation 和 Local Interaction Focus。
- Multiplayer Room Membership、Peer、Pending Command 和 Connection Status。
- In-flight Backend Operation。

只有明确需要 Durable 的 Information 才能提升到 Player Profile 或 World State。

## Save Envelope

每个 Durable File 或 Cloud Document 在 Concept 上都需要：

- Format Version。
- Game/Content Version。
- Save Kind：Profile 或 World。
- Stable Save/World ID。
- 通过明确 Clock 获取的 Created/Updated Timestamp。
- Payload。
- 可选 Integrity/Checksum Metadata。
- 可选 Cloud Revision/Conflict Metadata。

Persistence 进入 Active Version 并开始 Implementation 时，再在 `/contracts/save_schema.json` 中定义 Concrete Schema。

## Save Rules

- 从 Runtime State 构建 Save Snapshot，不直接 Blind Serialize Live Node。
- 写入前和读取后都必须 Validate。
- Atomic Write，并保留可恢复 Backup。
- 永远不能用 Invalid State 覆盖一个可读取 Save。
- 在 Durable Milestone 和 Safe Exit 后 Save，并通过 Debounce 避免过量写入。
- In-progress Action 是 Resume、Pause、Offline Complete 还是 Cancel，必须由 Focused Decision 解决。
- 只有 Compatibility Strategy 明确支持时，才保留 Unknown Extension Data。

## Migration Rules

每次 Save Shape 变更必须包含：

1. Old Fixture。
2. Migration Implementation。
3. Expected New Fixture 或 Assertions。
4. Idempotency Check。
5. Failure/Recovery Behavior。
6. 最旧 Supported Version 的 Documentation。

Migration 使用按顺序执行的 Step，而不是一个无 Version 的 Compatibility Function。

## Inventory Transactions

任何 Transfer、Crafting、Cooking、Reward、Trade 或 Consumption Operation 都必须 Atomic：

1. Resolve 相关 Inventory。
2. Validate Definition、Quantity、Capacity、Quality、Ownership 和 Permission。
3. 构建 Transaction Plan。
4. 应用全部 Removal 和 Addition。
5. 产生一个 Result，并 Schedule Persistence。

失败时不能留下 Partial Mutation。

## Time Model

每个 Time-dependent Definition 必须声明 Clock Semantics：

- Game Clock 随 Gameplay/Day Simulation 推进。
- Real Clock 使用 Wall Time Elapsed。
- Session Clock 只在 App/Session 运行时推进。
- Network Clock 对 Online Deadline 具有 Authority。

Code 不得隐式混用这些 Clock，Test 必须注入 Fixed Time。

## Randomness Model

Region Selection、House Selection、Loot、Weather、Pet Dispatch、Daily Generation 和 Event Variation 使用 Named Random Stream 或 Injected Seeded Source。Result 必须能通过 Test Fixture 复现，并可在 Development Log 中 Diagnose，同时不能暴露 Private Data。

## Shared Contracts

- `/contracts/save_schema.json`：实现后作为 Save Envelope 和 Shared Serialization Contract。
- `/contracts/api_schema.yaml`：实现后作为 Backend HTTP Contract。
- `/contracts/multiplayer_protocol.md`：实现后定义 Command、Event、Authority、Revision 和 Reconciliation。

不得在 Prose 与 Code 中重复一份 Contract，却不声明哪一份负责 Generate 或 Validate 另一份。
