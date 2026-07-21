# Testing 和 Evaluation

Testing 保护 Game Rule 和 Save Integrity；Eval 保护 Player Experience。两者都不可缺少。

## Test Layers

### Definition Validation

每次 Content 变更时运行。验证 ID、Reference、Localization、Resource、Range、Recipe Reachability、Event Prerequisite、Fallback Content，以及被 Fixture 使用的 Removed ID。

### Unit Tests

无需渲染 Scene 即可对 Rule 进行 Deterministic Test：

- Inventory Capacity 和 Atomic Transaction。
- Recipe Visibility、Craftability、Consumption 和 Output。
- 可与 Physics 分离的 Furniture Placement-rule Calculation。
- Action Availability、Cost、Timer State、Completion、Cancellation 和 Reward。
- Hunger/Fatigue Constraint。
- Pet Preference、Affection Transition、Need 和 Dispatch Resolution。
- Event Condition/Effect 和 Replay Policy。
- 使用 Fixed Input 的 Time Progression、Weather Selection 和 Random Table。
- Save Snapshot Validation 和 Migration Step。

### Scene Tests

验证 Reusable Scene 可以 Load、Required Child Capability 存在、Signal 正确连接、Collision/Navigation Configuration 存在，以及 Optional Asset 缺失时安全 Fallback。

UI Scene Tests 还必须覆盖关键 Control 的 test role、Viewport 内位置、Container 类型、spacing、min size、重叠、初始 modal 可见性和 resize 后稳定性。`v0.1.0` 使用 `tests/integration/test_v0_1_initial_screen_layout.gd` 检查 Initial Screen 是否位于预设区域。

### Integration Tests

测试 Feature Seam：

- Inventory + Crafting + Save/Reload。
- Room + Placement + Navigation/Collision。
- Furniture Capability + Action Unlock。
- Action Completion + Reward Transaction + Event Trigger。
- Pet Request + Item Transfer + Affection/Event Effect。
- Sleep + Day Advancement + Queued Event。
- Settings/Profile 与 World Save 分离。
- Network Adapter Failure 后 Local State 保持一致。

### End-to-end Evals

执行 `docs/evals/` 中定义的完整 Player Flow。可以组合 Automated Setup/Assertion 与 Manual Visual/Usability Check。

## Determinism Requirements

Tests 必须能够注入：

- Fixed Game、Session、Real 和 Network Clock。
- Seeded 或 Scripted Random Outcome。
- In-memory Save Repository。
- Fake Backend/Auth/Cloud/Multiplayer/LLM/Commerce Adapter。
- Small Content Catalog 和 Save Fixture。

Tests 不得等待 Production-duration Timer，也不得依赖 External Service。

## Save Test Matrix

每个 Supported Save Version 都需要：

- Valid Load。
- Save/Load Round Trip。
- Migration 到 Current Version。
- 支持情况下的 Missing Optional Field。
- Unknown 或 Removed Definition Reference。
- Corrupt/Truncated File Recovery。
- Newer Unsupported Version Behavior。
- Interrupted/Failed Write 时保留 Last-known-good Data。
- 重复 Load/Save 后无 Duplication 或 Drift。

## Top-down 2D Test Matrix

- 所有 Mapped Direction 的 Movement。
- 与 Room 和 Furniture 的 Collision。
- Entity 上下方的正确 Depth Ordering。
- Interaction 选择正确 Nearby Target。
- Candidate Overlap 时，Interaction Target 可预测地切换。
- Camera 保持在 Room Constraint 内。
- Placement Preview 与 Committed Placement 一致。
- Invalid Placement 无法阻断 Required Path 或重叠禁止 Geometry。
- Save/Reload 保留 Stable Position 和 Placement。
- Resolution/Aspect 改变后 Required UI 仍可见。

## Version-specific Checks

具体 Viewport、Player Flow、Assertion 和 Evidence 由对应 Eval Document 拥有，不在 Test Strategy 中重复。当前 Version 使用 `evals/000-v0.1.0-initial-screen.md`，Release Gate 以 `versions/v0.1.0-initial-screen.md` 为准。

## UI 和 Accessibility Checks

- Keyboard/Mouse Navigation 和 Remapped Action。
- 引入 Control 后的 Future Controller Focus Path。
- Long Localized Text、Missing Translation 和 Font Fallback。
- UI Scaling 和 Supported Window Size。
- Contrast/Readability，以及不只依赖 Color 的 State 表达。
- 必要时，Important Audio Event 提供 Visual 或 Text Alternative。
- 引入 Reduced-motion Setting 后，Motion/Camera Effect 必须遵守。
- Error 说明 Recovery 方法，但不暴露 Internal Detail。

## Audio Checks

- 各 Audio Bus Control 独立 Persist。
- Soundscape Layer 平滑进入和退出，不突然重复。
- 多个 Furniture/Pet 遵守 Concurrency Limit。
- Mute Bus 不改变 Gameplay State。
- Missing Audio 使用 Silence/Fallback，不产生 Error。

## Online Adapter Checks

- Timeout、Bounded Retry、Cancellation 和 Offline Fallback。
- Unauthorized 和 Expired Session。
- Cloud Revision Conflict 保留双方可恢复 State。
- Duplicate Network Message 具备 Idempotency。
- Mutation 中 Disconnect 不重复或丢失 Authoritative Item。
- LLM Timeout、Moderation 或 Provider Error 返回 Fallback Content。
- Purchase Retry/Webhook Duplication 不重复 Entitlement。

## Performance Checks

Target Platform 确定后再记录 Budget。Harness 应支持测量：

- Representative Furnished Room 的 Frame Time。
- Furniture/Pet 增加时的 Node 和 Draw-call Growth。
- Scene Transition 和 Initial Load Duration。
- Long-running Fixture 的 Save/Load Duration 和 Size。
- Audio Layer Count 和 Memory。
- Multiplayer Fixture 中的 Network Latency 和 Message Rate。

Performance Work 必须先有 Reproducible Fixture 和 Measurement，再做 Optimization。

## Quality Gates

Version Implementation 不能只凭 Screenshot 或 Manual Statement 完成。必须使用适用范围内最强的组合：Definition Validation、Automated Rule Tests、Scene/Integration Checks 和 Player-flow Eval。

任何 Known Failing Test 都必须说明为 Pre-existing 且与当前改动无关，或在 Scope 内修复。不得通过删除或弱化 Test 来完成 Version。
