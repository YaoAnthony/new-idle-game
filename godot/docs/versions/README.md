# Version Harness

此目录为每个可交付 Version 保存独立 Markdown。Version Document 同时规定 Release Scope、Implementation Boundary 和 Validation；Eval 规定如何验收。

当前 Active Version：`v0.1.0-initial-screen.md`。

## Delivery Hierarchy

```text
Accepted Decision
  -> Active Version
       -> Implementation
            -> Eval
                 -> Release Evidence
```

Roadmap 只说明长期顺序，不能代替 Version Document。只有状态为 `active` 或 `frozen` 且 Dependencies 已满足的 Version 才能授权 Implementation。

## Naming

使用 Semantic Version 风格：

```text
vMAJOR.MINOR.PATCH-short-name.md
```

例如：

```text
v0.1.0-initial-screen.md
v0.2.0-top-down-room.md
v0.2.1-camera-fix.md
```

Pre-release 阶段：

- `MINOR` 表示新的可观察能力或 Vertical Slice。
- `PATCH` 表示不扩展 Scope 的 Fix、Polish 或 Compatibility Change。
- `MAJOR` 留给 Product Contract 或 Save/Network Compatibility 的重大变化。

## Status

- `planned`：已定义方向，但不是当前 Delivery Target。
- `active`：当前正在实现的 Version。
- `frozen`：Scope 已锁定，只接受满足 Release 的 Fix。
- `released`：Acceptance 和 Eval 已完成，并有 Release Evidence。
- `superseded`：被后续 Version 替代，但保留历史记录。

同时只能有一个主要 `active` Version。并行 Patch Version 必须有明确理由。

## Version Document 必填内容

- Goal 和 Player-visible Outcome。
- Dependencies 和 Blocker。
- Scope 和 Non-goals。
- User Flow。
- UI、Data、State、Save、Asset 和 External-service Impact。
- Compatibility 与 Migration Impact。
- Implementation Boundary 和 Validation。
- Required Eval。
- Release Acceptance。
- Known Limitations。

## Scope Rules

- Version Scope 必须比 Product Spec 小，而且可以独立验收。
- Implementation 不能加入 Version 未声明的 Feature。
- 新需求先决定进入当前 Version、未来 Version 或明确拒绝。
- `frozen` 后不能加入新 Feature，只能修复 Release Blocker。
- `released` 后不得重写历史 Scope；更正说明应标注日期和原因。

新 Version 使用 `TEMPLATE.md`。
