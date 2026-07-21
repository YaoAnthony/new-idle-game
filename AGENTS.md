# Repository Agent 指南

本仓库包含 Godot 游戏客户端、用于可选在线能力的 Backend、共享 Contracts，以及受保护的现有 Frontend。

## 必须阅读的入口

规划或实现游戏功能前，依次阅读：

1. `README.md`：原始游戏愿景。
2. `godot/HARNESS.md`：完整的产品与工程执行契约。
3. 即将修改目录中距离最近的 `AGENTS.md`。
4. `godot/docs/versions/` 下当前状态为 `active` 的 Version。

不能仅根据 Roadmap 开始实现。Roadmap 项目必须先成为独立 Version，并包含明确 Scope、Dependencies、Implementation Boundary、Acceptance Criteria 和 Validation。

## Repository 所有权

- `godot/`：主要的 top-down 2D 游戏客户端和离线玩法。
- `Backend/`：身份、Cloud Save、Multiplayer 权威逻辑与传输、LLM Provider 和 Commerce 验证。
- `contracts/`：Godot 与 Backend 共享的版本化 Contracts。
- `Frontend/`：受保护；除非用户明确改变此要求，否则不得修改。
- `README.md`：用户拥有的原始设计来源；保留其意图和无关改动。

## 全局约束

- 不得在 gameplay scripts 中 hardcode 内容、物理按键、用户可见文本、Service URL、Balance 数值或 Save Version。
- 本地 Core Loop 必须在无 Login、无网络 Service 时正常运行。
- Client 中不得包含 Secret 或权威在线奖励逻辑。
- Durable State 的变更必须分析 Save 和 Migration 影响。
- 共享在线行为的变更必须分析 Contract 影响。
- Implementation 不得加入 Active Version 未声明的 Feature。
- 没有明确 Active Version 授权时，不得以“清理”为由删除、移动或改用用户文件。
- 发现无关的既有改动时，只报告，不修改。

## 完成要求

遵循 `godot/HARNESS.md` 及最近一级 `AGENTS.md` 中的 Work Loop 和 Definition of Done。
