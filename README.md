# new-idle-game

当前实现方向：**先用 Phaser 做网页端游戏客户端**。

这是一个温暖的 top-down 2D 魔法生活/挂机游戏。玩家在出租屋中完成现实 Action，获得资源，再把资源用于生存、宠物关系、工作台制作、家具装饰、音乐和声景。

## 当前技术方向

- `Frontend/`：主要 Web 客户端，使用 React + Vite + Phaser。
- `Core/`：共享 TypeScript types 和内容注册表数据，供 Frontend 与 Backend 使用。
- `Backend/`：可选在线能力，包括账号、Cloud Save、Multiplayer、LLM 和 Commerce。
- `godot/`：暂停的 Godot 客户端与 Godot 专属文档。除非明确恢复 Godot，不再作为默认实现目标。
- `版本期望/`：产品愿景和版本草案。

## 当前开发入口

实现功能前优先看：

1. `AGENTS.md`
2. `版本期望/整体架构.md`
3. `版本期望/V0.2 - 游戏架构.md`
4. `Core/src/types/`
5. `Core/src/Data/`

Godot 专属 Harness、Version、Eval 和 MCP 文档都在 `godot/` 内部，只在处理 Godot 客户端时使用。
