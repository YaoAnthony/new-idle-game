import { expect, test } from "vitest";
import {
  DayPhaseId,
  WeatherKind,
  autoLifeTuning,
  decideBreak,
  findAutoBehavior,
  inMealWindow,
  type AutoLifeSnapshot,
  type AutoStepKind,
} from "core";

/**
 * 自动生活的决策（Core 纯函数）。
 *
 * 这些用例钉的是**行为契约**，不是具体数字——数字全从 `autoLifeTuning`
 * 现读，调平衡不该弄红测试（内容零硬编码在测试侧的对应物）。
 * 例外只有一条：雨天看伞是用户点名的规矩，单独钉。
 */

const T = autoLifeTuning;

/** 当天第一个不在饭点的分钟——饭点改了，基线也不会误踩进饭点 */
const NOT_MEAL_TIME = Array.from({ length: 24 * 60 }, (_, minute) => minute).find(
  (minute) => !inMealWindow(minute),
)!;
const MEAL_TIME = T.mealWindows[0].fromMinute;

/** 骰子落在出门那一段 */
const ROLL_OUTING = 0;
/** 骰子落在只够溜达的那一段 */
const ROLL_STROLL = T.outingChance + T.strollChance / 2;
/** 骰子最差：两段都不中 */
const ROLL_NONE = 1;

/**
 * 基线："坐了很久、不饿不累、不在饭点、晴天白天、门能出、有空床、什么都没冷却"。
 * 各用例在它上面只改一两个变量。
 */
const settled: AutoLifeSnapshot = {
  hunger: 100,
  fatigue: 100,
  edibleCount: 99,
  secondsSinceBreak: T.minWorkSeconds + 1,
  minuteOfDay: NOT_MEAL_TIME,
  dayPhase: DayPhaseId.Day,
  weatherKind: WeatherKind.Sunny,
  hasUmbrella: false,
  canGoOutside: true,
  hasFreeBed: true,
  secondsSinceStep: {},
};

test("autoLife_饿了且存粮够_起身吃饭", () => {
  const plan = decideBreak(
    { ...settled, hunger: T.hungerThreshold - 1 },
    ROLL_NONE, // 骰子最差也要去：吃饭是需求驱动，不掷骰子
  );
  expect(plan?.kind).toBe("eat");
  expect(plan!.dwellSeconds).toBeGreaterThan(0);
});

test("autoLife_饿了但存粮见底_饿着也不吃", () => {
  // 保险丝：自动模式动真库存，最后几份留给玩家自己决定
  const plan = decideBreak(
    {
      ...settled,
      hunger: T.hungerThreshold - 1,
      edibleCount: T.minEdibleCount - 1,
    },
    ROLL_NONE,
  );
  expect(plan).toBeNull();
});

test("autoLife_刚回工位_粘性期内谁都拽不动", () => {
  // 行为长而稳是"声音是本体"的直接推论：音景频繁切换是噪音
  const plan = decideBreak(
    {
      ...settled,
      hunger: T.hungerThreshold - 1, // 饿
      fatigue: 0, //                   累
      secondsSinceBreak: T.minWorkSeconds - 1, // 但刚坐下
    },
    ROLL_OUTING, // 骰子也最好
  );
  expect(plan).toBeNull();
});

test("autoLife_到了饭点_不太饿也去吃_不在饭点就不去", () => {
  const hunger = T.mealHungerThreshold - 1;

  expect(decideBreak({ ...settled, hunger, minuteOfDay: MEAL_TIME }, ROLL_NONE)?.kind).toBe(
    "eat",
  );
  expect(decideBreak({ ...settled, hunger }, ROLL_NONE)).toBeNull();
});

test("autoLife_饭点也守保险丝_存粮见底不吃", () => {
  const plan = decideBreak(
    {
      ...settled,
      hunger: T.mealHungerThreshold - 1,
      minuteOfDay: MEAL_TIME,
      edibleCount: T.minEdibleCount - 1,
    },
    ROLL_NONE,
  );
  expect(plan).toBeNull();
});

test("autoLife_精力低且有空床_去躺一会儿_没床不躺", () => {
  const tired = { ...settled, fatigue: T.napFatigueThreshold - 1 };

  expect(decideBreak(tired, ROLL_NONE)?.kind).toBe("nap");
  expect(decideBreak({ ...tired, hasFreeBed: false }, ROLL_NONE)).toBeNull();
});

