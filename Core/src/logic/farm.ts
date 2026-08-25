import type { ItemId } from "../types/items.js";

/**
 * 农田的阶段。
 *
 * **阶段是算出来的不是存的**：存的是 `plantedUtc` / `wateredUtc` 两个
 * 时间戳。存阶段就得有人定时推进它——关掉游戏那段时间谁来推？存时间戳
 * 则永远自洽，关游戏也照长，和整个游戏"按绝对时间结算"的基调一致。
 */

export type FarmState = {
  seedItemId: ItemId;
  plantedUtc: string;
  /** 浇过水的时刻。没浇过就没有这个字段 */
  wateredUtc?: string;
};

export type FarmStage = "empty" | "planted" | "thirsty" | "growing" | "ripe";

export type SeedShape = {
  waterAtMinutes: number;
  growMinutes: number;
};

const MINUTE = 60_000;

/**
 * 现在长到哪一阶段了。
 *
 * **不浇水就停在"需浇水"，不枯死。** 陪伴类游戏不惩罚忘记——让攒的
 * 东西凭空消失会制造焦虑，而这个游戏首先是个专注陪伴工具。代价只是
 * "你晚收了几天"，不是"你白种了"。
 *
 * 浇水之后从**浇水那一刻**接着算剩下的时间，不是从播种算：不然忘了三天
 * 再浇水，一浇就熟，那"记得浇水"这件事就没有意义了。
 */
export function farmStageAt(
  state: FarmState | undefined,
  seed: SeedShape | undefined,
  nowUtc: string,
): FarmStage {
  if (!state || !seed) return "empty";

  const now = Date.parse(nowUtc);
  const planted = Date.parse(state.plantedUtc);
  const elapsed = (now - planted) / MINUTE;

  if (elapsed < seed.waterAtMinutes) return "planted";

  if (!state.wateredUtc) return "thirsty";

  const watered = Date.parse(state.wateredUtc);
  const afterWater = (now - watered) / MINUTE;
  const remaining = seed.growMinutes - seed.waterAtMinutes;
  return afterWater >= remaining ? "ripe" : "growing";
}

/** 这一阶段按 F 会发生什么。**同一个键做不同的事，由地里的状态决定** */
export type FarmAction = "sow" | "water" | "harvest" | "none";

export function farmActionAt(stage: FarmStage, holdingSeed: boolean): FarmAction {
  if (stage === "empty") return holdingSeed ? "sow" : "none";
  if (stage === "thirsty") return "water";
  if (stage === "ripe") return "harvest";
  // planted / growing：长着呢，没什么可做的
  return "none";
}


/**
 * 以 `center` 为心、半径 `radius` 格之内的地块（含自己）。
 *
 * ## 用切比雪夫距离，不是欧氏
 *
 * 用户要的是"一次喷 9 个区域" = **3×3 的方块**。切比雪夫（取 dx、dz 里
 * 大的那个）给的正好是方形范围；欧氏距离半径 1 只覆盖上下左右四格加自己，
 * 是个十字，对不上。
 *
 * 半径 0 = 只有脚下这一格，正是空手／普通壶的行为。
 */
export function plotsWithinRadius<T extends { x: number; z: number }>(
  center: { x: number; z: number },
  plots: readonly T[],
  radius: number,
): T[] {
  // 一格一米，所以格距就是世界坐标差。浮点位置用四舍五入落到格上
  const r = Math.max(0, Math.round(radius));
  return plots.filter((plot) => {
    const dx = Math.abs(Math.round(plot.x - center.x));
    const dz = Math.abs(Math.round(plot.z - center.z));
    return Math.max(dx, dz) <= r;
  });
}
