import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  ActionPriority,
  Facing,
  PlacementSurface,
  actionExtendTuning,
  findActionDefinition,
  type ActionProcessSave,
} from "core";

import {
  addActionEntry,
  cancelAction,
  extendLastAction,
  extendOffer,
  getActionEntries,
  getActiveAction,
  getLastActionEnd,
  restoreAction,
  startAction,
  startActionEntry,
  whyCannotExtend,
} from "../src/Game/Systems/actions";
import { getClock } from "../src/Game/State/clock";
import { diaryDoneOn, restoreDiary } from "../src/Game/State/diary";
import { replaceCounts } from "../src/Game/State/inventory";
import { getNeeds, restoreNeeds } from "../src/Game/State/needs";
import { restoreDayFacts } from "../src/Game/Systems/dayRecord";
import {
  clearAllFurniture,
  replayPlaceFurniture,
} from "../src/Game/State/world";

/**
 * 做完了问"还没做完？再来 N 分钟"（专注模式 01·甲）。
 *
 * 钉的是规则不是卡片：接着做的那一轮是**一条新行动**（同名同类同重要级、
 * 不带计划 id），所以箱子、日记、名额都按普通行动各算各的——用户定的
 * "延长算另一个箱子"就落在这里。外加三种不该问 / 接不上的：取消的、
 * 读档补结算的、正在做着别的。
 */

const MINUTE = 60_000;

function placeDesk(): void {
  replayPlaceFurniture({
    instanceId: "test:furniture:furniture_study_desk#extend",
    furnitureId: "furniture_study_desk",
    placement: {
      kind: PlacementSurface.Floor,
      roomId: "living",
      gridPosition: { x: 0, y: 0 },
      facing: Facing.North,
    },
    state: {},
  });
}

/** 开一条 1 分钟的学习，等它到点 */
function finishOneMinuteStudy(name = "写完 assignment2"): void {
  expect(startAction("work_study", name, 60, ActionPriority.Normal)).toBe(true);
  vi.advanceTimersByTime(MINUTE + 1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  clearAllFurniture();
  placeDesk();
  replaceCounts({});
  restoreDayFacts([]);
  // 日记是奖励名额的分子，每条用例从空日记开始，免得前面的用例把名额吃掉
  restoreDiary(undefined);
  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);
});

afterEach(() => {
  cancelAction();
  vi.useRealTimers();
});

test("action_extend_到点后再来15分_开一条同名同类同重要级的新行动_不带计划id", () => {
  // Arrange：从日记本的一条计划开始，标了重要
  const entry = addActionEntry({
    actionId: "work_study",
    customName: "写完 assignment2",
    durationMinutes: 1,
    priority: ActionPriority.High,
  });
  expect(startActionEntry(entry.entryId)).toBe(true);
  vi.advanceTimersByTime(MINUTE + 1000);
  expect(getActionEntries().some((item) => item.entryId === entry.entryId)).toBe(
    false,
  );

  // Act
  const result = extendLastAction(15);

  // Assert
  expect(result).toBe("ok");
  const next = getActiveAction();
  expect(next?.customName).toBe("写完 assignment2");
  expect(next?.definitionId).toBe("work_study");
  expect(next?.priority).toBe(ActionPriority.High);
  expect(next?.durationMs).toBe(15 * MINUTE);
  // 计划在第一轮完成时已经划掉了，接着做的那轮不该再指着它
  expect(next?.entryId).toBeUndefined();
});

test("action_extend_接着做的那一轮到点_再开一个箱子_日记记两行", () => {
  // Arrange
  finishOneMinuteStudy();
  expect(extendLastAction(15)).toBe("ok");

  // Act
  vi.advanceTimersByTime(15 * MINUTE + 1000);

  // Assert：第二轮自己开了一个箱子
  const end = getLastActionEnd();
  expect(end?.completed).toBe(true);
  expect(end?.rewards).toHaveLength(1);
  // 两轮各一行，不合并——合并了名额和箱子就对不上
  const today = diaryDoneOn(getClock().worldDayId);
  expect(today.map((item) => item.minutes)).toEqual([1, 15]);
  expect(today.every((item) => item.gained !== undefined)).toBe(true);
});

test("action_extend_精力不够_接不上_精力也不扣", () => {
  // Arrange
  finishOneMinuteStudy();
  restoreNeeds({ hunger: 100, fatigue: 5 }, undefined);

  // Act
  const result = extendLastAction(30);

  // Assert
  expect(whyCannotExtend()).toBe("tired");
  expect(result).toBe("tired");
  expect(getActiveAction()).toBeNull();
  expect(getNeeds().fatigue).toBe(5);
});

test("action_extend_分钟框的区间用那类行动自己的时长_错数系统层直接拒", () => {
  // Arrange
  finishOneMinuteStudy();
  const { min, max } = findActionDefinition("work_study")!.durationMinutes;

  // Act
  const offer = extendOffer();

  // Assert
  expect(offer).toEqual({
    min,
    max,
    defaultMinutes: actionExtendTuning.defaultMinutes,
  });
  expect(extendLastAction(min - 1)).toBe("bad_duration");
  expect(extendLastAction(max + 1)).toBe("bad_duration");
  expect(extendLastAction(Number.NaN)).toBe("bad_duration");
  expect(getActiveAction()).toBeNull();
});

test("action_extend_提前结束的不问", () => {
  // Arrange
  expect(startAction("work_study", "没做成", 600)).toBe(true);

  // Act
  cancelAction();

  // Assert
  expect(extendOffer()).toBeNull();
  expect(whyCannotExtend()).toBe("nothing");
  expect(extendLastAction(30)).toBe("nothing");
});

test("action_extend_读档时补结算的不问_到点那会儿人不在", () => {
  // Arrange：两小时前开的半小时，关着游戏的时候就到点了
  const saved: ActionProcessSave = {
    processId: "action:offline",
    actionId: "work_study",
    customName: "昨晚那篇",
    startedAtUtc: new Date(Date.now() - 120 * MINUTE).toISOString(),
    durationMinutes: 30,
    status: "active",
    priority: ActionPriority.Normal,
  };

  // Act
  restoreAction(saved);

  // Assert：结算照常（离线完成是真的完成），只是不问
  expect(getLastActionEnd()?.completed).toBe(true);
  expect(getLastActionEnd()?.settledOnLoad).toBe(true);
  expect(extendOffer()).toBeNull();
  expect(extendLastAction(30)).toBe("nothing");
});

test("action_extend_已经接上了_再按一次不会叠出第二条", () => {
  // Arrange
  finishOneMinuteStudy();
  expect(extendLastAction(15)).toBe("ok");

  // Act
  const again = extendLastAction(45);

  // Assert
  expect(again).toBe("busy");
  expect(getActiveAction()?.durationMs).toBe(15 * MINUTE);
});
