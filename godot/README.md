# Godot Game Client

此目录保留暂停中的 Godot 客户端、Godot 专属 Harness、历史 Version、Eval 和实现文档。

当前仓库默认实现方向已经切换为 `Frontend/` 的 Phaser 网页端。除非用户明确要求恢复或维护 Godot 客户端，不要把新功能默认实现到这里。

游戏愿景仍然相同：将现实中的专注 Action 映射为魔法生活反馈，完成 Action 后获得 Resource，再将 Resource 用于生存、Pet、Crafting 和 Home Decoration。

## Documentation 入口

- `AGENTS.md`：Implementation Agent 必须遵守的规则。
- `HARNESS.md`：完整 Development Harness 和执行流程。
- `docs/README.md`：专题文档、Version 和 Eval 的完整索引。

这些文档只约束 `godot/` 内部。Web/Phaser 客户端工作应从仓库根目录 `AGENTS.md` 和 `README.md` 开始。
