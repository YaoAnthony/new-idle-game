# Godot Agent 指南

此目录包含主要的 Godot 游戏客户端。所有实现 Agent 必须遵循本文件和 `HARNESS.md`。

## 必须阅读的顺序

1. 阅读仓库根目录 `README.md`，了解原始游戏愿景。
2. 阅读 `HARNESS.md`，了解完整执行契约。
3. 阅读 `docs/versions/` 下当前 `active` Version。
4. 涉及 Scene、Resource、Project Setting、运行调试或 Screenshot 时，阅读 `docs/MCP_WORKFLOW.md`。
5. 只读取该 Version 链接的相关 Domain Documents 和 Eval。
6. 提出改动前，检查现有 Implementation 和 Tests。

如果 Active Version 与 `docs/DECISIONS.md` 冲突，停止并报告冲突，不得静默覆盖已接受的 Decision。

## 受保护范围

- `Frontend/` 不属于 Godot 实现范围，不得修改。
- Active Version 未明确授权时，不得移动、删除或重写用户创建的 Asset。
- Active Version 未明确包含 Backend 工作时，不得添加 Backend 行为。
- Godot Client 中不得保存 Secret、API Key、Payment Credential 或 LLM Credential。

## Work Loop

每个 Version 的 Implementation 都必须：

1. 确认 Version 状态为 `active` 或 `frozen`，且 Dependencies 已完成。
2. 说明 Assumptions，并识别受影响的 State、Scene、Data、Save 和 Tests。
3. 实现满足 Acceptance Criteria 的最小完整 Vertical Slice。
4. 保持 gameplay rules 为 data-driven。不得在 scene scripts 中 hardcode 内容、Input Key、用户可见文本、Service URL、Balance 数值或 Save Version。
5. 先运行 Targeted Tests，再运行 Version 定义的完整 Validation 和 Required Eval。
6. Validation 失败时先 Diagnose，再继续修改。
7. 报告修改文件、Validation 结果、剩余风险和 Migration 影响。

## Architecture 规则

- 除非 `docs/DECISIONS.md` 被正式修改，游戏保持 top-down 2D。
- Gameplay 按 Feature 放在 `features/` 下；Scene、Script 和 Feature-specific Assets 应彼此靠近。
- 可复用静态 Definitions 放在 `data/`，可序列化 Runtime State 放在 `state/`，外部 Adapters 放在 `infrastructure/`。
- UI 可以提交 Action Request 和渲染 State，但不能拥有 gameplay rules、直接写 Save File 或直接调用 Backend Endpoint。
- 内容和 Saved Entity 使用 Stable ID，Display Name 绝不作为 ID。
- 本地 Single-player 必须在无 Login、Cloud Service、Multiplayer、LLM 或 Payment Service 时运行。
- 只有 State 必须跨 Scene 存活且拥有明确全局所有权时，才可添加 Autoload。

## Version 纪律

- 一个 Version 必须有一个可独立验收的主要 Player-visible Outcome。
- Implementation 不得扩展 Active Version 的 Scope。
- 不得因为存在扩展 Seam，就提前实现未来 Roadmap 内容。
- 新 Gameplay Concept 必须更新 `docs/CONTEXT.md`。
- 新 Architecture Decision 必须更新 `docs/DECISIONS.md`。
- Save Shape 变更必须包含 Migration Plan 和 Save Compatibility Tests。
- Network Contract 变更必须更新 `/contracts/`。

## Definition of Done

只有在 Acceptance Criteria 和 Required Eval 通过、相关 Automated Tests 通过、Error State 被处理、内容未被 hardcode、Save Compatibility 已处理、Documentation 已更新，且没有修改无关文件时，Version Implementation 才算完成。
