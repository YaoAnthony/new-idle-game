import test from "node:test";
import assert from "node:assert/strict";

import { composeIssue, pickHeadline } from "../src/logic/newspaper.js";
import { headlinePriority } from "../src/Data/newspaper/index.js";

/**
 * 报纸的编排（期 7）。**纯函数用例**——不起浏览器、不碰存档。
 *
 * 钉的是编辑方针：头条按表挑、同一份事实编两次一模一样、没内容也出版面。
 */

const FACTS = {
  worldDayId: "2026-08-24",
  weatherId: "rainy",
  goldIn: 36,
  goldOut: 12,
  actions: [{ name: "写完作业", minutes: 45 }],
  headlines: [
    { kind: "shop_sold", subject: "furniture_chair|pet-fox" },
    { kind: "theft" },
    { kind: "resident_moved_in", subject: "slime_neighbor" },
  ],
};

const BASE = {
  worldDayId: "2026-08-25",
  facts: FACTS,
  number: 3,
  spanDays: 1,
  wanted: ["furniture_table"],
};

test("newspaper_头条按优先级表挑_被偷压过卖货和搬家", () => {
  const issue = composeIssue(BASE);

  // 被偷 100 > 搬家 90 > 卖货 40。顺序在数组里是乱的，挑选不看顺序
  assert.equal(issue.headline?.kind, "theft");
});

test("newspaper_加一种大事不用改代码_往表里加一行就能上头版", () => {
  /*
   * 这条钉的是**机制不是数值**：挑选逻辑读的是表，所以临时往表里塞一个
   * 更高分的 kind，它就该赢。做成 if 链的话这条过不了。
   */
  headlinePriority.festival = 999;
  try {
    const picked = pickHeadline([{ kind: "theft" }, { kind: "festival" }]);
    assert.equal(picked?.kind, "festival");
  } finally {
    delete headlinePriority.festival;
  }
});

test("newspaper_表里没有的kind算零分_上不了头版但不会让报纸出不来", () => {
  const picked = pickHeadline([{ kind: "从来没登记过的事" }]);

  // 兜底成 0 分：它还是被选中了（只有它），但不会抛
  assert.equal(picked?.kind, "从来没登记过的事");
  assert.equal(headlinePriority["从来没登记过的事"], undefined);
});

test("newspaper_同分取先发生的那件_存读之后头版不会变", () => {
  const a = pickHeadline([
    { kind: "shop_sold", subject: "one" },
    { kind: "shop_sold", subject: "two" },
  ]);

  // 可复现是硬要求：随便挑一个的话，存读之后玩家会看到不同的头版
  assert.equal(a?.subject, "one");
});

test("newspaper_同一份事实编两次_逐字一样", () => {
  assert.deepEqual(composeIssue(BASE), composeIssue(BASE));
});

test("newspaper_邻居动态和头条不互斥_搬家两处都出现", () => {
  const issue = composeIssue(BASE);

  assert.equal(issue.headline?.kind, "theft");
  assert.ok(issue.neighbors.some((item) => item.kind === "resident_moved_in"));
  assert.ok(issue.neighbors.some((item) => item.kind === "shop_sold"));
  // 被偷不算邻居动态
  assert.ok(!issue.neighbors.some((item) => item.kind === "theft"));
});

test("newspaper_没有事实也出版面_头条为空由版面兜底", () => {
  const issue = composeIssue({ ...BASE, facts: null });

  /*
   * 昨天什么都没发生的日子照样出报。空版面比"今天没有报纸"好——
   * 那台打印机是玩家送出去的，它每天都该响一次。
   */
  assert.equal(issue.headline, null);
  assert.equal(issue.actions.length, 0);
  assert.equal(issue.weatherId, "sunny");
  assert.equal(issue.number, BASE.number);
});

test("newspaper_想要清单是抄一份不是引用_定稿之后外面改不动它", () => {
  const wanted = ["furniture_table"];
  const issue = composeIssue({ ...BASE, wanted });

  wanted.push("furniture_chair");

  /*
   * 报纸上印过的字不该自己改。存的是引用的话，水獭走了之后那一栏会
   * 跟着变——而这一期已经定稿了。
   */
  assert.deepEqual(issue.wanted, ["furniture_table"]);
});

test("newspaper_spanDays至少是1_不会出现隔零天", () => {
  assert.equal(composeIssue({ ...BASE, spanDays: 0 }).spanDays, 1);
  assert.equal(composeIssue({ ...BASE, spanDays: 7 }).spanDays, 7);
});
