import { beforeEach, expect, test } from "vitest";
import { BASE_GOLD_CAPACITY, Facing, jarCapacity } from "core";

import { placeBuilding, restoreBuildings } from "../src/Game/State/buildings";
import { listChatMessages, restoreChatLog } from "../src/Game/State/chatLog";
import {
  depositGoldTo,
  getGold,
  getGoldCapacity,
  restoreBaseGold,
  snapshotBaseGold,
  spendGoldFrom,
} from "../src/Game/State/gold";
import { replaceCounts } from "../src/Game/State/inventory";
import { resetTerritory } from "../src/Game/State/territory";

/**
 * 钱匣：**没建罐也存得下的那 10 枚**（用户 2026-08-23 定）。
 *
 * 原来一只罐都没有时总容量是 0，开局每一笔进账全额流失——每日任务打一个
 * 勾给 5 金币，新玩家看到的第一句反馈是"5 金币流失了"。这一组用例钉的
 * 就是那一幕不会再发生，以及钱匣**不是白送的余额**：它照样有上限、
 * 照样会溢出、关掉游戏还得在。
 */

beforeEach(() => {
  resetTerritory();
  restoreBuildings([]);
  replaceCounts({});
  restoreBaseGold(0);
  restoreChatLog([]);
});

test("一只罐都没有时也存得下钱——原来这一笔会全额流失", () => {
  expect(getGoldCapacity()).toBe(BASE_GOLD_CAPACITY);
  expect(getGoldCapacity()).toBeGreaterThan(0);

  const outcome = depositGoldTo(5);
  expect(outcome.accepted).toBe(5);
  expect(outcome.overflowed).toBe(0);
  expect(getGold()).toBe(5);
});

test("钱匣也是有底的：装满之后照样溢出，而且话说的是钱匣不是金库", () => {
  depositGoldTo(BASE_GOLD_CAPACITY + 4);

  expect(getGold()).toBe(BASE_GOLD_CAPACITY);
  const said = listChatMessages().at(-1)?.text ?? "";
  // 没库的人该去建库，不该被告知"升一级或者再建一座"
  expect(said).toContain("4");
  expect(said).toContain("建一座金库");
  expect(said).not.toContain("升一级");
});

test("建了罐之后容量是钱匣 + 罐，不是罐把钱匣顶掉", () => {
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  expect(getGoldCapacity()).toBe(BASE_GOLD_CAPACITY + jarCapacity("l1"));
});

test("先花罐里的，钱匣最后才动——有液面的那个才该波动", () => {
  expect(placeBuilding("gold_jar", 3.5, 16.5, Facing.North).ok).toBe(true);
  depositGoldTo(BASE_GOLD_CAPACITY + 6); // 钱匣满，罐里 6

  expect(spendGoldFrom(6).ok).toBe(true);
  // 罐被掏空，钱匣纹丝不动
  expect(snapshotBaseGold()).toBe(BASE_GOLD_CAPACITY);
  expect(getGold()).toBe(BASE_GOLD_CAPACITY);
});

test("钱匣进存档：关掉再打开钱还在", () => {
  depositGoldTo(7);
  const saved = snapshotBaseGold();

  restoreBaseGold(0); // 假装重启
  expect(getGold()).toBe(0);

  restoreBaseGold(saved);
  expect(getGold()).toBe(7);
});

test("老存档没有这个字段 = 匣子空着，不是补发 10 枚", () => {
  restoreBaseGold(undefined);
  expect(getGold()).toBe(0);
  // 容量照给——上限和余额是两件事
  expect(getGoldCapacity()).toBe(BASE_GOLD_CAPACITY);
});

test("存档里的数超过当前容量时夹回来，不留下永远超上限的余额", () => {
  restoreBaseGold(BASE_GOLD_CAPACITY + 999);
  expect(getGold()).toBe(BASE_GOLD_CAPACITY);
});
