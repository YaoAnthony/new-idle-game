import { afterEach, beforeEach, expect, test } from "vitest";
import { Facing } from "core";

import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import {
  depositGoldTo,
  flushPendingGold,
  getGold,
  getPendingGold,
  restoreBaseGold,
  restorePendingGold,
  spendGoldFrom,
} from "../src/Game/State/gold";
import { replaceCounts } from "../src/Game/State/inventory";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import { canAfford, materialCounts } from "../src/Game/Systems/materials";
import { resetTerritory } from "../src/Game/State/territory";

/**
 * **做客时的钱归谁**（用户 2026-08-23 定："联机的人获得的金币存到自己的
 * 世界的金库里面，而不是这个人的"）。
 *
 * 病在于做客时运行时里装的是**房主的**世界，金币罐当然也是房主的。
 * 原来赚的钱直接入账 = 往朋友的罐里塞钱，而且回家时被
 * `composeGuestSave`（世界侧用入房前快照）整个丢掉——同一份每日奖励里，
 * 番茄靠 `item_thrown` op 到得了，金币凭空蒸发。
 *
 * 修法是"钱先记在人身上，回家再入账"。这一组钉三件事：**不进房主的罐、
 * 花不了房主的钱、回家一分不少地结算**。
 */

beforeEach(() => {
  setRemoteWorldActive(false);
  resetTerritory();
  restoreBuildings([]);
  replaceCounts({});
  restoreBaseGold(0);
  restorePendingGold(0);
});

afterEach(() => {
  // 这个位是模块级的，漏关会串到别的用例去
  setRemoteWorldActive(false);
});

test("做客时赚的钱不进这个世界的罐子", () => {
  // Arrange：房主家有一只罐，里面本来就有钱
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(6);
  const hostBalance = getGold();

  // Act：进别人家，再赚一笔
  setRemoteWorldActive(true);
  const outcome = depositGoldTo(15);

  // Assert：这个世界的余额纹丝不动，钱记在身上
  expect(getGold()).toBe(hostBalance);
  expect(getPendingGold()).toBe(15);
  expect(outcome.accepted).toBe(15);
  // 别人家的罐装不装得下不关我的事，所以这一步不谈溢出
  expect(outcome.overflowed).toBe(0);
});

test("做客时花不了这个世界的钱——只改入账不改花钱就是刷钱漏洞", () => {
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(10);
  const before = getGold();

  setRemoteWorldActive(true);
  const result = spendGoldFrom(5);

  expect(result.ok).toBe(false);
  expect(getGold()).toBe(before);
});

test("身上寄存的钱也花不了——它还没到家，没进任何一只罐", () => {
  setRemoteWorldActive(true);
  depositGoldTo(50);
  expect(getPendingGold()).toBe(50);

  expect(spendGoldFrom(1).ok).toBe(false);
});

test("商店在别人家如实变灰：能花的是 0，不是房主罐里那个数", () => {
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(10);
  expect(canAfford([{ itemId: "gold", quantity: 5 }])).toBe(true);

  setRemoteWorldActive(true);

  // 亮着却按不动的按钮比灰着的难解释得多
  expect(materialCounts().get("gold")).toBe(0);
  expect(canAfford([{ itemId: "gold", quantity: 5 }])).toBe(false);
});

test("回家结算：寄存的钱进自己的罐，一分不少", () => {
  // 自己家有一只 l1 罐（10）+ 钱匣（10）= 容量 20
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);

  // 出门赚 15
  setRemoteWorldActive(true);
  depositGoldTo(15);
  expect(getGold()).toBe(0);

  // 回家
  setRemoteWorldActive(false);
  const settled = flushPendingGold();

  expect(settled.accepted).toBe(15);
  expect(getGold()).toBe(15);
  expect(getPendingGold()).toBe(0);
});

test("结算照样会溢出——罐装不下是罐的事，不因为钱是外面赚的就网开一面", () => {
  // 一只罐都不建：容量只有钱匣那 10
  setRemoteWorldActive(true);
  depositGoldTo(30);

  setRemoteWorldActive(false);
  const settled = flushPendingGold();

  expect(settled.accepted).toBe(10);
  expect(settled.overflowed).toBe(20);
  expect(getGold()).toBe(10);
  expect(getPendingGold()).toBe(0);
});

test("寄存的钱进存档——中途关掉游戏不该把它吞了", () => {
  setRemoteWorldActive(true);
  depositGoldTo(8);
  const saved = getPendingGold();

  restorePendingGold(0); // 假装重启
  expect(getPendingGold()).toBe(0);

  restorePendingGold(saved);
  expect(getPendingGold()).toBe(8);
});

test("没在外面赚过钱时结算是空操作，不会凭空多出一笔", () => {
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(5);

  const settled = flushPendingGold();

  expect(settled).toEqual({ accepted: 0, overflowed: 0 });
  expect(getGold()).toBe(5);
});
