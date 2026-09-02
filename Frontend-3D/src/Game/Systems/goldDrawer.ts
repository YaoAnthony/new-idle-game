import { claimFromDrawer, drawerHint, type DrawerHint } from "core";

import { findPlacement, setBuildingState } from "../State/buildings";
import { depositGoldTo, getGold, getGoldCapacity } from "../State/gold";
import { setFurniturePendingRevenue } from "../State/world/furniture";
import { getWorld } from "../State/worldRuntime";
import { recordGoldFact } from "./dayRecord";

/**
 * 金币抽屉的接线。**规则在 Core**（`logic/goldDrawer.ts`），这里只回答两件事：
 * 抽屉记在哪、领到的钱往哪送。
 *
 * ## 谁能有抽屉
 *
 * 建筑实例（小店的收银台）和家具实例（以后的招财猫之类）都行——两边的实例
 * 状态本来就各有一个口袋（`placement.state` / `PlacedFurnitureState`），抽屉
 * 就是口袋里的一个数 `pendingRevenue`。不另立存档切片：建筑那份跟着
 * WorldSave 的建筑切片走，家具那份跟着 placedFurniture 走，联机做客看到的
 * 抽屉是房主的，对。
 *
 * ## 产出方只管往抽屉里放
 *
 * 产金币的系统调 `stashRevenue`，**不看金库**——金库满不满是领取那一刻的事。
 * 这条是刻意的：挂机产出不该因为玩家没来收就"卖成空气"（小店第一版的坑）。
 * 领取走 `claimRevenue`：装得下多少进多少，剩下的留在抽屉。
 *
 * ## 提示要说真话
 *
 * `revenueHintOf` 给三态（空 / 可领 / 金库满）。气泡和按键必须用它同一个
 * 答案——"抽屉有钱"不等于"能领"，金库满着说"领取"是句假话。
 */
export type RevenueHolder =
  | { kind: "building"; instanceId: string }
  | { kind: "furniture"; instanceId: string };

/** 抽屉里攒着多少（还没被领走的） */
export function pendingRevenueOf(holder: RevenueHolder): number {
  if (holder.kind === "building") {
    const value = findPlacement(holder.instanceId)?.state?.pendingRevenue;
    return typeof value === "number" && value > 0 ? value : 0;
  }
  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === holder.instanceId,
  );
  return placed?.state.pendingRevenue ?? 0;
}

function writePending(holder: RevenueHolder, amount: number): void {
  if (holder.kind === "building") {
    setBuildingState(holder.instanceId, { pendingRevenue: amount });
    return;
  }
  setFurniturePendingRevenue(holder.instanceId, amount);
}

/** 产出进抽屉。不看金库、不封顶——金库是领取那一刻的问题 */
export function stashRevenue(holder: RevenueHolder, amount: number): void {
  const gained = Math.max(0, Math.floor(amount));
  if (gained <= 0) return;
  writePending(holder, pendingRevenueOf(holder) + gained);
}

/** 金库现在还装得下多少 */
function vaultRoom(): number {
  return Math.max(0, getGoldCapacity() - getGold());
}

/**
 * 领取：抽屉 → 金库。**装不下的留在抽屉里**，不凭空蒸发——金库满了是玩家
 * 看得见的状态（金币条顶满），腾出空位再来领。
 * 返回真正入账的数额，UI 拿它决定飞几枚金币；0 = 什么也没发生。
 */
export function claimRevenue(holder: RevenueHolder): number {
  const { accepted, left } = claimFromDrawer(pendingRevenueOf(holder), vaultRoom());
  if (accepted <= 0) return 0;

  // 先入账再改抽屉：depositGoldTo 有自己的联机分支（做客时记在人身上），
  // 抽屉只认"这笔钱已经离开我了"
  depositGoldTo(accepted);
  recordGoldFact(accepted);
  writePending(holder, left);
  return accepted;
}

/** 提示三态。和 claimRevenue 用的是同一把尺子（同一个 room、同一个 pending） */
export function revenueHintOf(holder: RevenueHolder): DrawerHint {
  return drawerHint(pendingRevenueOf(holder), vaultRoom());
}
