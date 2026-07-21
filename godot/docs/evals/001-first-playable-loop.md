# Eval：First Playable Loop

Version：future，尚未分配给 Active Version

Status：planned

## Purpose

证明最小版本的 Core Promise 可以 end-to-end 运行：top-down Player 使用 Home Capability 完成现实 Action，获得 Reward，以有意义的方式使用 Reward，并在 Reload 后保留 Progress。

## Type

Hybrid Automated + Manual。

## Preconditions

- 使用 First-playable Content Catalog 的 Development Build。
- 一个 Test House Definition。
- Automated Setup 使用 Fixed Clock 和 Fixed Random Seed。
- 干净的 Local Profile 和 World Slot。
- Backend、Login、Multiplayer、LLM 和 Commerce 均 Disabled。

## Setup

在 Test House 中创建新的 Local World，使用 data-defined Starting Inventory，包含该 Milestone 所需的最小 Workbench 和 Recipe Input。World 启动后不得额外注入 State，除非 Test 明确记录。

## Steps

1. 开始 New Local Game，进入 top-down Test House。
2. 向所有支持 Direction 移动，与 Room Boundary Collision，并接近目标 Interaction Area。
3. 使用 Mapped Inventory Action 打开 Inventory。
4. 进入 Furniture Placement，Preview Workbench，尝试一次 Invalid Placement，再确认一次 Valid Placement。
5. 使用 Mapped Interaction Action 与 Workbench 交互。
6. 观察一个 Visible data-defined Recipe，并 Craft 其 Furniture Output。
7. 确认 Ingredient 只 Consume 一次，Output 只 Add 一次。
8. 放置 Crafted Furniture，并观察一个 Action 因其 Capability 变为 Available。
9. Create/Select Action，Start，通过 Test Clock 推进并 Complete。
10. 只获得一次 Defined Reward。
11. 通过对应 Gameplay Version 选择的一个 Branch 使用 Reward。
12. Trigger Save，退出到 Stable State，关闭游戏，Restart 并 Continue World。
13. 确认 Workbench、Crafted Furniture、Inventory、Action Result、Reward Consumption 和 Player/World Progression 保持一致。

## Assertions

- Movement、Collision、Camera、Targeting 和 UI 在 top-down 2D 中保持 Coherent。
- Remap Physical Default Key/Button 后 Flow 仍可完成。
- Invalid Placement 不改变 Durable State。
- Crafting 为 Atomic，不能 Duplicate 或 Partial Consume Item。
- Action Availability 来自 Furniture Capability Data。
- Timer Test 不等待 Production-duration Timer。
- Reward Completion 具备 Idempotency。
- Save 已 Versioned，Reload 通过 Stable ID/State 恢复，而不是 Scene Path。
- Backend 无连接不影响 Flow。
- Generic Scene Logic 中没有 User-facing String 或 Content-specific Balance Value。

## Failure Evidence

保留 Development Log、Failing Assertion Output、Test Content Catalog Version、Random Seed、Save Fixture，以及 Visual/Placement Failure 的 Screenshot。不得记录 Secret 或无关 Personal Data。

## Cleanup

使用隔离的 Test Save Location 或 Test Slot。只有在附加到 Defect 时保留 Failing Fixture，否则通过支持的 Test Cleanup Path 删除 Test World。

## Result

未运行。Future `v0.3.0` 或对应 Gameplay Version 进入 `active` 后启用此 Eval。
