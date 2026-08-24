import assert from "node:assert/strict";
import { test } from "node:test";

import type { StorySignal, StoryTrigger } from "../src/types/story.js";
import {
  drawFromPool,
  poolChance,
  signalCountKey,
  signalCountKeysFor,
  triggerMatches,
  type StoryContext,
} from "../src/logic/storyTriggers.js";

/**
 * 剧情触发判定。判定是规则不是表现——联机时服务端要校验访客报上来的
 * 剧情推进，两边读同一份，否则"在我这儿触发了、在房主那儿没有"无从查起。
 *
 * `roll` 是**注入的**而不是直接用 Math.random，正是为了这里能定住它。
 */

function context(overrides: Partial<StoryContext> = {}): StoryContext {
  return {
    worldDayId: "2026-08-12",
    weatherId: "sunny",
    itemCounts: {},
    signalCounts: {},
    eventStage: () => null,
    isFeatureUnlocked: () => false,
    ...overrides,
  };
}

const signal = (kind: string, subject?: string): StorySignal =>
  ({ kind, subject }) as StorySignal;

const trigger = (patch: Partial<StoryTrigger> = {}): StoryTrigger =>
  ({ signal: "action_completed", ...patch }) as StoryTrigger;

// ---- 计数键 ----

test("每条信号同时给不分 subject 和带 subject 两个键计数", () => {
  assert.equal(signalCountKey("action_completed"), "action_completed");
  assert.equal(signalCountKey("action_completed", "work_study"), "action_completed|work_study");

  // 数所有行动 和 只数学习 各查各的，计数时不用预判规则想怎么数
  assert.deepEqual(signalCountKeysFor(signal("action_completed", "work_study")), [
    "action_completed",
    "action_completed|work_study",
  ]);
  assert.deepEqual(signalCountKeysFor(signal("action_completed")), ["action_completed"]);
});

// ---- 基础匹配 ----

test("信号种类必须对上", () => {
  assert.equal(triggerMatches(trigger(), signal("action_completed"), context()), true);
  assert.equal(triggerMatches(trigger(), signal("craft_completed"), context()), false);
});

test("不填 subject = 任意 subject 都匹配；填了就必须一致", () => {
  assert.equal(triggerMatches(trigger(), signal("action_completed", "任何东西"), context()), true);

  const specific = trigger({ subject: "work_study" });
  assert.equal(triggerMatches(specific, signal("action_completed", "work_study"), context()), true);
  assert.equal(triggerMatches(specific, signal("action_completed", "work_rest"), context()), false);
  assert.equal(triggerMatches(specific, signal("action_completed"), context()), false);
});

// ---- 事件门槛 ----

test("requiresEventUntriggered：事件一旦触发过就不再匹配（一次性剧情）", () => {
  const once = trigger({ requiresEventUntriggered: "meet_pet" });

  assert.equal(triggerMatches(once, signal("action_completed"), context()), true);
  assert.equal(
    triggerMatches(once, signal("action_completed"), context({ eventStage: () => "stage_1" })),
    false,
  );
});

test("requiresEventStage：必须正好停在那个阶段", () => {
  const staged = trigger({ requiresEventStage: { eventId: "meet_pet", stageId: "stage_2" } });

  assert.equal(
    triggerMatches(staged, signal("action_completed"), context({ eventStage: () => "stage_2" })),
    true,
  );
  assert.equal(
    triggerMatches(staged, signal("action_completed"), context({ eventStage: () => "stage_1" })),
    false,
  );
  assert.equal(triggerMatches(staged, signal("action_completed"), context()), false);
});

// ---- 累计次数 ----

test("signalCount：前两个任务做完之后妈妈才打电话", () => {
  const twice = trigger({ signalCount: 2 });

  assert.equal(
    triggerMatches(twice, signal("action_completed"), context({ signalCounts: { action_completed: 1 } })),
    false,
  );
  assert.equal(
    triggerMatches(twice, signal("action_completed"), context({ signalCounts: { action_completed: 2 } })),
    true,
  );
  // 超过也算数——已经做够了就该触发
  assert.equal(
    triggerMatches(twice, signal("action_completed"), context({ signalCounts: { action_completed: 9 } })),
    true,
  );
});

