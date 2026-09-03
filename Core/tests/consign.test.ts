import test from "node:test";
import assert from "node:assert/strict";

import {
  consignPriceOf,
  consignRevenue,
  settleConsign,
  type ConsignSlot,
} from "../src/logic/consign.js";
import { consignTuning } from "../src/Data/economy/index.js";

/**
 * 寄售箱的结算算法。保底渠道：箱里每一件第二天都成交，只是打折。
 * 纯函数——不起浏览器、不碰存档。
 */

const RATE = consignTuning.priceRate;
const PRICE: Record<string, number> = { table: 100, chair: 12, trinket: 1, freebie: 0 };
const priceFor = (itemId: string): number => PRICE[itemId] ?? 0;

function box(...entries: Array<[string, number] | null>): ConsignSlot[] {
  return entries.map((e) => (e ? { itemId: e[0], count: e[1] } : null));
}

test("寄售价_100块的东西小店卖100_寄售箱只给80", () => {
  assert.equal(RATE, 0.8);
  assert.equal(consignPriceOf(100, RATE), 80);
});

test("寄售价_向下取整_12块打八折是9不是10", () => {
  assert.equal(consignPriceOf(12, RATE), 9);
});

test("寄售价_有标价的至少给1_不然1块钱的东西等于白送", () => {
  assert.equal(consignPriceOf(1, RATE), 1);
  assert.equal(consignPriceOf(0, RATE), 0);
});

test("结算_箱里每一件都成交_不看客人不看预算", () => {
  const sold = settleConsign(box(["table", 1], null, ["chair", 3], ["freebie", 2]), priceFor, RATE);

  assert.deepEqual(
    sold.map((s) => [s.slotIndex, s.itemId, s.count, s.unitPrice]),
    [
      [0, "table", 1, 80],
      [2, "chair", 3, 9],
      [3, "freebie", 2, 0],
    ],
  );
  assert.equal(consignRevenue(sold), 80 + 9 * 3);
});

test("结算_空箱一笔都没有", () => {
  assert.deepEqual(settleConsign(box(null, null), priceFor, RATE), []);
  assert.equal(consignRevenue([]), 0);
});

test("结算_不改入参", () => {
  const slots = box(["table", 1]);
  settleConsign(slots, priceFor, RATE);
  assert.deepEqual(slots, box(["table", 1]));
});
