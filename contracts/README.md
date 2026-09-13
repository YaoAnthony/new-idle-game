# Shared Contracts

此目录是 Godot Client 与 Backend 共享 Versioned Contracts 的 Source Location。

- `save_schema.json`：**生成物，别手改**。存档的每一片字段归谁、联不联机同步、为什么、什么事件触发落盘、读档顺序——全部从注册表导出（Core `types/saveSlices.ts` + Frontend-3D `Data/Save/registry`）。改了注册表跑 `npm run save-contract`（在 Frontend-3D 下）重生成；`tests/saveContract.test.ts` 对不上就红。
- `api_schema.yaml`：开始实现 Online Endpoint 时定义 HTTP API Contract。
- `multiplayer_protocol.md`：开始实现 Multiplayer 时定义 Command、Event、Authority、Revision 和 Reconciliation。

`api_schema.yaml` 尚未启用。契约文件要么由代码生成、要么随代码同步改，不许只改文档不改代码，也不许反过来。

Contract 变更必须包含 Producer/Consumer 两侧 Validation、Compatibility Notes、Versioning 和 Fixture 更新。Secret 和 Provider-specific Credential 不得进入 Contract。
