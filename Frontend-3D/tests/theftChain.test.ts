import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { theftTuning } from "core";

import { emit } from "../src/Game/EventBus";
import {
  getGold,
  restoreBaseGold,
} from "../src/Game/State/gold";
import { restoreBuildings } from "../src/Game/State/buildings";
import { restoreChatLog } from "../src/Game/State/chatLog";
import { replaceCounts } from "../src/Game/State/inventory";
import { getResident, removeResident, spawnResident } from "../src/Game/State/residentsRuntime";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";
import {
  getEventStage,
  isFeatureUnlocked,
  restoreProgression,
  setEventStage,
} from "../src/Game/Systems/events";
import {
  restoreFiredStoryRules,
  restorePoolMisses,
  restoreSignalCounts,
  startStorySystem,
} from "../src/Game/Systems/story";
import { restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { getClock } from "../src/Game/State/clock";
import {
  buyItem,
  epochDayOf,
  isOtterScheduledOn,
  sellItem,
  sellPriceOf,
  syncTraderPresence,
  wantedToday,
} from "../src/Game/Systems/trading";

/**
 * 失窃链（期 3）：剧情引擎重写后的**第一条真实剧情**在引擎上整条跑一遍。
 *
 * 五幕一天一步：落成 / 失窃 / 上门 / 见贼 / 了结。这里不测演出
 * （对话面板、登场过场），测的是**状态推进**：阶段、金币、在场、解锁。
 */

let stops: Array<() => void> = [];

/** 过一天：翻页事件 → story 翻译成 day_started → 规则派发 */
function nextDay(): void {
  emit("world_day_changed", { worldDayId: "test", previousWorldDayId: "test-1" });
  // spawn_resident / start_dialogue 都挂在 setTimeout 上，拨过去
  vi.advanceTimersByTime(10_000);
}

beforeEach(() => {
  vi.useFakeTimers();
  setRemoteWorldActive(false);
  restoreBuildings([]);
  replaceCounts({});
  restoreBaseGold(10); // 钱匣满着：偷 8 剩 2，看得出"掉了一截"
  restoreChatLog([]);
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restorePoolMisses({});
  restoreDayFacts([]);
  removeResident("pet-otter");
  removeResident("pet-dragon");
  stops.push(startStorySystem(false));
});

afterEach(() => {
  for (const stop of stops) stops = (stop(), []);
  removeResident("pet-otter");
  removeResident("pet-dragon");
  vi.useRealTimers();
});

test("theft_五幕一天一步_金币净损失为零", () => {
  // 第一幕：金库完工（发的是 EventBus 事件，story 翻译成信号）
  emit("building_completed", { buildingId: "gold_jar", instanceId: "b1" });
  expect(getEventStage("gold_theft")).toBe("eyed");
  expect(getGold()).toBe(10);

  // 第二幕：次日被偷
  nextDay();
  expect(getEventStage("gold_theft")).toBe("robbed");
  expect(getGold()).toBe(10 - theftTuning.amount);

  // 第三幕：水獭上门（同一天不再推进——day_started 一天只有一次）
  nextDay();
  expect(getEventStage("gold_theft")).toBe("chasing");
  expect(getResident("pet-otter")).toBeTruthy();

  // 第四幕：小龙被拎回来。**钱还没还**——见贼和追赃分开
  nextDay();
  expect(getEventStage("gold_theft")).toBe("caught");
  expect(getResident("pet-dragon")).toBeTruthy();
  expect(getGold()).toBe(10 - theftTuning.amount);

  // 第五幕：全额奉还 + 解锁交易
  nextDay();
  expect(getEventStage("gold_theft")).toBe("settled");
  expect(getGold()).toBe(10);
  expect(isFeatureUnlocked("merchant_trading")).toBe(true);
});

test("theft_排队的工地不拉链_只有完工才算", () => {
  // building_completed 由 finishSite 发——这里直接断言"没发就没反应"
  nextDay();
  nextDay();
  expect(getEventStage("gold_theft")).toBeNull();
  expect(getGold()).toBe(10);
});

test("theft_放弃追讨_钱不回来龙不被抓_但交易照样解锁", () => {
  emit("building_completed", { buildingId: "gold_jar", instanceId: "b1" });
  nextDay(); // 偷
  nextDay(); // 水獭上门，chasing

  // 玩家在对话里选了"不用管它"（对话选项的 emitEventId 走 dialogue_event）
  emit("story_signal", { kind: "dialogue_event", subject: "theft_waived" });
  expect(getEventStage("gold_theft")).toBe("settled");
  expect(isFeatureUnlocked("merchant_trading")).toBe(true);

  // 之后再多少天：钱不回来，龙不出现
  nextDay();
  nextDay();
  expect(getGold()).toBe(10 - theftTuning.amount);
  expect(getResident("pet-dragon")).toBeUndefined();
});

test("theft_离线七天回来只推一步_剧情不在你不在时自己演完", () => {
  emit("building_completed", { buildingId: "gold_jar", instanceId: "b1" });
  // 期 0 定的：离线多天开机只补发一次 world_day_changed。
  // 所以"离线七天"落到信号层就是一次 day_started——链只走一步
  nextDay();
  expect(getEventStage("gold_theft")).toBe("robbed");
  expect(getGold()).toBe(10 - theftTuning.amount);
});

// ---- 交易 ----

test("trading_班表是固定周期_三天一趟数得出来", () => {
  const hits = [];
  for (let i = 0; i < 9; i += 1) {
    const day = new Date(Date.UTC(2026, 7, 20 + i)).toISOString().slice(0, 10);
    if (isOtterScheduledOn(day)) hits.push(day);
  }
  expect(hits).toHaveLength(3);
  // 相邻两次正好差 3 天
  expect(epochDayOf(hits[1]) - epochDayOf(hits[0])).toBe(3);
  expect(epochDayOf(hits[2]) - epochDayOf(hits[1])).toBe(3);
});

test("trading_想要清单同一天两次一致_重开面板刷不出新行情", () => {
  const first = [...wantedToday()].sort();
  const second = [...wantedToday()].sort();
  expect(first).toEqual(second);
  expect(first.length).toBeGreaterThan(0);
});

test("trading_卖一件_钱按行情进库_东西离包", () => {
  setEventStage("gold_theft", "chasing"); // 剧情把他按在场上
  restoreBaseGold(0);
  replaceCounts({ furniture_table: 2 });

  const price = sellPriceOf("furniture_table");
  const outcome = sellItem("furniture_table");

  expect(outcome).toEqual({ ok: true, gold: price });
  expect(getGold()).toBe(Math.min(10, price)); // 钱匣容量 10，溢出照规则丢
  expect(price).toBeGreaterThan(0);
});

test("trading_买一份食材_扣钱入包_六道菜第一次有了来源", () => {
  setEventStage("gold_theft", "chasing");
  restoreBaseGold(10);
  replaceCounts({});

  const outcome = buyItem("rice");

  expect(outcome.ok).toBe(true);
  expect(getGold()).toBe(10 - (outcome.ok ? outcome.gold : 0));
});

test("trading_他不在场时卖不了_按了也只说人不在", () => {
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  replaceCounts({ furniture_table: 1 });

  const outcome = sellItem("furniture_table");
  expect(outcome).toEqual({ ok: false, reason: "not_here" });
});

test("trading_图纸和无价物卖不掉_套现口子焊死", () => {
  setEventStage("gold_theft", "chasing");
  replaceCounts({ blueprint_gold_jar: 1, golem_head: 1 });

  expect(sellItem("blueprint_gold_jar")).toEqual({ ok: false, reason: "no_value" });
  expect(sellItem("golem_head")).toEqual({ ok: false, reason: "no_value" });
});

test("trading_事件结了龙就被送走_日同步收尾", () => {
  spawnResident("pet-dragon", "coin_dragon");
  expect(getResident("pet-dragon")).toBeTruthy();

  setEventStage("gold_theft", "settled", "completed");
  syncTraderPresence();

  expect(getResident("pet-dragon")).toBeUndefined();
});

test("trading_不在班表的日子_水獭被日同步送走", () => {
  // 解锁了交易、但今天多半不是他的班（是的话事件也没把他按住）
  restoreProgression({ events: {}, unlockedFeatureIds: ["merchant_trading"] });
  spawnResident("pet-otter", "otter_trader");

  syncTraderPresence();

  /*
   * 今天在不在班表上是日期决定的；两种都合法，但**状态必须和班表一致**。
   *
   * 问的必须是**世界日**，不能是 `new Date().toISOString()`。后者是 UTC 日期，
   * 而 `syncTraderPresence` 走的是 `getClock().worldDayId`（本地日历日）——
   * 两者在本地时间跨过 UTC 零点之后就错开一天（多伦多是每天 20:00 之后），
   * 于是这条测试每天晚上都会挂，白天又是好的。原来就是这么写的，只是
   * 平时不在那个时段跑，没人撞上。
   */
  const shouldBeHere = isOtterScheduledOn(getClock().worldDayId);
  expect(Boolean(getResident("pet-otter"))).toBe(shouldBeHere);
});
