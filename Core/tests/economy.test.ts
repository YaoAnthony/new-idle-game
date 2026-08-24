import assert from "node:assert/strict";
import { test } from "node:test";

import { dailyBoardDefinition } from "../src/Data/dailyTasks/index.js";
import {
  economyStages,
  fullBoardIncome,
  theftTuning,
  tradingTuning,
} from "../src/Data/economy/index.js";
import { goldJarTuning } from "../src/Data/buildings/index.js";

/**
 * 经济的**不变量**（用户 2026-08-24 定）：一天做 4~5 个任务永远能
 * cover 当前开销。
 *
 * 这一份测的不是"当前数值好不好看"，是一道**闸**：以后任何人调平衡，
 * 把某个阶段的必需开销调到打满勾都不够，这里当场红。没有它的话，
 * 那种破坏要等玩家在游戏里饿一天才发现，而且会被当成"这版怎么这么难"
 * 而不是"有人改错了一个数"。
 *
 * 分成几条而不是一条，是因为「慢」和「倒退」是两回事（总纲的纪律）：
 * 必需开销要低到轻松覆盖，可选开销才允许吃掉余量。
 */

test("阶段表不能是空的", () => {
  assert.ok(economyStages.length > 0);
});

test("阶段 id 不重复", () => {
  const ids = new Set<string>();
  for (const stage of economyStages) {
    assert.ok(!ids.has(stage.stageId), `阶段 id 重复：${stage.stageId}`);
    ids.add(stage.stageId);
  }
});

test("每个阶段：打满一块板的收入 ≥ 当天的必需开销", () => {
  for (const stage of economyStages) {
    const income = fullBoardIncome(stage, dailyBoardDefinition.taskCount);
    assert.ok(
      income >= stage.spending.essentialPerDay,
      `阶段「${stage.label}」：打满一块板拿 ${income}，必需开销 ${stage.spending.essentialPerDay}——不够吃饭`,
    );
  }
});

test("每个阶段：必需开销不超过两个勾——少做几天只该慢，不该倒退", () => {
  for (const stage of economyStages) {
    const twoChecks = stage.income.perTaskCheck * 2;
    assert.ok(
      stage.spending.essentialPerDay <= twoChecks,
      `阶段「${stage.label}」：必需开销 ${stage.spending.essentialPerDay} 超过两个勾（${twoChecks}）——出差一周回来会被吃穿`,
    );
  }
});

test("每个阶段：打满板还剩得下推进度的钱", () => {
  for (const stage of economyStages) {
    const income =
      fullBoardIncome(stage, dailyBoardDefinition.taskCount) +
      stage.income.typicalSellPerDay;
    const outgo = stage.spending.essentialPerDay + stage.spending.optionalPerDay;
    assert.ok(
      income >= outgo,
      `阶段「${stage.label}」：一天进 ${income}、出 ${outgo}——进度会停住`,
    );
  }
});

/**
 * 每日任务发的钱**就是**表里那两个数。
 *
 * 钉这一条是因为 `dailyBoardDefinition` 现在是从 `economyStages[0]` 读的，
 * 而"读的"这件事很容易在某次重构里被改回字面量——那一刻两处就开始
 * 各走各的，而且不报错。
 */
test("每日任务的奖励金额来自经济表，不是另写的字面量", () => {
  const stage = economyStages[0];
  const perTask = dailyBoardDefinition.perTaskRewards.find((r) => r.type === "gold");
  const full = dailyBoardDefinition.rewards.find((r) => r.type === "gold");

  assert.equal(perTask?.type === "gold" ? perTask.amount : undefined, stage.income.perTaskCheck);
  assert.equal(full?.type === "gold" ? full.amount : undefined, stage.income.boardComplete);
});

/**
 * 偷走的钱要**看得见但不吓人**。
 *
 * 上界钉在 l1 金库的容量上：偷得比整座库还多的话，玩家看到的是
 * "库空了"，而设计要的是"液面掉下去一截"。下界钉在一个勾上：
 * 比一次打勾还少就读不出"出事了"。
 */
test("偷走的数额在一个勾和 l1 金库容量之间", () => {
  const stage = economyStages[0];
  assert.ok(theftTuning.amount > stage.income.perTaskCheck, "偷得太少，读不出出事了");
  assert.ok(
    theftTuning.amount < goldJarTuning.capacityByLevel.l1,
    "偷得比整座 l1 金库还多，玩家看到的会是'库空了'而不是'掉了一截'",
  );
});

/**
 * 两个商人的周期必须拉开。
 *
 * 一密一疏是他们的分工（收货的熟人 vs 稀客）。周期靠近的话玩家分不出
 * 两个角色，"这趟没赶上"的遗憾也就没了——而那份遗憾是稀客的全部价值。
 */
test("旅行商人的周期明显长于水獭——两个角色不能糊", () => {
  assert.ok(
    tradingTuning.travelerVisitEveryDays >= tradingTuning.otterVisitEveryDays * 2,
    `旅行商人 ${tradingTuning.travelerVisitEveryDays} 天 / 水獭 ${tradingTuning.otterVisitEveryDays} 天——太接近，玩家分不出两个角色`,
  );
});

test("想要的加价是加价，不是打折", () => {
  assert.ok(tradingTuning.wantedMultiplier > 1);
  assert.ok(tradingTuning.wantedCount > 0);
});
