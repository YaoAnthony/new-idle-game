# Shared Contracts

此目录是 Godot Client 与 Backend 共享 Versioned Contracts 的 Source Location。

- `save_schema.json`：开始实现 Persistence 时定义 Save Envelope 和 Schema。
- `api_schema.yaml`：开始实现 Online Endpoint 时定义 HTTP API Contract。
- `multiplayer_protocol.md`：开始实现 Multiplayer 时定义 Command、Event、Authority、Revision 和 Reconciliation。

当前 Contract 文件有意保持为空。相关 Version 尚未解决 Ownership、Compatibility 和 Acceptance Criteria 前，不得提前猜测完整 Schema。

Contract 变更必须包含 Producer/Consumer 两侧 Validation、Compatibility Notes、Versioning 和 Fixture 更新。Secret 和 Provider-specific Credential 不得进入 Contract。
