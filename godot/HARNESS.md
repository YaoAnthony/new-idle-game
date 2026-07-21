# Development Harness

本文档是人类和 AI Agent 构建 Godot 游戏时必须遵守的执行契约。它把原始 README 中的 Game Design 转换为可重复的 Planning、Implementation、Validation 和 Recovery 流程。

## Product Thesis

玩家生活在一个以 top-down 2D 呈现的魔法出租屋中。学习、工作、运动、创作和休息等现实 Action 会推进游戏计时，完成后获得 Resource。Resource 服务于三类结果：

1. Survival：Food、Energy、Rest 和 Day Progression。
2. Relationship：Pet Need、Memory、Affection、Growth 和 Dispatch。
3. Home Growth：Furniture、Crafting Station、Decoration、Room Expansion、Soundscape 和 Travel。

每个主要 Feature 都必须强化这个 Core Loop。无法影响 Core Loop 的 Feature，必须具备明确的 Product Reason 和 Version-level Acceptance Test。

## 当前 Delivery Mode

- Primary Client：Godot。
- Presentation：top-down 2D。
- Initial Mode：offline-first local single-player。
- Current Version：`v0.1.0 Initial Screen`，交付最小 Main Menu Shell。
- First Gameplay Milestone：在 Initial Screen 后构建小而完整的 Playable Vertical Slice，而不是大量互不连通的 Systems。
- Deferred Adapters：Account Login、Cloud Save、Multiplayer、LLM Generation 和 Commerce。
- Protected Project：不得修改 `Frontend/`。

top-down 2D 表示玩家在 2D 平面中移动和交互，Room 使用 2D Collision、Navigation、Depth Ordering 和 Camera Rule。

## Source of Truth 顺序

文档冲突时，按以下顺序判断：

1. `docs/DECISIONS.md`：已接受的 Technical 和 Product Decisions。
2. `docs/versions/` 下当前 Active Version：当前 Release Scope。
3. `docs/SPEC.md`：Product Scope 和 Required Behavior。
4. `docs/CONTEXT.md`：Domain Terminology 和 Ownership。
5. `docs/ARCHITECTURE.md` 与 `docs/data/DATA_MODEL.md`：Implementation Shape。
6. 根目录 `README.md`：原始意图和长期想法。
7. Existing Code：可能不完整或处于过渡阶段。

Implementation 不得静默违背 Accepted Decision 或扩展 Active Version Scope。确实需要改变 Decision 或 Scope 时，必须先完成对应 Review 和 Documentation Update。

## 不可妥协的 Engineering Principles

### 构建 Vertical Slice

每次实现完整的 Player Outcome，贯通 UI、Gameplay State、Persistence 和 Validation。任何 Core Loop 尚不可玩时，不要提前创建大量孤立的 Manager。

### 保持 Content 为 data-driven

Item、Recipe、Furniture Capability、Action Category、Reward、Pet Preference、Event、Weather Outcome、Dialogue Reference、Audio Layer 和 Progression Condition 都必须以 Content Data 定义。Scene Script 只实现可复用 Behavior 并解释 Definition。

Display Name 不得作为 ID。不得把 Recipe Value、Item Reward、Input Key、File Path、Service URL 或 Localized Text 分散在 gameplay scripts 中。

### 分离 Definition、Runtime State 和 Presentation

- Definition 描述可以存在哪些 Content。
- Runtime State 描述当前 Save 中实际存在什么。
- Presentation 渲染 State 并收集 Player Intent。

UI 不得成为 Inventory、Crafting、Pet、Event 或 Save Rule 的 Owner。

### 保证 Offline Play

Core Loop 必须在没有 Account 或 Network Connection 时运行。Online Adapter 添加 Synchronization 和 Social Behavior，但不能成为 Local Gameplay 的必需 Dependency。

### 从一开始设计 Persistence

任何会产生 Durable Progress 的 Feature 都必须声明：

- 保存什么。
- State Owner 是谁。
- 何时写入。
- Older Save 如何 Migration。
- Data 缺失、无效或来自 Newer Version 时如何处理。

### Time 和 Randomness 必须可控

Game Time、Real Time、Timer、随机 Region/House、Loot、Weather 和 Pet Dispatch 必须通过可替换 Interface 访问。Tests 必须能够提供 Fixed Clock 和 Seeded Random Source。

### External Service 统一视为 Adapter

Local Save、Cloud Save、Authentication、Multiplayer Transport、LLM Generation、Payment、Analytics 和 Platform API 都位于明确 Seam 后方。Gameplay Feature 依赖稳定 Interface，而不是 Vendor SDK 或 HTTP 细节。

## Agent Execution Loop

### 1. Orient

- 阅读本文件、Active Version 和其链接的 Context。
- 编辑前检查 Version 的 Implementation Boundary 涉及的文件。
- 确定 Player-visible Outcome。
- 确定受影响的 Definition、Runtime State、Scene、Adapter、Save、Test 和 Contract。

### 2. Check Readiness

Version 只有满足以下条件才能开始 Implementation：

- Status 为 `active` 或 `frozen`。
- Outcome 可以被 Player 或 Test 观察。
- Dependencies 已完成，或 Version 明确声明可接受的 Placeholder/Fallback。
- Acceptance Criteria 具体明确。
- Out of Scope 已列出。
- 所需 Art/Audio 可以使用经过批准的 Placeholder。
- Save 和 Migration 影响已说明。
- 涉及 Network 或 Backend 时，Ownership 已说明。

缺少以上内容时，应先完善 Version Document，再开始 Implementation。