test("signalCount 查的键跟着 trigger 自己的 subject 走", () => {
  const studyTwice = trigger({ subject: "work_study", signalCount: 2 });
  const sig = signal("action_completed", "work_study");

  // 总数够了但学习只做过一次 → 不该触发
  assert.equal(
    triggerMatches(
      studyTwice,
      sig,
      context({ signalCounts: { action_completed: 5, "action_completed|work_study": 1 } }),
    ),
    false,
  );
  assert.equal(
    triggerMatches(
      studyTwice,
      sig,
      context({ signalCounts: { action_completed: 5, "action_completed|work_study": 2 } }),
    ),
    true,
  );
});

// ---- 世界日 / 天气 / 物品 ----

test("minWorldDayId 用字符串比较——定长 ISO 日期的字典序就是时间序", () => {
  const later = trigger({ minWorldDayId: "2026-08-15" });

  assert.equal(triggerMatches(later, signal("action_completed"), context()), false);
  assert.equal(
    triggerMatches(later, signal("action_completed"), context({ worldDayId: "2026-08-15" })),
    true,
  );
  assert.equal(
    triggerMatches(later, signal("action_completed"), context({ worldDayId: "2026-09-01" })),
    true,
  );
  // 跨年也要对：字典序在 ISO 日期上永远成立
  assert.equal(
    triggerMatches(
      trigger({ minWorldDayId: "2026-12-31" }),
      signal("action_completed"),
      context({ worldDayId: "2027-01-01" }),
    ),
    true,
  );
});

test("weatherIs：某一天暴雨时才有的桥段", () => {
  const stormy = trigger({ weatherIs: "storm" });

  assert.equal(triggerMatches(stormy, signal("action_completed"), context()), false);
  assert.equal(
    triggerMatches(stormy, signal("action_completed"), context({ weatherId: "storm" })),
    true,
  );
});

test("requiresItem：身上得有够数的东西", () => {
  const needsWood = trigger({ requiresItem: { itemId: "wood", quantity: 3 } });

  assert.equal(triggerMatches(needsWood, signal("action_completed"), context()), false);
  assert.equal(
    triggerMatches(needsWood, signal("action_completed"), context({ itemCounts: { wood: 2 } })),
    false,
  );
  assert.equal(
    triggerMatches(needsWood, signal("action_completed"), context({ itemCounts: { wood: 3 } })),
    true,
  );
});

// ---- 概率 ----

test("概率掷点，roll 可注入所以能定住", () => {
  const maybe = trigger({ chance: 0.3 });

  assert.equal(triggerMatches(maybe, signal("action_completed"), context({ roll: () => 0.29 })), true);
  assert.equal(triggerMatches(maybe, signal("action_completed"), context({ roll: () => 0.3 })), false);
  assert.equal(triggerMatches(maybe, signal("action_completed"), context({ roll: () => 0.9 })), false);
});

test("概率必须放在最后掷：前面条件不满足时一次点都不能掷", () => {
  // 否则同一条规则的命中率会随"被无关信号扫过几次"变化
  let rolls = 0;
  const counted = context({
    weatherId: "sunny",
    roll: () => {
      rolls += 1;
      return 0;
    },
  });

  triggerMatches(trigger({ weatherIs: "storm", chance: 0.5 }), signal("action_completed"), counted);
  assert.equal(rolls, 0, "天气就没对上，不该白掷一次点");

  triggerMatches(trigger({ weatherIs: "sunny", chance: 0.5 }), signal("action_completed"), counted);
  assert.equal(rolls, 1);
});

