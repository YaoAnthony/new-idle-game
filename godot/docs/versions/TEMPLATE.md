# vX.Y.Z：Version Name

Status：planned

Owner：unassigned

Target：未设定日期

## Goal

用一句话描述该 Version 带给 Player 或 Developer 的新能力。

## Player-visible Outcome

描述启动后或完成 Flow 后可以直接观察到的结果。

## Why This Version

说明它验证的 Product Assumption、Architecture Seam 或 Delivery Risk。

## Dependencies 和 Blocker

- 开始 Implementation 前必须满足的 Tool、Decision、Asset、Contract 或前置 Version。
- 无 Blocker 时明确写“无”。

## User Flow

1. Starting State。
2. Player Action。
3. Visible Result。
4. Exit 或 Recovery。

## In Scope

- Version 必须包含的 Behavior。

## Out of Scope

- 明确排除的相邻 Feature。

## UI 和 Asset Contract

- 当前 UI Structure。
- Placeholder Policy。
- Future Asset Replacement Seam。
- Localization、Input 和 Accessibility Requirement。

## Data 和 State Impact

- Definition。
- Runtime State Owner。
- Save/Migration。
- Time/Randomness。

## External Impact

- Backend/API。
- Multiplayer。
- LLM/Commerce。
- Platform/Build。

## Implementation Boundary

- 允许修改的 Module、Scene、Data、Contract 和 Configuration。
- 明确禁止的相邻 Module 和 Future Stub。

## Validation

- Automated Command。
- Manual/Visual Check。
- Required Evidence。

## Risks 和 Rollback

- 主要 Failure Mode、预防手段和可恢复的 Rollback Path。

## Required Evals

- 链接 `docs/evals/` 中负责 Release Acceptance 的 Eval。

## Release Acceptance

- [ ] Player-visible Outcome 达成。
- [ ] Required Evals 通过。
- [ ] 无 Release-blocking Error。
- [ ] Documentation 和 Release Evidence 完整。
- [ ] 未加入 Out-of-scope Feature。

## Known Limitations

- Release 后仍然存在、但不阻止当前 Goal 的限制。

## Release Evidence

Release 前保持为空。记录 Build/Commit、Validation、Screenshot/Log、Known Issues 和 Release Date。
