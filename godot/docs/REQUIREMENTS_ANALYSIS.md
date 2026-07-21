# Requirements Analysis

本文档将仓库原始 README 转换为 Implementation Domain，并识别每个区域在 Coding 前必须解决的 Dependency。

它是 Traceability 和 Risk Analysis，不是规范性 Product Spec，也不授权 Implementation。已接受的 Product Behavior 由 `SPEC.md` 拥有；当前 Delivery Scope 由 Active Version Document 拥有。

## Product Identity

这是一款带 Idle/Focus Layer 的温暖 top-down 2D Life Simulation。它真正独特的承诺，并不是孤立的 Crafting、Pet 或 Multiplayer，而是让现实 Action 在魔法 Home 中转化成 Resource 和 Time Progression，并通过 Pet、Decoration、Food、Event、Music 与 Ambience 提供安静反馈。

## 从 Design 推导的 Player Goals

- 在学习、工作、运动、创作或休息时感到有人陪伴。
- 看见现实投入转化成可见且有用的 Game Progress。
- 建造个人 Home，而不是追求竞争性的最优 Build。
- 通过照顾和共同 Event 与 Pet 建立 Relationship。
- 通过 Narrative Event 逐步发现 System。
- 可选地与 Friend 分享安静空间，同时保留 Host 对 World 的控制。

## 从 First-day Flow 推导的 System Requirements

| README Behavior | Required Systems | Important Dependency |
| --- | --- | --- |
| Random Region 和 House | Region/House Definition、Seeded Selection、World Creation | Save Model 和 Random Seam |
| 在 Home 中移动 | Top-down Player、Collision、Camera、Depth Sorting | Room Scene Convention |
| 打开 Backpack | InputMap、Inventory State、Inventory UI | Item Definition |
| 放置 Workbench/Furniture | Furniture Definition、Preview、Placement Validation、Persistence | Room Geometry 和 Stable Entity ID |
| 靠近 Object 交互 | Interaction Capability 和 Target Selection | Player 与 Feature Interface |
| Craft Furniture | Recipe、Station Capability、Multi-inventory Transaction | Inventory Atomicity |
| 遇到 Pet | Pet Definition、Spawn/Event System、Dialogue | Event Sequencing 和 Navigation |
| Pet 请求 Item | Need、Preference、Item Transfer、Memory | Pet State 和 Inventory Transaction |
| 创建 Timed Action | Action Definition/Category、User Input、Timer、Availability | Clock Seam 和 Furniture Capability |
| 获得 Guaranteed Story Reward | Reward Table 和 Progression Override | Event/Action Integration |
| Cooking 和 Eating | Cooking Station、Process Step、Food State、Hunger | Recipe 和 Need System |
| Tutorial Diagram | Progress-aware Tutorial Presentation | Event State 和 Mapped Control |
| Sleep 并开始 Next Day | Bed Interaction、Day Cycle、Queued Event | Save Checkpoint 和 Clock |
| Pet 带 Gift 回来 | Dispatch/Absence State、Event Trigger、Reward | Time 和 Pet Persistence |
| Mother Call 与 Daily Machine | Dialogue/Event Unlock、Station Repair、Daily Generation | Event 和 Unlock Model |

## 更广泛的 Gameplay Domains

### Resource Economy

Resource Source 包括 Action、Pet、Daily Task、Event、Dispatch、Plant 和未来 Social Reward。Resource Sink 包括 Hunger/Survival、Cooking、Crafting、Pet Care、Decoration、Fertilizer、Travel、Photography 和可选 Cosmetic。

Economy 需要 data-defined Source/Sink、Anti-duplication Transaction、Development Balance Telemetry 和 Migration-safe ID。任何单个 Feature 都不能通过临时代码直接发放 Inventory。

### Progression

Progression 基于 Event/Capability，而不是单一 Global Level。Furniture 解锁 Action；Event 解锁 Station 和 Travel；Pet 解锁 Behavior；Recipe 解锁 Cooking/Crafting；House Change 解锁 Space。

因此，在扩大 Content Breadth 前，Implementation 需要通用 Unlock Concept 和 Condition/Effect Model。

### Feedback Loops

Positive Feedback：

- Action Reward 改善 Survival。
- Action Reward 支持 Pet。
- Action Reward 改善 Home。
- Home Capability 解锁更多 Action 和 Reward Option。

Negative Pressure：

- Hunger 和 Fatigue 限制 Action。
- Food 可能 Expire。
- 某些 Station 带有 Placement Constraint。

Negative System 应产生 Decision，但不能惩罚把本游戏当作安静 Focus Companion 的 Player。具体强度属于未来 Balance Decision。

## 从 Future Features 推导的 Technical Requirements

### Save System

Furniture Placement、Inventory、Pet、Event、Time 和 Player-authored Action 都属于 Durable State，因此 Save System 必须较早实现，并在 Content 扩展前 Versioned。

### Login UI

Local Core Loop 不需要 Login。Cloud Save、Friend、Multiplayer、Purchase 或 Cross-device Identity 出现后才需要 Login。Local Guest World 必须能够绑定 Account，且不丢失 Progress。

### Multiplayer

需要稳定的 World Save、Command Model、Permission、Conflict Handling 和 Authoritative Inventory Transaction。不得通过直接 Node Synchronization 实现。

### LLM

需要 Backend Mediation、Structured Context、Privacy Rule、Moderation、Fallback、Cache 和 Cost Control。它保持 Cosmetic/Narrative，不承担 Authority。

### Commerce

需要 Account Identity、Server Verification、Entitlement Persistence、Restore/Refund Behavior 和 Platform Decision，与 Initial Screen 和 First Gameplay Vertical Slice 都独立。

## Cross-cutting Traceability

这些需求由专题文档维护，本分析只记录它们来自原始 Game Design，避免在这里建立第二套规则：

| Concern | 规范性 Owner |
| --- | --- |
| Input、Localization 和 Accessibility | `SPEC.md`、`CONTENT_PIPELINE.md` |
| Save Recovery、Migration 和 Deterministic Time/Randomness | `data/DATA_MODEL.md`、`test/TESTING.md` |
| Asset Licensing、Audio 和 Generated Content | `CONTENT_PIPELINE.md` |
| Headless Validation、Build 和 Performance Budget | `test/TESTING.md`、`OPERATIONS.md` |
| Offline Fallback、Security、Privacy 和 Consent | `ARCHITECTURE.md`、`OPERATIONS.md` |

## 最高风险的 Unknowns

- Real-life Action 和 Dispatch 的 Offline Progression Semantics。
- Furniture Placement 的 Grid/Free-form Rule 和 Navigation Blocking。
- Player-authored Action 如何 Validate、Interrupt 和 Recover。
- Food Expiration Pressure 是否符合 Calm Experience。
- Event Authoring Format 和 Resumability。
- Guest-to-account Cloud Merge 和 Save Conflict。
- Multiplayer Authority 和最终 World Reconciliation。
- Letter 与 Generated Photo 的 Privacy/Moderation。

这些 Unknown 必须在相关 Feature 进入 Active Version 前变成 Accepted Decision。

## 推荐 Delivery Conclusion

Dependency Analysis 支持先验证最小 Delivery Shell，再构建 top-down 2D Gameplay Vertical Slice。准确的当前 Scope 见 `versions/v0.1.0-initial-screen.md`，后续顺序见 `ROADMAP.md`；本结论本身不创建或激活 Version。