test("多个条件同时存在时全都要满足", () => {
  const strict = trigger({
    subject: "work_study",
    signalCount: 2,
    minWorldDayId: "2026-08-10",
    weatherIs: "rain",
    requiresItem: { itemId: "notebook", quantity: 1 },
    requiresEventStage: { eventId: "school", stageId: "term_1" },
  });
  const sig = signal("action_completed", "work_study");

  const ok = context({
    weatherId: "rain",
    itemCounts: { notebook: 1 },
    signalCounts: { "action_completed|work_study": 2 },
    eventStage: () => "term_1",
  });
  assert.equal(triggerMatches(strict, sig, ok), true);

  // 抽掉任何一条都不该过
  assert.equal(triggerMatches(strict, sig, { ...ok, weatherId: "sunny" }), false);
  assert.equal(triggerMatches(strict, sig, { ...ok, itemCounts: {} }), false);
  assert.equal(triggerMatches(strict, sig, { ...ok, worldDayId: "2026-08-01" }), false);
  assert.equal(triggerMatches(strict, sig, { ...ok, eventStage: () => "term_2" }), false);
});

// ---- requiresFeature（期 0 · 小动物经济圈）----

test("requiresFeature：没解锁不命中，解锁了就命中", () => {
  const gated = trigger({ requiresFeature: "plot.east_grove" });
  const sig = signal("action_completed");

  assert.equal(triggerMatches(gated, sig, context()), false);
  assert.equal(
    triggerMatches(
      gated,
      sig,
      context({ isFeatureUnlocked: (id) => id === "plot.east_grove" }),
    ),
    true,
  );
});

// ---- 抽签池 ----

const POOL = { poolId: "resident_arrival", base: 0.12, step: 0.08, max: 1 };

test("poolChance：base + step × 错过次数，封顶 max", () => {
  assert.equal(poolChance(POOL, 0), 0.12);
  // 浮点相加会带尾差，用近似比较——曲线钉的是形状不是第 17 位小数
  assert.ok(Math.abs(poolChance(POOL, 5) - 0.52) < 1e-9);
  assert.equal(poolChance(POOL, 20), 1);
  // 负数错过按 0 算（防御：存档被手改出负数不该把概率拉到 base 以下）
  assert.equal(poolChance(POOL, -3), 0.12);
});

test("drawFromPool：候选为空什么都不发生，也不累积错过", () => {
  const outcome = drawFromPool(POOL, [], 4, "2026-08-24");
  assert.equal(outcome.hit, null);
  assert.equal(outcome.nextMisses, 4);
});

test("drawFromPool：错过 +1，命中归零；max=1 时有限次内必中", () => {
  const candidates = ["slime", "fox", "spirit"];
  let misses = 0;
  let hit: string | null = null;
  let days = 0;

  // 每"天"换一个 worldDayId——同一天重掷是确定性的，永远同一个结果
  while (hit === null && days < 20) {
    const outcome = drawFromPool(POOL, candidates, misses, `2026-09-${String(days + 1).padStart(2, "0")}`);
    if (outcome.hit === null) {
      assert.equal(outcome.nextMisses, misses + 1);
    } else {
      assert.equal(outcome.nextMisses, 0);
    }
    misses = outcome.nextMisses;
    hit = outcome.hit;
    days += 1;
  }

  // base .12 / step .08 到第 12 次错过就是 1.0，20 天是宽裕的上界
  assert.notEqual(hit, null);
  assert.ok(candidates.includes(hit as string));
});

test("drawFromPool：同一天同状态重掷，结果一字不差（重开刷不出人来）", () => {
  const candidates = ["slime", "fox", "spirit"];
  const first = drawFromPool(POOL, candidates, 11, "2026-08-24");
  const second = drawFromPool(POOL, candidates, 11, "2026-08-24");
  assert.deepEqual(first, second);
});

test("drawFromPool：掷点和挑人分种子——候选变了，中不中不跟着翻", () => {
  // misses 抬到必中，专看"是谁"那一半
  const three = drawFromPool(POOL, ["slime", "fox", "spirit"], 12, "2026-08-24");
  const four = drawFromPool(POOL, ["slime", "fox", "spirit", "badger"], 12, "2026-08-24");
  assert.notEqual(three.hit, null);
  assert.notEqual(four.hit, null);
});