test("autoLife_又饿又累_先吃饭", () => {
  const plan = decideBreak(
    {
      ...settled,
      hunger: T.hungerThreshold - 1,
      fatigue: T.napFatigueThreshold - 1,
    },
    ROLL_NONE,
  );
  expect(plan?.kind).toBe("eat");
});

test("autoLife_吃饭优先于溜达", () => {
  // 同一次评估里两个都触发时，需求赢过演出
  const plan = decideBreak({ ...settled, hunger: T.hungerThreshold - 1 }, ROLL_STROLL);
  expect(plan?.kind).toBe("eat");
});

test("autoLife_晴天骰子落在出门段_出门不撑伞", () => {
  const plan = decideBreak(settled, ROLL_OUTING);
  expect(plan?.kind).toBe("outing");
  expect(plan?.umbrella).toBe(false);
});

test("autoLife_雨天看伞是用户定的规矩", () => {
  // 用户原话：下雨判断背包里有没有伞，有就撑伞出门，没有就尽量不出门
  expect(T.outingWeather[WeatherKind.Rain]).toBe("umbrella");
});

test("autoLife_下雨背包有伞_撑伞出门", () => {
  const plan = decideBreak(
    { ...settled, weatherKind: WeatherKind.Rain, hasUmbrella: true },
    ROLL_OUTING,
  );
  expect(plan?.kind).toBe("outing");
  expect(plan?.umbrella).toBe(true);
});

test("autoLife_下雨没伞_不出门_那一拍落进屋里溜达", () => {
  const plan = decideBreak(
    { ...settled, weatherKind: WeatherKind.Rain, hasUmbrella: false },
    ROLL_OUTING,
  );
  expect(plan?.kind).toBe("stroll");
});

test("autoLife_天气表写着不出的天气_有伞也不出", () => {
  const stayKinds = Object.values(WeatherKind).filter(
    (kind) => T.outingWeather[kind] === "stay",
  );
  for (const weatherKind of stayKinds) {
    const plan = decideBreak({ ...settled, weatherKind, hasUmbrella: true }, ROLL_OUTING);
    expect(plan?.kind, weatherKind).toBe("stroll");
  }
});

test("autoLife_不在出门时段_不出门", () => {
  const closedPhases = Object.values(DayPhaseId).filter(
    (phase) => !T.outingPhases.includes(phase),
  );
  for (const dayPhase of closedPhases) {
    expect(decideBreak({ ...settled, dayPhase }, ROLL_OUTING)?.kind, dayPhase).toBe(
      "stroll",
    );
  }
});

test("autoLife_大门锁着_不出门", () => {
  expect(decideBreak({ ...settled, canGoOutside: false }, ROLL_OUTING)?.kind).toBe(
    "stroll",
  );
});

test("autoLife_冷却中的那一行跳过_往下看而不是整拍作罢", () => {
  // 回归：原来吃饭冷却在计划器里直接 return，那一拍连溜达的骰子都不掷
  const plan = decideBreak(
    { ...settled, hunger: T.hungerThreshold - 1, secondsSinceStep: { eat: 1 } },
    ROLL_STROLL,
  );
  expect(plan?.kind).toBe("stroll");
});

test("autoLife_冷却刚好到点_又可以排", () => {
  const cooldown = findAutoBehavior("outing")!.cooldownSeconds;

  expect(
    decideBreak({ ...settled, secondsSinceStep: { outing: cooldown - 1 } }, ROLL_OUTING)
      ?.kind,
  ).toBe("stroll");
  expect(
    decideBreak({ ...settled, secondsSinceStep: { outing: cooldown } }, ROLL_OUTING)?.kind,
  ).toBe("outing");
});

test("autoLife_骰子两段都不中_接着干活", () => {
  expect(decideBreak(settled, T.outingChance + T.strollChance + 0.001)).toBeNull();
  expect(decideBreak(settled, ROLL_NONE)).toBeNull();
});

test("autoLife_每种步子在行为表里都有一行_等到位的时限是正数", () => {
  const kinds: AutoStepKind[] = ["work", "eat", "nap", "outing", "stroll"];
  for (const kind of kinds) {
    const behavior = findAutoBehavior(kind);
    expect(behavior, kind).toBeDefined();
    expect(behavior!.arriveTimeoutSeconds, kind).toBeGreaterThan(0);
  }
});
