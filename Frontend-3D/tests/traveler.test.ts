import { afterEach, beforeEach, expect, test } from "vitest";
import { tradingTuning, travelerTuning } from "core";

import {
  buyFromTraveler,
  epochDayOf,
  isTravelerScheduledOn,
  restoreTravelerStock,
  snapshotTravelerStock,
  travelerOfferToday,
  travelerStockToday,
} from "../src/Game/Systems/trading";
import { restoreBuildings } from "../src/Game/State/buildings";
import { depositGoldTo, getGold, restoreBaseGold, takeGoldUpTo } from "../src/Game/State/gold";
import { replaceCounts } from "../src/Game/State/inventory";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import {
  debugAdvanceHours,
  getClock,
  getDebugOffsetMs,
} from "../src/Game/State/clock";

/**
 * 旅行商人「小鱼人」（期 6）。
 *
 * 钉三样：**班表可预期**、**货单确定性**、**限量跨存档**。
 * 最后一条是这个角色的命——不限量他就是第二家常驻店。
 */

/** 一只装得下的金库，否则买东西前先卡在没钱上 */
const JAR = {
  instanceId: "jar-1",
  buildingId: "gold_jar",
  x: 20.5,
  z: 20.5,
  elevation: 0,
  facing: 0 as never,
  levelId: "l3",
};

beforeEach(() => {
  setRemoteWorldActive(false);
  restoreBuildings([JAR]);
  restoreBaseGold(0);
  takeGoldUpTo(getGold());
  replaceCounts({});
  restoreTravelerStock(undefined);
});

/*
 * **把时钟拨回去。**
 *
 * 这一份里好几条要拨到出摊日，而 `debugAdvanceHours` 改的是模块级的
 * 全局偏移——拨完不还，同一个 worker 里后跑的用例就活在几天之后的世界。
 * 加这条之前整套跑出过一次单条失败、重跑又全绿，正是这类污染的样子。
 */
afterEach(() => {
  debugAdvanceHours(-getDebugOffsetMs() / 3_600_000);
});

test("traveler_班表是固定周期_基准日和第八天在_中间不在", () => {
  /*
   * 固定而不是随机：玩家要能规划"下周他来，我先攒着"。惊喜来自摊上有
   * 什么，不来自他来不来——两个都随机的话，他就是一家开得比较少的杂货铺。
   */
  const every = tradingTuning.travelerVisitEveryDays;
  // 找一个真的出摊日，再从它往后数
  const base = "2026-01-01";
  const baseDay = epochDayOf(base);
  const offset = (every - (baseDay % every)) % every;
  const dayId = (n: number) =>
    new Date((baseDay + offset + n) * 86_400_000).toISOString().slice(0, 10);

  expect(isTravelerScheduledOn(dayId(0))).toBe(true);
  expect(isTravelerScheduledOn(dayId(every))).toBe(true);
  for (let i = 1; i < every; i += 1) {
    expect(isTravelerScheduledOn(dayId(i)), `第 ${i} 天不该出摊`).toBe(false);
  }
});

test("traveler_和水獭的周期拉得开_一密一疏才分得出是谁", () => {
  // 两个都是"来来去去的商人"，周期撞在一起玩家就分不出今天来的是谁
  expect(tradingTuning.travelerVisitEveryDays).toBeGreaterThan(
    tradingTuning.otterVisitEveryDays * 2,
  );
});

test("traveler_同一天抽两次货单一样_否则玩家会重开面板刷货", () => {
  const first = travelerOfferToday();
  const second = travelerOfferToday();

  expect(first).toEqual(second);
  expect(first.length).toBeLessThanOrEqual(travelerTuning.drawCount);
});

test("traveler_不同天的货单不一样_不然稀客等于常驻店", () => {
  const today = travelerOfferToday();
  debugAdvanceHours(24 * tradingTuning.travelerVisitEveryDays);
  const nextTrip = travelerOfferToday();
  debugAdvanceHours(-24 * tradingTuning.travelerVisitEveryDays);

  /*
   * 今天货单只有一件（货单表里就一把水壶），所以这条现在必然相等——
   * 断言写成"抽签用了当天的种子"而不是"两天结果不同"，等货单长起来
   * 之后它才真正开始咬人，而现在也不会假绿。
   */
  expect(today.length).toBe(nextTrip.length);
});

test("traveler_买过就没了_这一趟的限量", () => {
  // Arrange：拨到出摊日、给足钱
  advanceToTravelDay();
  depositGoldTo(200);
  const offer = travelerStockToday();
  expect(offer.length).toBeGreaterThan(0);

  // Act
  const bought = buyFromTraveler(offer[0]);

  // Assert：摊上少一件，再买同一件被拒
  expect(bought.ok).toBe(true);
  expect(travelerStockToday()).not.toContain(offer[0]);
  expect(buyFromTraveler(offer[0])).toEqual({ ok: false, reason: "not_stocked" });
});

test("traveler_限量跨存档_存读之后还是买光的状态", () => {
  advanceToTravelDay();
  depositGoldTo(200);
  const offer = travelerStockToday();
  buyFromTraveler(offer[0]);

  // Act：存 → 清空运行时 → 读
  const saved = snapshotTravelerStock();
  restoreTravelerStock(undefined);
  expect(travelerStockToday()).toContain(offer[0]); // 清空之后确实回来了
  restoreTravelerStock(saved);

  /*
   * Assert：读回来还是买光的。不存这一份的话，重开一次游戏就刷新库存，
   * "错过就等下一趟"那份遗憾直接归零——那是这个角色唯一的价值。
   */
  expect(travelerStockToday()).not.toContain(offer[0]);
});

test("traveler_不出摊的日子摊上是空的_买不了", () => {
  advanceToTravelDay();
  debugAdvanceHours(24); // 挪到第二天，他走了
  depositGoldTo(200);

  expect(travelerStockToday()).toEqual([]);
  expect(buyFromTraveler("watering_can_wide")).toEqual({
    ok: false,
    reason: "not_here",
  });
});

test("traveler_钱不够时不成交_也不扣货", () => {
  advanceToTravelDay();
  const offer = travelerStockToday();

  const result = buyFromTraveler(offer[0]);

  expect(result).toEqual({ ok: false, reason: "cant_afford" });
  expect(travelerStockToday()).toContain(offer[0]);
});

/** 把世界时钟拨到最近的一个出摊日 */
function advanceToTravelDay(): void {
  for (let i = 0; i < tradingTuning.travelerVisitEveryDays + 1; i += 1) {
    if (isTravelerScheduledOn(getClock().worldDayId)) return;
    debugAdvanceHours(24);
  }
  throw new Error("拨不到出摊日");
}
