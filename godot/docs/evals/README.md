# Evaluation Harness

Eval 描述完整且可观察的 Flow。它通过检查 Player 是否能理解并完成目标 Experience，补充 Unit 和 Integration Tests。

Eval 可以是 Automated、Manual 或 Hybrid，但必须说明 Setup、Control、Observation、Assertion、Failure Evidence 和 Cleanup。

每个 Release Eval 必须引用一个 Version，并直接覆盖该 Version 的 Release Acceptance。

## Eval Categories

- Core Loop：Action、Reward、Spending 和 Progression。
- Save Integrity：Save、Quit、Reload、Migration 和 Corruption Recovery。
- Top-down Interaction：Movement、Collision、Targeting、Placement 和 Camera。
- First-day Onboarding：Tutorial Clarity 和 Event Progression。
- Accessibility/Localization：Remapping、Text Expansion 和 Audio Alternative。
- Degraded Service：Offline、Timeout、Conflict 和 Moderation Fallback。
- Multiplayer：Authority、Disconnect、Duplicate Prevention 和 Reconciliation。
- Performance：Representative Room/Save/Network Fixture。

每个 Eval 使用 `TEMPLATE.md`。Milestone Exit 必须链接一个或多个 Eval File。
