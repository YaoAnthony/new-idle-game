import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { autoLifeTuning, findAutoBehavior, type AutoStepKind } from "core";

import { emit, on } from "../src/Game/EventBus";
import { cancelAction, startAction } from "../src/Game/Systems/actions";
import {
  describeAutoLife,
  forceAutoStep,
  startAutoLife,
} from "../src/Game/Systems/autoLife";
import { eatInventoryItem } from "../src/Game/Systems/itemUse";
import { addItem, getCounts, replaceCounts } from "../src/Game/State/inventory";
import { getNeeds, restoreNeeds } from "../src/Game/State/needs";
import { debugClearWeather, debugForceWeather } from "../src/Game/State/weather";

/**
 * 自动生活的计划器（专注模式 01·乙）：发步子 → 到位 → 演出 → 结算 → 回工位。
 *
 * 决策本身在 `autoLife.test.ts`（Core 纯函数）；这一份钉的是**接线**：
 * 小睡在演出结束才回精力、吃失败不开冷却、出门的到位时限够走完一圈、
 * 雨天有伞时发给场景的那一步带着伞。场景不在，`auto_step_arrived` 由用例代发。
 */

let stopAutoLife: (() => void) | null = null;
let offSteps: (() => void) | null = null;
let steps: Array<{ step: AutoStepKind; umbrella?: boolean }> = [];

/*
 * 冷却记在计划器的模块状态里、跨用例留着（它本来就该跨行动留着）。
 * 每条用例把墙钟拨到更晚的一天，上一条留下的冷却就全过期了。
 */
let day = 0;

beforeEach(() => {
  day += 1;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2030, 0, day, 10, 0, 0));
  replaceCounts({});
  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);

  steps = [];
  offSteps = on("auto_step_changed", (event) => steps.push(event));
  stopAutoLife = startAutoLife();
  // 一条长行动：计划器跟着 action_changed(started) 起来
  expect(startAction("work_study", "写论文", 3600)).toBe(true);
});

afterEach(() => {
  cancelAction();
  stopAutoLife?.();
  offSteps?.();
  debugClearWeather();
  vi.useRealTimers();
});

test("autoLifePlanner_小睡躺满才回精力_中途不给_躺完回工位", () => {
  // Arrange
  const before = getNeeds().fatigue;
  const dwellMs = findAutoBehavior("nap")!.dwellSeconds * 1000;
  expect(forceAutoStep("nap")).toBe(true);
  expect(steps.at(-1)?.step).toBe("nap");

  // Act：身体到位（床上躺下了），演出计时开始
  emit("auto_step_arrived", { step: "nap" });
  vi.advanceTimersByTime(dwellMs - 100);

  // Assert：没躺满不回
  expect(getNeeds().fatigue).toBe(before);

  vi.advanceTimersByTime(200);
  expect(getNeeds().fatigue).toBe(Math.min(100, before + autoLifeTuning.napRestore));
  expect(steps.at(-1)?.step).toBe("work");
  // 冷却从躺完那一刻起算（上面躺满之后又走了 0.1 秒）
  expect(describeAutoLife().snapshot.secondsSinceStep.nap).toBeLessThan(1);
});

test("autoLifePlanner_饿了过了粘性期_下一拍就去吃_吃完扣真库存", () => {
  // Arrange
  addItem("fried_egg", 5);
  restoreNeeds({ hunger: autoLifeTuning.hungerThreshold - 10, fatigue: 100 }, undefined);

  // Act：粘性期内的节拍都不动，过了之后的第一拍去吃
  vi.advanceTimersByTime(
    (autoLifeTuning.minWorkSeconds + autoLifeTuning.replanSeconds) * 1000,
  );

  // Assert
  expect(steps.at(-1)?.step).toBe("eat");
  emit("auto_step_arrived", { step: "eat" });
  vi.advanceTimersByTime(findAutoBehavior("eat")!.dwellSeconds * 1000 + 100);
  expect(getCounts()["fried_egg"]).toBe(4);
  expect(describeAutoLife().snapshot.secondsSinceStep.eat).toBeDefined();
});

test("autoLifePlanner_演出期间吃的被拿走了_不算吃过_不开冷却", () => {
  // Arrange
  addItem("fried_egg", 2);
  expect(forceAutoStep("eat")).toBe(true);
  emit("auto_step_arrived", { step: "eat" });

  // Act：玩家在演出期间把吃的挪走了
  replaceCounts({});
  vi.advanceTimersByTime(findAutoBehavior("eat")!.dwellSeconds * 1000 + 100);

  /*
   * Assert：没吃成就不在冷却里。不断言"没有记录"——上一条用例真吃过一顿，
   * 那一笔隔天还在表里，只是早就过期了；要钉的是"这一次没有新盖戳"。
   */
  const since = describeAutoLife().snapshot.secondsSinceStep.eat;
  expect(since ?? Number.POSITIVE_INFINITY).toBeGreaterThan(
    findAutoBehavior("eat")!.cooldownSeconds,
  );
  expect(steps.at(-1)?.step).toBe("work");
});

test("autoLifePlanner_浇水那一步_发给场景_到位后进门喘口气就记冷却_到位时限比出门还长", () => {
  // 效果在剧本里当场落地，计划器这边只有"发步子、等到位、记冷却"三件事
  expect(findAutoBehavior("water")!.arriveTimeoutSeconds).toBeGreaterThan(findAutoBehavior("outing")!.arriveTimeoutSeconds);
  expect(forceAutoStep("water")).toBe(true);
  expect(steps.at(-1)?.step).toBe("water");
  const snapshot = describeAutoLife().snapshot;
  expect(snapshot).toHaveProperty("thirstyCells");
  expect(snapshot).toHaveProperty("wateringCan");
  expect(snapshot).toHaveProperty("hasWaterSource");

  emit("auto_step_arrived", { step: "water" });
  vi.advanceTimersByTime(findAutoBehavior("water")!.dwellSeconds * 1000 + 100);
  expect(steps.at(-1)?.step).toBe("work");
  expect(describeAutoLife().snapshot.secondsSinceStep.water).toBeLessThan(1);
});

test("itemUse_背包里已经没有这份_不报吃了", () => {
  // 回归：eat() 原来不看 eatFood 的返回值，一份没有也报 eaten
  replaceCounts({});
  expect(eatInventoryItem("fried_egg")).toBe("none");
});

test("autoLifePlanner_出门的到位时限够走完一圈_不按30秒截断", () => {
  // Arrange
  expect(forceAutoStep("outing")).toBe(true);

  // Act + Assert：过了老的 30 秒兜底，人还在路上
  vi.advanceTimersByTime(31_000);
  expect(describeAutoLife().phase).toBe("walking");

  vi.advanceTimersByTime(findAutoBehavior("outing")!.arriveTimeoutSeconds * 1000);
  expect(describeAutoLife().phase).not.toBe("walking");
});

test("autoLifePlanner_下雨背包有伞_出门那一步带着伞_没伞不带", () => {
  // Arrange
  debugForceWeather("rain");

  // Act + Assert：没伞
  expect(forceAutoStep("outing")).toBe(true);
  expect(steps.at(-1)).toEqual({ step: "outing", umbrella: false });

  // 有伞
  addItem(autoLifeTuning.umbrellaItemId, 1);
  expect(forceAutoStep("outing")).toBe(true);
  expect(steps.at(-1)).toEqual({ step: "outing", umbrella: true });
});

test("autoLifePlanner_不在专注时_强制也不动", () => {
  cancelAction();
  expect(forceAutoStep("nap")).toBe(false);
});
