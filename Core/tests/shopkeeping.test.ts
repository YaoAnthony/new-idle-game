import test from "node:test";
import assert from "node:assert/strict";

import { settleDay, totalRevenue, type ShelfSlot } from "../src/logic/shopkeeping.js";
import { shopkeepingTuning } from "../src/Data/economy/index.js";

/**
 * 挂机经营的结算算法（期 5 小店 / 期 8 餐厅共用）。
 *
 * 这些用例全是纯函数调用——不起浏览器、不碰存档。"离线十天只够卖三天的货"
 * 这类判据本来就该在这一层钉死，前端那边只剩"把结果搬进金库"。
 */

const PRICE: Record<string, number> = {
  chair: 20,
  table: 90,
  lamp: 5,
  freebie: 0,
};
const priceFor = (itemId: string): number => PRICE[itemId] ?? 0;

function shelf(...entries: Array<[string, number] | null>): ShelfSlot[] {
  return entries.map((e) => (e ? { itemId: e[0], count: e[1] } : null));
}

test("shopkeeping_贵的先被买走_摆好货才有回报", () => {
  // Arrange：一件 90 一件 20，预算刚好 100
  const slots = shelf(["chair", 1], ["table", 1]);

  // Act
  const sold = settleDay({
    slots,
    customers: [{ id: "a", budget: 100 }],
    priceFor,
  });

  // Assert：先买 90 那件，剩 10 买不起 20 的椅子
  assert.deepEqual(
    sold.map((s) => s.itemId),
    ["table"],
  );
  assert.equal(totalRevenue(sold), 90);
});

test("shopkeeping_一位客人预算够就连买几件", () => {
  const slots = shelf(["chair", 3]);

  const sold = settleDay({
    slots,
    customers: [{ id: "a", budget: 65 }],
    priceFor,
  });

  // 20×3 = 60 ≤ 65，三件全走；货架只有 3 件，不会卖出第四件
  assert.equal(sold.length, 3);
  assert.equal(totalRevenue(sold), 60);
});

test("shopkeeping_卖完就停_这就是离线产出的天然上限", () => {
  // Arrange：一件货，一屋子有钱的客人
  const slots = shelf(["table", 1]);

  const sold = settleDay({
    slots,
    customers: [
      { id: "a", budget: 999 },
      { id: "b", budget: 999 },
      { id: "c", budget: 999 },
    ],
    priceFor,
  });

  // Assert：只成交一笔。货架就是上限，不用另写封顶规则
  assert.equal(sold.length, 1);
  assert.equal(sold[0].customerId, "a");
});

test("shopkeeping_同一份货架算两次_结果逐字一样", () => {
  const slots = shelf(["chair", 2], ["table", 1], ["lamp", 4]);
  const customers = [
    { id: "fox", budget: 40 },
    { id: "slime", budget: 95 },
  ];

  const first = settleDay({ slots, customers, priceFor });
  const second = settleDay({ slots, customers, priceFor });

  /*
   * 确定性不是"用同一个种子"，是**根本没有随机**：顺序固定、挑法固定。
   * 破了这条，玩家发现今天没卖出去就会重开游戏重摇销量。
   */
  assert.deepEqual(first, second);
});

test("shopkeeping_客人顺序按id_和传进来的先后无关", () => {
  const slots = shelf(["table", 1]);

  const asGiven = settleDay({
    slots,
    customers: [
      { id: "zoe", budget: 999 },
      { id: "amy", budget: 999 },
    ],
    priceFor,
  });
  const reversed = settleDay({
    slots,
    customers: [
      { id: "amy", budget: 999 },
      { id: "zoe", budget: 999 },
    ],
    priceFor,
  });

  // 谁先进门不该取决于运行时的遍历顺序（Map 顺序、spawn 先后…）
  assert.equal(asGiven[0].customerId, "amy");
  assert.deepEqual(asGiven, reversed);
});

test("shopkeeping_不结算价为零的货_白送不算成交", () => {
  const slots = shelf(["freebie", 5]);

  const sold = settleDay({
    slots,
    customers: [{ id: "a", budget: 999 }],
    priceFor,
  });

  assert.equal(sold.length, 0);
});

test("shopkeeping_没有客人时零成交_不崩", () => {
  const sold = settleDay({
    slots: shelf(["table", 3]),
    customers: [],
    priceFor,
  });

  assert.deepEqual(sold, []);
});

test("shopkeeping_空货架零成交_不崩", () => {
  const sold = settleDay({
    slots: shelf(null, null),
    customers: [{ id: "a", budget: 999 }],
    priceFor,
  });

  assert.deepEqual(sold, []);
});

test("shopkeeping_流水记着从哪一格卖的_调用方照它扣货", () => {
  const slots = shelf(["lamp", 1], null, ["table", 1]);

  const sold = settleDay({
    slots,
    customers: [{ id: "a", budget: 999 }],
    priceFor,
  });

  // 贵的先走 → 第一笔是 2 号格的桌子，第二笔是 0 号格的灯
  assert.deepEqual(
    sold.map((s) => s.slotIndex),
    [2, 0],
  );
});

test("shopkeeping_预算读economy表_改表销量就跟着变", () => {
  const slots = shelf(["chair", 5]);
  const budget = shopkeepingTuning.budgetPerResidentPerDay;

  const sold = settleDay({
    slots,
    customers: [{ id: "a", budget }],
    priceFor,
  });

  /*
   * 不写死"卖出几件"：那会让改平衡时这条用例变成噪音。钉的是**关系**
   * ——成交额不超过预算，而且再多一件椅子就超了（说明确实卖到了上限）。
   */
  assert.ok(totalRevenue(sold) <= budget);
  assert.ok(totalRevenue(sold) + PRICE.chair > budget);
});

test("shopkeeping_金库塞不下就不成交_货留在架上", () => {
  // Arrange：架上一件 90 一件 20，金库只剩 25 的空位
  const slots = shelf(["table", 1], ["chair", 1]);

  const sold = settleDay({
    slots,
    customers: [{ id: "a", budget: 999 }],
    priceFor,
    revenueCap: 25,
  });

  /*
   * Assert：桌子（90）塞不下所以不卖，椅子（20）卖掉。**没有溢出丢钱**
   * ——挂机结算时玩家不在场，看不见"金库满了"那句提示，钱悄悄没了
   * 等于"东西也没了钱也没了"。
   */
  assert.deepEqual(
    sold.map((s) => s.itemId),
    ["chair"],
  );
});

test("shopkeeping_金库一点空位都没有时一件不卖", () => {
  const sold = settleDay({
    slots: shelf(["chair", 5]),
    customers: [{ id: "a", budget: 999 }],
    priceFor,
    revenueCap: 0,
  });

  assert.deepEqual(sold, []);
});

test("shopkeeping_不填revenueCap就是不限_餐厅那边可以不管这事", () => {
  const sold = settleDay({
    slots: shelf(["table", 3]),
    customers: [{ id: "a", budget: 999 }],
    priceFor,
  });

  assert.equal(sold.length, 3);
});
