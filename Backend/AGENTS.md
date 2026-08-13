# Backend Agent 指南

Backend 用于支持可选的在线能力和权威操作，不拥有离线 Core Loop。

## 必须阅读的 Context

1. 仓库根目录的 `AGENTS.md` 和 `README.md`。
2. `contracts/multiplayer_protocol.md` —— 人读的协议语义与生命周期。
3. **`Core/src/types/net.ts`** —— 消息形状的**唯一真相源**，客户端和服务端 import 的是同一个文件。协议改动两边同步改。
4. `Core/src/types/` 和 `Core/src/Data/` 中与当前工作相关的共享数据结构。

`old/` 里的设计草案（含 `整体架构.md`、`V0.2 - 游戏架构.md`）是历史档案，**不是规格**，其中一部分已经过期。需要设计意图时可以查，但冲突一律以代码为准。

## Backend 所有权

Backend 可以拥有：

- Authentication、Authorization、Account Binding 和安全 Session。
- Cloud Save 存储、Revision、Conflict、Quota 和 Recovery。
- Multiplayer Room、Authority、Validation 和 Reconciliation。
- LLM Prompt、Provider Credential、Moderation、Fallback、Cache 和 Cost Control。
- Purchase Verification、Entitlement、Idempotency、Restore 和 Refund。

除非存在明确的 Server Authority 要求和共享 Contract，否则 Backend 不得复制通用的 Item、Recipe、Pet、Event 或 Progression 规则；优先引用 `Core` 的共享 type 和注册表数据。

## 工作规则

- 在版本化 Contract 和 Acceptance Tests 定义完成前，不得实现 Endpoint。
- 验证所有 Client Input，并对每个玩家拥有的资源执行 Authorization。
- Secret 必须存放在 Environment 管理的配置中；仅可提交不含真实值的 Example。
- Durable Grant、Purchase、Retry、Webhook 和 Multiplayer Command 必须具备 Idempotency。
- Persistent Storage 变更必须使用 Migration。
- Payload 必须有界，并具备 Timeout、Rate Limit 和明确的 Error Category。
- 不得记录 Token、支付信息、不受限的玩家文本、私人照片或完整 LLM Prompt。
- Backend 不可用时，必须保留有效的离线行为。
- 不得把 Phaser、React 或浏览器渲染逻辑放进 Backend。

## Validation

每个包含 Backend 工作的 Version 必须说明 Unit、Integration 和 Contract Tests、失败与 Retry 场景、Migration 影响、Security/Privacy 影响，以及 Web 客户端的 Offline/Fallback 行为。
