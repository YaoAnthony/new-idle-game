# Harness Document Index

## 从这里开始

1. `../AGENTS.md`：强制 Agent 规则。
2. `../HARNESS.md`：完整执行契约。
3. `REQUIREMENTS_ANALYSIS.md`：从原始 README 推导的需求。
4. `SPEC.md`：必须实现的 Product Behavior 和 Scope。
5. `CONTEXT.md`：统一 Domain Language。
6. `DECISIONS.md`：已接受的 Decisions。
7. `versions/`：当前 Active Version 和历史 Release Scope。

## Implementation 指南

- `ARCHITECTURE.md`：Module Ownership、SceneTree、Adapters 和 Failure Behavior。
- `data/DATA_MODEL.md`：Definitions、Runtime State、Stable ID、Transaction 和 Save Migration。
- `CONTENT_PIPELINE.md`：Content、Assets、Localization、Audio 和 LLM Workflow。
- `test/TESTING.md`：Deterministic Tests、Player-flow Evals 和 Quality Gates。
- `OPERATIONS.md`：Build、Release、Security、Privacy、Telemetry 和 Recovery。
- `MCP_WORKFLOW.md`：Godot MCP 的 inspect/edit/run/debug loop、写入规则和降级路径。
- `ROADMAP.md`：按 Dependency 排序的 Milestones。

## Delivery Documents

- `versions/README.md`：Version Lifecycle、Naming 和 Scope Rules。
- `versions/TEMPLATE.md`：Version 必填格式。
- `versions/v0.1.0-initial-screen.md`：Initial Screen Release，包含 Native Adaptive Layout 要求。
- `evals/README.md`：Eval 类型和使用方法。
- `evals/TEMPLATE.md`：Eval 必填格式。

只有状态为 `active` 或 `frozen`、Dependencies 已满足且 Implementation Boundary 明确的 Version 才授权 Implementation。
