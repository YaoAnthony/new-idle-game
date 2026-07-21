# Backend Agent 指南

Backend 用于支持可选的在线能力和权威操作，不拥有离线 Core Loop。

## 必须阅读的 Context

阅读仓库根目录的 `AGENTS.md`、`godot/HARNESS.md`、Active Version，以及 `godot/docs/SPEC.md`、`godot/docs/ARCHITECTURE.md`、`godot/docs/data/DATA_MODEL.md`、`godot/docs/OPERATIONS.md` 中与该 Version 相关的部分。

## Backend 所有权

Backend 可以拥有：

- Authentication、Authorization、Account Binding 和安全 Session。
- Cloud Save 存储、Revision、Conflict、Quota 和 Recovery。
- Multiplayer Room、Authority、Validation 和 Reconciliation。
- LLM Prompt、Provider Credential、Moderation、Fallback、Cache 和 Cost Control。
- Purchase Verification、Entitlement、Idempotency、Restore 和 Refund。

除非存在明确的 Server Authority 要求和共享 Contract，否则 Backend 不得复制通用的 Item、Recipe、Pet、Event 或 Progression 规则。

## 工作规则

- 在版本化 Contract 和 Acceptance Tests 定义完成前，不得实现 Endpoint。
- 验证所有 Client Input，并对每个玩家拥有的资源执行 Authorization。
- Secret 必须存放在 Environment 管理的配置中；仅可提交不含真实值的 Example。
- Durable Grant、Purchase、Retry、Webhook 和 Multiplayer Command 必须具备 Idempotency。
- Persistent Storage 变更必须使用 Migration。
- Payload 必须有界，并具备 Timeout、Rate Limit 和明确的 Error Category。
- 不得记录 Token、支付信息、不受限的玩家文本、私人照片或完整 LLM Prompt。
- Backend 不可用时，必须保留有效的离线行为。
- 不得修改 `Frontend/`。

## Validation

每个包含 Backend 工作的 Version 必须说明 Unit、Integration 和 Contract Tests、失败与 Retry 场景、Migration 影响、Security/Privacy 影响，以及 Godot 的 Fallback 行为。
