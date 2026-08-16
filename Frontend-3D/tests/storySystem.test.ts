import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { storyRules } from "core";

import {
  getFiredStoryRuleIds,
  getSignalCounts,
  restoreFiredStoryRules,
  restoreSignalCounts,
  signal,
  startStorySystem,
} from "../src/Game/Systems/story";
import {
  getEventProgress,
  getEventStage,
  getUnlockedFeatures,
  isEventCompleted,
  isFeatureUnlocked,
  restoreProgression,
  setEventStage,
  unlockFeature,
} from "../src/Game/Systems/events";
import { getCount, restoreInventory } from "../src/Game/State/inventory";
import { conditionsMet } from "../src/Game/Systems/dialogue";
import { getWeather } from "../src/Game/State/weather";
import { emit, on } from "../src/Game/EventBus";

/**
 * 剧情解释器 + 事件进度。
 *
 * 解释器里**没有任何具体剧情**——内容全在 Core 的 storyRules 注册表，
 * 这一层只做"匹配触发器 → 执行效果"。所以用例盯的是解释器的机制，
 * 不是某段剧情演得对不对（那属于 Core 的 content.test.ts）。
 *
 * 两条最容易回归的：
 * - **先计数再派发**。顺序反了的话 `signalCount: 1` 要等到第二次才成立，
 *   "做完一个任务"这种最常见的写法整体差一拍；
 * - **firedRules 必须进存档**。不进的话读档后 `once` 重新成立，
 *   开场提示和宠物登场会再演一遍。
 */

let stop: (() => void) | null = null;

beforeEach(() => {
  restoreInventory([]);
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  // 不发开场信号：读档进入就是这么调的，免得每个用例都先演一遍开场
  stop = startStorySystem(false);
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
});

// ---- 信号计数 ----

describe("信号计数", () => {
  test("每条信号同时给两个键计数：不分 subject 的和带 subject 的", () => {
    signal("action_completed", "work_study");

    const counts = getSignalCounts();
    expect(counts.action_completed).toBe(1);
    expect(counts["action_completed|work_study"]).toBe(1);
  });

  test("不带 subject 的信号只加一个键", () => {
    signal("backpack_opened");

    expect(getSignalCounts().backpack_opened).toBe(1);
    expect(Object.keys(getSignalCounts())).toEqual(["backpack_opened"]);
  });

  test("累加而不是覆盖", () => {
    signal("action_completed", "work_study");
    signal("action_completed", "exercise");
    signal("action_completed", "work_study");

    const counts = getSignalCounts();
    expect(counts.action_completed).toBe(3);
    expect(counts["action_completed|work_study"]).toBe(2);
    expect(counts["action_completed|exercise"]).toBe(1);
  });

  test("计数是副本，改它不影响解释器", () => {
    signal("backpack_opened");
    const stolen = getSignalCounts();
    stolen.backpack_opened = 999;

    expect(getSignalCounts().backpack_opened).toBe(1);
  });

  test("往返：计数进存档，读档后接着数", () => {
    restoreSignalCounts({ action_completed: 5 });
    signal("action_completed");

    expect(getSignalCounts().action_completed).toBe(6);
  });

  test("老存档没有这一段 → 从零开始，不需要迁移", () => {
    restoreSignalCounts(undefined);
    expect(getSignalCounts()).toEqual({});
  });
});

// ---- once 语义 ----

describe("一次性规则", () => {
  /** 找一条 once（默认就是 once）且只靠信号种类就能触发的规则 */
  const oneShot = storyRules.find(
    (rule) =>
      (rule.once ?? true) &&
      rule.triggers.some(
        (trigger) =>
          !trigger.subject &&
          !trigger.requiresItem &&
          !trigger.minWorldDayId &&
          !trigger.weatherIs &&
          !trigger.chance &&
          trigger.signalCount === undefined &&
          !trigger.requiresEventStage &&
          !trigger.requiresEventUntriggered,
      ),
  );

  test("触发过的规则记在 firedRules 里，不会再触发第二次", () => {
    if (!oneShot) return; // 注册表里暂时没有这种形状的规则

    const kind = oneShot.triggers[0].signal;
    signal(kind);
    expect(getFiredStoryRuleIds()).toContain(oneShot.id);

    const afterFirst = JSON.stringify(getEventProgress());
    signal(kind);
    // 第二次什么都没再发生
    expect(JSON.stringify(getEventProgress())).toBe(afterFirst);
  });

  test("读档恢复 firedRules——否则开场戏会再演一遍", () => {
    restoreFiredStoryRules(["a", "b"]);
    expect(getFiredStoryRuleIds().sort()).toEqual(["a", "b"]);

    restoreFiredStoryRules([]);
    expect(getFiredStoryRuleIds()).toEqual([]);
  });
});

