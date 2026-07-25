# Dependency-ordered Roadmap

本 Roadmap 描述 Delivery Order，不代表 Calendar Date。每个 Milestone 在 Implementation 前，都必须成为可独立验收的 Version Document。

Latest Released Version：`v0.1.0 Initial Screen`。Current Active Version：无。

Roadmap 中的未来 Version Number 都是 Provisional，只有创建独立 Version Document 后才正式生效。

## M0：Harness 和 Decisions

Outcome：所有 Agent 共享 Product Language、Architecture Constraint、Version Format 和 Validation Expectation。

- Review 并接受 Harness Documents。
- Godot `4.7.1.stable.steam` Executable 已定位并验证。
- 确认 `v0.1.0` 使用的 Headless Validation Command。
- 将 Target Platform、Art/Map Authoring 和 Content-definition Format Decision 延后到真正依赖它们的 Future Version。
- 在需要它们的 Active Version 中创建 Project Ignore 和 Development Configuration；Export/Signing 延后到明确要求 Distribution 的 Version。

Exit Criteria：Version Document 可以写明具体 Command、Dependency、Implementation Boundary 和 Acceptance Criteria，无需自行猜测 Architecture。

## v0.1.0：Initial Screen

Outcome：Godot Project 启动后显示一个非空、可适配 Desktop Window、Fullscreen、HiDPI 和不同 Aspect Ratio 的 Initial Screen/Main Menu Shell。

Delivery Definition：`versions/v0.1.0-initial-screen.md`。本 Roadmap 只记录顺序，不复制 Scope 或 Acceptance。

Exit Criteria：`versions/v0.1.0-initial-screen.md` 的 Release Acceptance 全部通过。

## Future v0.2.0：Top-down 2D Foundation（Provisional）

Outcome：Local App 进入一个 Test Room，并支持可靠 Movement 和 Interaction。

- App Root 和 Scene Composition。
- InputMap Action 和 Remapping-ready Input。
- Test Room、Player Movement、Collision、Depth Sorting 和 Camera。
- Interaction Target Selection 和一个 Test Interactable。
- Settings/Profile 分离和 Audio Bus Skeleton。
- Headless Project/Scene Checks 和 Baseline Diagnostics。

Exit Criteria：Player 可以进入 Test Room、移动、碰撞、Target 一个 Object、Interaction、Pause 和 Exit，且没有 Error。

## Future v0.3.0：First Core-loop Vertical Slice（Provisional）

Outcome：一条完整 Action-to-reward-to-save Loop 可玩。

- Minimal Item Definition 和 Inventory Transaction Module。
- Furniture Definition 和 Placement Flow。
- Basic Workbench Capability 和一个 Recipe。
- 一件 Crafted Furniture 解锁一个 Action。
- 通过 Injectable Clock 运行 Action Timer。
- 只实现 Vertical Slice 所需的 Hunger/Fatigue Field。
- 一个 Reward Branch。
- Versioned Local World Save、Backup、Load 和 Corruption Handling。
- First Playable Eval。

Exit Criteria：Start、Place Workbench、Craft/Place Furniture、Complete Action、Use Reward、Save、Quit、Reload，并观察一致 State。

## Future Milestone：First-day Narrative Slice

Outcome：用有限 Content Breadth 实现设计中的 First-day Onboarding。

- data-driven Event Sequencing 和 Tutorial Cue。
- 通过 Seeded Definition 选择 Starting Region/House。
- Initial Pet Encounter、Need、Dialogue、Gift 和 Hidden Affection Stage。
- 扩展 Action Category 和 Guaranteed Progression Reward。
- Minimal Cooking Flow、Hunger Recovery 和 Food Consumption。
- Sleep、Next-day Progression、Pet Return 和 Mother Call。
- Daily-task Machine Unlock State，但暂不扩展完整 Daily Content。

Exit Criteria：New Player 可以完成 First Day、理解 Core Loop、在支持的 Checkpoint Save/Reload，并进入可重复 Home Loop。

## Future Milestone：Sustainable Home Loop

Outcome：游戏支持重复 Day 和 Content Expansion，不需要为每个 Definition 添加 Generic Code。

- 多个 Item、Recipe、Furniture Capability 和全部四种 Action Category。
- Storage Inventory 和 Station Query。
- Expanded Cooking、Quality 和明确 Expiration Policy。
- Weather 和 Dynamic Soundscape。
- Pet Need、Behavior、Dispatch 和 Growth。
- Plant、Pot、Compost 和 Fertilizer。
- Daily-task Generation 和 Reward Economy。
- House Decoration 和 Expansion Foundation。
- Balance/Content Validation Tools。

Exit Criteria：经历多个 In-game Day 后，Gameplay 仍易理解、可恢复，并在 Save/Load 和 Content Validation 下维持经济功能。

## Future Milestone：Identity 和 Cloud

Outcome：Local Player 可以选择绑定 Identity 并 Synchronize World。

- Account/Auth Contract 和 Backend Implementation。
- 仅在 Online Feature 需要时加入 Godot Login/Account UI。
- Guest-to-account Migration。
- Cloud Save Revision、Conflict Resolution、Quota 和 Recovery。
- Friend/Profile Prerequisite。

Exit Criteria：Local Play 保持可用；Authenticated Player 可以 Upload/Download，且不会 Silent Data Loss。

## Future Milestone：Multiplayer Visits

Outcome：Host 可以开放一个 World，Friend 在明确 Permission 下访问。

- Authority 和 Reconciliation Decision。
- Versioned Multiplayer Command/Event Protocol。
- Room/Session Lifecycle 和 Reconnect Behavior。
- Host World Upload、Start 和 Finalization。
- Visitor Movement、Presence、允许的 Furniture/Station Use 和 Pet Dialogue。
- Shared Daily Progress 和 Friendship Stamp。
- 按 Policy 禁止 Story Progression。
- Network Loss、Duplication 和 Conflict Evals。

Exit Criteria：Supported Mutation 在 Disconnect/Reconnect 后保持一致，且不能 Duplicate Inventory 或 Reward。

## Future Milestone：Narrative Generation 和 Commerce

Outcome：Optional External Feature 增加价值，但不控制 Core Progression。

- Camera/Photo Capture Context 和 LLM Image/Narrative Pipeline。
- Letter Generation 和 Response Workflow。
- Moderation、Privacy、Fallback、Cache 和 Cost Control。
- Commerce Platform Decision、Catalog、Entitlement、Verification、Restore、Refund 和 Offline Behavior。

Exit Criteria：External Failure 可 Gracefully Degrade；Authoritative Reward 和 Save 保持有效；Privacy/Security Review 通过。

## Dependency Rule

不能因为 Later Milestone 的 Folder 已存在就提前实现。只有直接 Dependencies 和 Required Decisions 完成、对应 Version 进入 `active` 后，Implementation 才能开始；唯一例外是 Version 明确声明为 Disposable Prototype，且不能进入 Production Code。