### 3. 规划最小完整 Change

优先完成一条 end-to-end Path。例如 Inventory Version 应包含一个 Item Definition、一个 Runtime Stack、一个 UI Render Path、一次 Interaction、一次 Save/Load Round Trip 和相关 Tests；不应提前实现所有 Item Category。

### 4. 通过 Module Interface 实现

- Feature Module 拥有自己的 gameplay rules。
- State Module 拥有可序列化 State Shape。
- Infrastructure Adapter 拥有 File、Network 和 External Service。
- UI 只拥有 View State。
- 使用 Signal 和明确 Method Call 传递 Intent；不要依赖脆弱的 SceneTree Path 或隐藏的 Global Mutation。

### 5. 分层 Validation

先运行范围最小且有价值的检查：

1. Data/Schema Validation。
2. Deterministic Rule 的 Unit Tests。
3. Feature Seam 与 Persistence 的 Integration Tests。
4. Headless Project Load 和 Scene Checks。
5. Manual 或 Automated Player-flow Eval。
6. Version 要求的 Full Validation。

### 6. 有意识地 Recovery

Validation 失败时：

- 稳定复现 Failure。
- 判断 Defect 位于 Definition Data、Runtime State、Presentation、Adapter Behavior 还是 Test Assumption。
- 对确认的 Defect 添加 Regression Test。
- 不得为了让 Test 通过而削弱 Acceptance Criteria。

### 7. Report

每次 Completion Report 必须包含：

- Player-visible Result。
- 所属 Version 及其 Acceptance 影响。
- Changed Files。
- 执行过的 Tests 和 Evals。
- Save、Schema 和 API Impact。
- Known Limitations。
- 新解锁的 Follow-up Versions 或 Decisions。

## 必做 Architecture Checks

完成任何 Gameplay Implementation 前，回答：

- 此 Behavior 是否可供多个 Content Definition 复用？
- Content 是否位于 Data 中，而不是通过特定 Item Name 的 Conditional 实现？
- State 是否只有一个明确 Owner？
- Rule 是否能在不渲染 Scene 的情况下测试？
- Feature 是否可以 Offline 运行？
- Save 是否使用 Stable ID，而不是 Scene Node Path 或 Display String？
- Asset 缺失或 External Service 不可用时，是否能安全失败？
- 改动是否支持 Input Remapping、Localization 和 Accessibility？
- Multiplayer Authority 和 Synchronization 是明确 Out of Scope，还是已经处理？

## 专题规则所有权

本文件只保留跨领域的执行约束。Agent 必须按 Version 影响范围读取对应专题文档，不得把这些文档的细节复制回 Harness：

| 规则类型 | 唯一 Owner |
| --- | --- |
| Product Behavior 和长期 Scope | `docs/SPEC.md` |
| Domain Term 和 State Ownership | `docs/CONTEXT.md` |
| Module、Dependency Direction 和 External Adapter | `docs/ARCHITECTURE.md` |
| Content Definition、Runtime State、Persistence 和 Migration | `docs/data/DATA_MODEL.md` |
| Asset、Localization、Audio 和 Generated Content Workflow | `docs/CONTENT_PIPELINE.md` |
| Test Strategy 和 Quality Gate | `docs/test/TESTING.md` |
| Build、Release、Security、Privacy 和 Recovery | `docs/OPERATIONS.md` |
| Godot MCP Tooling、Scene/Resource 写入方式和 Debug Loop | `docs/MCP_WORKFLOW.md` |

冲突或跨文档变更必须先更新 `docs/DECISIONS.md`，再更新受影响的 Owner Document。Version 和 Eval 只引用这些规则，不另建一套 Policy。

## Quality Dimensions

每个 Milestone 都必须处理相关维度：

- Correctness 和 Save Integrity。
- Player Comprehension 和 Tutorial Clarity。
- Input Remapping 和 Controller Readiness。
- Localization Readiness 和 Text Expansion。
- Accessibility、Readable Contrast、Motion/Audio Control 和 Non-audio Cue。
- Target Hardware 上的 Performance。
- Deterministic Tests 和 Reproducible Random Behavior。
- Asset Licensing 和 Attribution。
- Network Loss 和 Service Degradation。
- Account、LLM 和 Commerce Data 的 Security/Privacy。

具体 Numeric Budget 必须进入 Accepted Decision 或 Active Version，不得散落为 Magic Constant。

## Definition of Done

Feature 只有满足以下条件才算完成：

- Acceptance Criteria 和关联 Eval 通过。
- Feature 位于 Active Version Scope 内，没有加入 Out-of-scope Behavior。
- Player 能够进入、使用、离开，并在相关情况下 Save、Reload 和从 Error 中 Recovery。
- Content 为 data-driven，并在 Load 时 Validate。
- Runtime State 只有一个 Owner。
- Input 和用户可见文本可配置、可 Localization。
- Automated Tests 覆盖 Core Rule 和 Regression。
- Save Migration 与 Network Contract 在受影响时已更新。
- Placeholder Asset 有明确标记且可替换。
- Documentation 已反映新 Term 和 Decision。
- 未修改无关 Module 或 Protected Project。

## Active Delivery

当前 Active Version 是 `docs/versions/v0.1.0-initial-screen.md`。它是当前 Scope、Non-goals 和 Release Acceptance 的唯一 Owner；本文件不重复版本内容。

后续 Delivery Order 由 `docs/ROADMAP.md` 描述。Roadmap 和 Product Spec 中的未来内容只有进入状态为 `active` 的独立 Version Document 后，才授权 Implementation。