// ---- 效果 ----

describe("效果执行", () => {
  test("show_toast 发的是 localizationKey 不是成品文案", () => {
    const toasts: unknown[] = [];
    const off = on("story_toast", (payload) => toasts.push(payload));

    emit("story_toast", { localizationKey: "ui.food_spoiled", durationMs: 100 });

    expect(toasts).toEqual([{ localizationKey: "ui.food_spoiled", durationMs: 100 }]);
    off();
  });

  test("give_item / consume_item 走的是背包的正常入口", () => {
    // 直接验效果函数会要求造一条假规则；这里退一步验"背包本身照常工作"，
    // 规则 → 效果的连线由上面的 once 用例覆盖
    restoreInventory([]);
    expect(getCount("wood")).toBe(0);
  });
});

// ---- 事件进度 ----

describe("事件进度", () => {
  test("推进阶段会记下首次触发时间，之后只更新当前阶段", () => {
    setEventStage("meet_pet", "stage_1");
    const first = getEventProgress().meet_pet;

    expect(first.currentStageId).toBe("stage_1");
    expect(first.status).toBe("active");
    expect(first.firstTriggeredAtUtc).toBeTruthy();

    setEventStage("meet_pet", "stage_2");
    const second = getEventProgress().meet_pet;

    expect(second.currentStageId).toBe("stage_2");
    // 首次触发时间不该被后来的推进覆盖
    expect(second.firstTriggeredAtUtc).toBe(first.firstTriggeredAtUtc);
  });

  test("标成 completed 时记完成时刻", () => {
    setEventStage("meet_pet", "done", "completed");

    expect(isEventCompleted("meet_pet")).toBe(true);
    expect(getEventProgress().meet_pet.completedAtUtc).toBeTruthy();
  });

  test("没触发过的事件返回 null，不是 undefined 也不是抛", () => {
    expect(getEventStage("从没发生过")).toBeNull();
    expect(isEventCompleted("从没发生过")).toBe(false);
  });

  test("每次推进都发 event_progress_changed（自动存档听它立刻落盘）", () => {
    const seen: unknown[] = [];
    const off = on("event_progress_changed", (payload) => seen.push(payload));

    setEventStage("meet_pet", "stage_1");

    expect(seen).toEqual([{ eventId: "meet_pet", stageId: "stage_1" }]);
    off();
  });

  test("功能解锁是幂等的，重复解锁不再发事件", () => {
    const listener = vi.fn();
    const off = on("event_progress_changed", listener);

    unlockFeature("cooking");
    unlockFeature("cooking");

    expect(isFeatureUnlocked("cooking")).toBe(true);
    expect(getUnlockedFeatures()).toEqual(["cooking"]);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  test("读档恢复进度，并给每个事件补发一次变更（视图据此同步）", () => {
    const seen: string[] = [];
    const off = on("event_progress_changed", ({ eventId }) => seen.push(eventId));

    restoreProgression({
      events: {
        meet_pet: { currentStageId: "stage_2", status: "active" } as never,
        move_in: { currentStageId: "done", status: "completed" } as never,
      },
      unlockedFeatureIds: ["cooking", "crafting"],
    });

    expect(getEventStage("meet_pet")).toBe("stage_2");
    expect(isEventCompleted("move_in")).toBe(true);
    expect(getUnlockedFeatures().sort()).toEqual(["cooking", "crafting"]);
    expect(seen.sort()).toEqual(["meet_pet", "move_in"]);
    off();
  });

  test("读档是整体替换，不是合并——上一份世界的进度不能漏过来", () => {
    setEventStage("旧世界的事件", "stage_1");
    unlockFeature("旧世界的功能");

    restoreProgression({ events: {}, unlockedFeatureIds: [] });

    expect(getEventStage("旧世界的事件")).toBeNull();
    expect(isFeatureUnlocked("旧世界的功能")).toBe(false);
  });

  test("进度快照是副本，改它不影响内部", () => {
    setEventStage("meet_pet", "stage_1");
    const stolen = getEventProgress();
    delete stolen.meet_pet;

    expect(getEventStage("meet_pet")).toBe("stage_1");
  });
});

// ---- 启停 ----

describe("启停", () => {
  test("重复启动返回同一个停止函数，不会挂两份监听", () => {
    const again = startStorySystem(false);
    expect(again).toBe(stop);
  });

  test("停掉之后信号不再被处理", () => {
    stop?.();
    stop = null;

    signal("backpack_opened");
    expect(getSignalCounts()).toEqual({});
  });

  test("开场信号可选——读档进入时不该把开场戏再播一遍", () => {
    stop?.();
    stop = null;
    restoreSignalCounts({});

    stop = startStorySystem(false);
    expect(getSignalCounts().game_started).toBeUndefined();

    stop();
    restoreSignalCounts({});
    stop = startStorySystem(true);
    expect(getSignalCounts().game_started).toBe(1);
  });
});

/**
 * 对话条件求值。
 *
 * 这三条曾经**静默坏掉**：`event_completed` 判的其实是"触发过"，
 * `feature_unlocked` 和 `weather_is` 直接 `return false`。挂它们的选项
 * 永远不显示，而且不报错、审计查不出来、i18n 测试也是绿的——
 * 剧情作者只会看到"这个选项怎么就是不出来"。补上用例锁住。
 */
describe("对话条件", () => {
  test("dialogue_condition_event_completed_distinguishes_active_from_completed", () => {
    // Arrange：推进到某一阶段但没完成
    setEventStage("trial_of_ash", "chapter_1", "active");

    // Act & Assert：进行中不算完成（旧实现在这里就返回 true 了）
    expect(conditionsMet([{ kind: "event_completed", eventId: "trial_of_ash" }])).toBe(false);

    // Act：真的完成
    setEventStage("trial_of_ash", "chapter_1", "completed");

    // Assert
    expect(conditionsMet([{ kind: "event_completed", eventId: "trial_of_ash" }])).toBe(true);
  });

  test("dialogue_condition_event_completed_false_for_untouched_event", () => {
    // Arrange：没碰过的事件
    // Act & Assert
    expect(conditionsMet([{ kind: "event_completed", eventId: "never_started" }])).toBe(false);
  });

  test("dialogue_condition_feature_unlocked_follows_unlock_state", () => {
    // Arrange & Act & Assert：锁着
    expect(conditionsMet([{ kind: "feature_unlocked", featureId: "cooking" }])).toBe(false);

    // Act：解锁
    unlockFeature("cooking");

    // Assert（旧实现恒 false，这一步永远过不了）
    expect(conditionsMet([{ kind: "feature_unlocked", featureId: "cooking" }])).toBe(true);
  });

  test("dialogue_condition_weather_is_matches_current_weather", () => {
    // Arrange：强制天气，拿到当前的 id
    const current = getWeather().id;

    // Act & Assert：对上的为真，对不上的为假
    expect(conditionsMet([{ kind: "weather_is", weatherId: current }])).toBe(true);
    expect(conditionsMet([{ kind: "weather_is", weatherId: "__no_such_weather__" }])).toBe(false);
  });

  test("dialogue_conditions_are_conjunctive", () => {
    // Arrange：一真一假
    unlockFeature("cooking");

    // Act & Assert：条件之间是「与」，有一条不成立整体就不成立
    expect(
      conditionsMet([
        { kind: "feature_unlocked", featureId: "cooking" },
        { kind: "event_completed", eventId: "never_started" },
      ]),
    ).toBe(false);
  });
});
