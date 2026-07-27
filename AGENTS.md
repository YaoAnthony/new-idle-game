# Repository Agent 指南

本仓库当前转为 **Phaser 网页端优先**。Godot 版本暂时暂停，Godot 专属 Harness、Version、Eval 和历史架构文档保留在 `godot/` 内部，只有在明确处理 Godot 客户端时才读取和遵守。

## 必须阅读的入口

规划或实现功能前，依次阅读：

1. `README.md`：当前项目方向和目录职责。
2. `版本期望/整体架构.md`：长期产品愿景。
3. `版本期望/V0.2 - 游戏架构.md`：当前 Web/Phaser 架构草案。
4. 即将修改目录中距离最近的 `AGENTS.md`。
5. `Core/src/` 中已有共享 type，涉及数据结构时优先复用或扩展它们。

不要再默认从 `godot/HARNESS.md` 或 `godot/docs/versions/` 开始规划 Web 客户端工作。那些文件只约束 `godot/` 内部。

## Repository 所有权

- `Frontend/`：当前主要 Phaser + React + Vite 网页游戏客户端。
- `Core/`：前后端共享 TypeScript types、内容注册表数据和轻量数据工具；不得依赖 Phaser、React、Express 或 Godot。
- `Backend/`：身份、Cloud Save、Multiplayer 权威逻辑与传输、LLM Provider 和 Commerce 验证。
- `godot/`：暂停的 Godot 客户端与 Godot 专属文档；除非用户明确要求恢复 Godot，否则不继续扩展。
- `版本期望/`：产品与版本期望草案，作为设计来源，不等于已实现代码。

## 全局约束

- 不得在 gameplay scripts 中 hardcode 内容、物理按键、用户可见文本、Service URL、Balance 数值或 Save Version。
- 本地 Core Loop 必须在无 Login、无网络 Service 时正常运行。
- Client 中不得包含 Secret 或权威在线奖励逻辑。
- Durable State 的变更必须分析 Save 和 Migration 影响。
- 共享在线行为的变更必须分析 Contract 影响。
- 共享数据结构优先放在 `Core/src/types/`，共享注册表数据优先放在 `Core/src/Data/`。
- Phaser、React、Canvas、音频播放和资源加载逻辑属于 `Frontend/`，不要塞进 `Core/`。
- Backend 不得复制一份独立的内容规则；需要校验时读取或引用 `Core` 的类型和注册表。
- 发现无关的既有改动时，只报告，不修改。

## 完成要求

每次实现或文档调整都应报告：

- Player-visible 或 developer-visible 结果。
- Changed Files。
- 执行过的 typecheck/build/test。
- Save、Schema、API 或共享 type 影响。
- Known Limitations。
