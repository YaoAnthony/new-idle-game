/**
 * 金币抽屉：**产金币的东西自己攒着，玩家来领，装不下的留在原地**。
 *
 * ## 为什么要有这一层
 *
 * 罐是钱包（见 `goldJar.ts`）：容量是持有上限，超了就丢。这条对"你主动做
 * 任务 / 交易"那一刻成立——损失当场看得见，是压力不是焦虑。但**挂机产出**
 * 不一样：小店隔夜卖货、以后的招财猫、餐厅……玩家不在场，溢出等于货和钱
 * 一起没了，读起来像 bug 而不像设计（小店第一版就是这么栽的）。
 *
 * 所以产出**不直接进罐**，先进产出者自己的抽屉（抽屉没有上限），玩家走到
 * 跟前领；领的时候罐装得下多少拿多少，**剩下的留在抽屉里**，下次再来。
 * 120 枚产出、罐只剩 50 空位 → 领 50，抽屉还剩 70。
 *
 * 这是所有产金币的家具 / 建筑**共用**的规则。抽屉记在实例状态的
 * `pendingRevenue` 上（建筑 `placement.state` / 家具 `PlacedFurnitureState`），
 * 前端接线在 `Frontend-3D/src/Game/Systems/goldDrawer.ts`。
 */

export type DrawerClaim = {
  /** 这次真正进罐的 */
  accepted: number;
  /** 领完还留在抽屉里的 */
  left: number;
};

/** 领一次。装得下多少领多少，剩下的留在抽屉。金币是整数，小数和负数不信任 */
export function claimFromDrawer(pending: number, room: number): DrawerClaim {
  const stock = Math.max(0, Math.floor(pending));
  const space = Math.max(0, Math.floor(room));
  const accepted = Math.min(stock, space);
  return { accepted, left: stock - accepted };
}

/**
 * 领取提示的三种状态。
 *
 * **提示和动作必须用同一把尺子**（`buildingHintParity` 那条教训）：气泡说
 * "领取"就得真领得到。抽屉有钱但罐满了，是"金库满了"不是"领取"——说了
 * 领取按下去没反应，玩家只会以为按键坏了，而不是"这里本来就不能操作"。
 */
export type DrawerHint = "empty" | "claimable" | "vault_full";

export function drawerHint(pending: number, room: number): DrawerHint {
  if (pending <= 0) return "empty";
  return room > 0 ? "claimable" : "vault_full";
}
