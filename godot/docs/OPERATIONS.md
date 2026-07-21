# Build、Release、Security 和 Operations

本文档定义所有准备进入 Production 的 Version 必须考虑的事项。Target Platform 和 Deployment Environment 选定后，再添加具体 Platform Command。

## Environments

明确区分 Development、Test/Staging 和 Production Configuration。Service URL、Feature Availability、Logging、Analytics 和 Credential 由 Environment Configuration 管理，不能成为 Gameplay Constant。

Godot Client 中不存在可复用的 Production Secret。除不含真实值的 Documented Example 外，不提交 Backend Environment File。

## Versioning

按需要独立追踪：

- Game/Client Version。
- Save Format Version。
- Content Catalog Version。
- HTTP API Version。
- Multiplayer Protocol Version。
- LLM Prompt/Template Version。

每次 Release 记录这些 Version 之间的 Compatibility Expectation。

## Build Reproducibility

- Pin Engine、Dependency 和 Addon Version。
- 引入 Export Preset 和 Platform Requirement 后保持 Documentation。
- Release 前从 Clean Checkout 在 CI 中生成 Build。
- 确认 Generated/Import/Cache Directory 不被视为 Source。
- 为 Distributable Artifact 生成 Checksum 和 Release Note。

## Release Gate

Release Candidate 需要：

- Active Version Document 的 Release Acceptance 和 Evidence。
- Full Automated Validation。
- Active Version 的 Eval 所定义的 Player Flow Smoke Test；未进入该 Version 的 Flow 不得提前成为 Release Gate。
- Supported Save Migration Tests。
- Representative Performance Checks。
- 相关情况下的 Missing-network/External-service Checks。
- Localization 和 Accessibility Smoke Test。
- New Asset 的 License/Attribution Review。
- New Data Collection 或 External Content 的 Privacy/Security Review。
- Rollback 和 Last-known-good Build Plan。

## Security Ownership

Backend 对 Authentication、Account Access、Cloud-save Authorization、Multiplayer Permission、LLM Provider、Purchase 和 Entitlement 具有 Authority。

引入这些 Feature 后必须：

- Validate 并 Rate-limit 所有 Untrusted Input。
- 使用适合 Platform 的 Secure Session/Token Storage。
- 对 World 和 Generated Content 使用 Least-privilege Access。
- Purchase 和 Reward Operation 具备 Idempotency。
- 不信任 Client Timestamp、Inventory、Currency 或 Entitlement。
- 从 Log 中 Redact Secret 和 Personal Content。
- Public Social Text Feature 上线前定义 Abuse Reporting/Moderation。

## Privacy

收集 Account Data、Analytics、Crash Report、Player-authored Letter、Photo、Prompt 或 Generated Output 前，记录：

- Purpose 和适用的 Lawful/Consent Basis。
- Data Field，以及是否 Optional。
- Storage Location 和 Retention。
- Third-party Processor。
- Deletion/Export Behavior。
- Age/Region Restriction。
- Logging 和 Support Access。

不得把完整 World Save 上传给 LLM Provider。Backend 只构建满足需求的最小有界 Context。

## Telemetry 和 Diagnostics

Development Diagnostics 应支持复现，同时避免收集不必要的 Personal Content。使用 Stable Event Name、Version、Error Category 和 Correlation ID。Production Telemetry 根据未来 Privacy Decision 进行 Opt-in/Configuration。

有价值的 Operational Signals 包括：

- Crash-free Session。
- Save/Load/Migration Failure。
- Corrupt-save Recovery。
- Scene Load 和 Frame-time Distribution。
- Network Error 和 Cloud Conflict。
- LLM Latency、Fallback、Moderation Rate 和 Cost。
- Purchase Verification Failure 和 Duplicate Prevention。

Telemetry 不能替代 Test，也不能静默改变 Gameplay。

## Backup 和 Recovery

- Local Save 保留 Last-known-good Copy。
- Cloud Save 根据未来 Retention Decision 保留 Revision/Conflict Metadata。
- Migration 不得破坏唯一可读的 Original。
- Support Tool 不得暴露 Private Player Content。
- Recovery Instruction 必须在 Release 前测试，不能等 Data Loss 后临时设计。
