# Accepted Decisions

这是 Lightweight Decision Log。当 Decision 会改变 Architecture、Data Ownership、Persistence、External Contract 或长期 Implementation Guidance 时，在这里新增条目。

## D-001：Godot 是 Primary Game Client

Status：Accepted。

可玩的游戏实现在 `godot/`。`Backend/` 提供 Online 和 Authoritative External Service。`Frontend/` 受保护，也不是第二套 Gameplay Implementation。

## D-002：初始 Presentation 为 top-down 2D

Status：Accepted。

初始 World 使用 2D Movement、Collision、Navigation、Depth Ordering、Camera 和 Room Interaction。Art Style、Tile Size、Camera Zoom 与 Placement Grid 尚未决定，不得作为 Architecture Assumption 写入代码。

## D-003：Godot Client 按 Feature 组织

Status：Accepted。

Gameplay Scene、Script 和 Feature-specific Asset 放在 `features/` 下。Shared Definition 使用 `data/`；Serializable State 使用 `state/`；External Adapter 使用 `infrastructure/`；Cross-feature UI 使用 `ui/`。

## D-004：Gameplay Content 为 data-driven

Status：Accepted。

Item、Recipe、Furniture Capability、Action、Reward、Pet、Event、Weather、Region、Dialogue Reference 和 Audio Condition 都由 Definition 描述，并由可复用 Implementation 加载。Display String、Balance Value、Input Key 和 Content-specific Branch 不属于 Generic Gameplay Script。

## D-005：Local Single-player 优先于 Account 和 Cloud Feature

Status：Accepted。

New Game、Continue、Core Loop 和 Local Save 必须在无 Login 时运行。只有 Cloud Save、Friend、Multiplayer、Cross-device Access 或 Purchase 需要 Identity 时，才引入 Authentication。

## D-006：Player Profile、World 和 Session 是独立 State Domain

Status：Accepted。

Profile Preference、Durable World Progression 和 Temporary Session/Network State 拥有不同 Ownership 和 Persistence，不得放入一个无差别的 Global Object。

## D-007：Save 是 Repository Seam 后方的 Versioned Snapshot

Status：Accepted。

Gameplay Code 通过 Persistence Interface 请求 Save/Load。Local 和未来 Cloud Adapter 实现此 Interface。Save 使用 Stable ID、Atomic Write、Backup/Recovery 和 Migration；Live Node 与 Display Name 不作为 Persistence Identity。

## D-008：Time 和 Randomness 是可替换 Dependency

Status：Accepted。

Game Time、Real Time、Action Timer、Weather、Loot、Region/House Selection 和 Dispatch Randomness 必须在 Test 中通过可控 Clock 和 Random Interface 获得 Deterministic Behavior。

## D-009：Multiplayer 使用 Host-owned World 和 Explicit Authority

Status：Provisional，等待 Multiplayer Design Decision。

Host 选择一个 World Save 进入 Session。Main Story 默认不推进。Durable Mutation 必须有明确 Validation 和 Conflict Rule。Network 同步 Stable ID 与 Domain Command/Event，而不是 Raw SceneTree。

## D-010：Backend 拥有 Secret 和 Authoritative External Operation

Status：Accepted。

LLM Provider Call、Prompt Template、Moderation、Payment Verification、Account Credential 和 Authoritative Online Grant 留在 Backend。Godot 通过 Contract 接收有界 Result，并在 Service 不可用时 Gracefully Degrade。

## D-011：第一个 Gameplay Implementation 是 Vertical Slice

Status：Accepted。

第一个 Gameplay Implementation 必须是 Vertical Slice。First Playable Path 为：进入一个 Test House，移动和交互，放置 Workbench，制作并放置一件 Furniture，解锁并完成一个 Action，获得并使用一个 Reward，然后 Save/Reload。该路径可靠后再增加 Breadth。

## D-012：User-facing Content 必须 Localization-ready

Status：Accepted。

UI Label、Item Name、Dialogue、Error、Tutorial 和 Generated-content Fallback 使用 Localization Key 或 Localized Content Data。Internal ID 保持 Language-neutral 和 Stable。

## D-013：Numeric Performance 和 Balance Budget 需要明确 Decision

Status：Accepted。

Harness 规定 Configuration 的位置，但不擅自设定 Target FPS、Save-slot Count、Tile Size、Action Duration Limit、Hunger Rate 或 Platform Budget。这些值必须通过 Focused Decision 或 Active Version 确定，并进入 Data/Configuration。

## D-014：v0.1.0 只交付 Initial Screen

Status：Accepted。

Decision：第一个 Version 限定为可交互的 Initial Screen/Main Menu Shell，包含 Home Background、艺术字风格 Title、四个基础 Menu Button、空 Placeholder Panel、Back Flow、Quit Flow 和 fade-in。它不作为 Gameplay Vertical Slice。

Rationale：先验证 Project Entry、Presentation Shell、基础 UI Interaction 和运行反馈链路，避免在工具链尚未验证时扩展 Gameplay Scope、Save Scope 或 Online Scope。准确 Scope、Non-goals 和 Release Acceptance 只在 `versions/v0.1.0-initial-screen.md` 中维护。

## D-015：Godot MCP 是 Tooling Layer

Status：Accepted。

Decision：Godot MCP 用于 inspect、edit、run、debug 和 screenshot feedback loop，但不定义 Product Scope。默认 MCP Server 为 `@coding-solo/godot-mcp`，默认 Godot Executable 为已验证的 Steam Godot `4.7.1.stable.steam.a13da4feb`。

Rationale：MCP 可以减少手写 `.tscn`、`.tres` 和 `project.godot` 的风险，并让 Agent 更快获得运行反馈。但 MCP 失效不应阻塞项目；每个 Version 仍必须保留 Godot CLI 和 Manual Eval 降级路径。具体使用规则由 `MCP_WORKFLOW.md` 维护。
