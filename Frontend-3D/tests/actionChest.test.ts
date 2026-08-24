import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  ActionCategory,
  ActionPriority,
  Facing,
  PlacementSurface,
  findActionByCategory,
  findItemDefinition,
  nodeChestScore,
} from "core";

import { on } from "../src/Game/EventBus";
import {
  cancelAction,
  getLastActionEnd,
  startAction,
} from "../src/Game/Systems/actions";
import { buildCandidatePool } from "../src/Game/Systems/actionChains";
import { factsOfToday, restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { getCounts, replaceCounts } from "../src/Game/State/inventory";
import {
  clearAllFurniture,
  replayPlaceFurniture,
} from "../src/Game/State/world";
import { restoreNeeds } from "../src/Game/State/needs";

/**
 * 行动开箱（期 2 · 小动物经济圈）。
 *
 * 行动的奖励从「四组写死的清单」换成**按投入分抽一件家具**。
 * 这一份钉的是接线：开不开箱、开几件、重要级乘在哪、休息是不是真的不掉东西。
 *
 * 抽取算法本身（权重表、降档、优先抽没有的）在 Core 的 actionChains，
 * 那边早有用例；这里不重复验概率，只验**这条路走通了**。
 */

/**
 * 摆一件能支撑某类行动的家具。
 *
 * 走 `replayPlaceFurniture` 而不是 `placeFurnitureAt`：后者要过占用校验，
 * 而校验要有房间几何——这一份测的是**行动结算**，不该被"测试世界里
 * 有没有一间摆得下的房子"拖住。重放那条路本来就是给"对方已经校过"
 * 准备的，用例是同一种处境。
 */
let seq = 0;
function placeSupport(itemId: string): void {
  seq += 1;
  replayPlaceFurniture({
    instanceId: `test:furniture:${itemId}#${seq}`,
    furnitureId: itemId,
    placement: {
      kind: PlacementSurface.Floor,
      roomId: "living",
      gridPosition: { x: 0, y: 0 },
      facing: Facing.North,
    },
    state: {},
  });
}

beforeEach(() => {
  clearAllFurniture();
  replaceCounts({});
  restoreDayFacts([]);
  // 精力拉满：重要级会按倍率扣，不够就起不来
  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);
});

afterEach(() => {
  cancelAction();
  vi.useRealTimers();
});

test("action_chest_做完一条学习行动_开出恰好一件家具", () => {
  // Arrange
  placeSupport("furniture_study_desk");
  vi.useFakeTimers();

  // Act
  expect(
    startAction("work_study", "写完 assignment2", 60, ActionPriority.Normal),
  ).toBe(true);
  vi.advanceTimersByTime(61_000);

  // Assert：一件，而且是能摆的家具（不是木头鸡蛋那套旧奖励）
  const end = getLastActionEnd()!;
  expect(end.completed).toBe(true);
  expect(end.rewards).toHaveLength(1);
  const item = findItemDefinition(end.rewards[0].itemId);
  expect(item?.placement).toBeTruthy();
  expect(end.rewards[0].quantity).toBe(1);
  // 真的进包了（开箱事件只是演出，入包在 grantChest 里就做了）
  expect(getCounts()[end.rewards[0].itemId]).toBeGreaterThanOrEqual(1);
});

test("action_chest_旧的固定奖励清单已经不在了", () => {
  // 「写作业 = 2 木头 + 1 鸡蛋」是期 2 换掉的东西。它不看时长，
  // 做 1 分钟和做 8 小时拿到的一模一样——这条钉住它不会被填回去
  for (const category of Object.values(ActionCategory)) {
    const definition = findActionByCategory(category);
    expect(definition?.rewards).toEqual([]);
  }
});

test("action_chest_重要级乘的是投入分不是件数", () => {
  // 乘件数 = "标重要就开三个箱"，那是纯收益，重要级标签当场作废
  placeSupport("furniture_study_desk");
  vi.useFakeTimers();

  startAction("work_study", "重要的活", 60, ActionPriority.High);
  vi.advanceTimersByTime(61_000);

  const end = getLastActionEnd()!;
  expect(end.rewards).toHaveLength(1); // 仍然是一件，不是三件
});

test("action_chest_投入分公式_时长除以15再乘重要级倍率", () => {
  // 这条不走运行时，直接钉公式——它决定了"两小时的活该开出什么档"
  expect(nodeChestScore(15)).toBeCloseTo(1);
  expect(nodeChestScore(480)).toBeCloseTo(32);
  // 重要级 3 倍：8 小时重要 = 96 分，落在权重表最后一行（minScore 40）
  expect(nodeChestScore(480) * 3).toBeCloseTo(96);
});

test("action_chest_休息不掉东西_它是唯一不耗精力的行动", () => {
  placeSupport("bedroll");
  vi.useFakeTimers();

  startAction("rest", "躺一会", 60, ActionPriority.Normal);
  vi.advanceTimersByTime(61_000);

  const end = getLastActionEnd()!;
  expect(end.completed).toBe(true);
  expect(end.rewards).toEqual([]);
  expect(getCounts()).toEqual({});
});

test("action_chest_取消的行动什么都不给", () => {
  placeSupport("furniture_study_desk");
  vi.useFakeTimers();

  startAction("work_study", "半途而废", 600, ActionPriority.Normal);
  vi.advanceTimersByTime(1_000);
  cancelAction();

  const end = getLastActionEnd()!;
  expect(end.completed).toBe(false);
  expect(end.rewards).toEqual([]);
});

test("action_chest_开箱事件带上标题_不带链专属字段", () => {
  placeSupport("furniture_study_desk");
  vi.useFakeTimers();
  const seen: Array<Record<string, unknown>> = [];
  const off = on("action_chest_ready", (event) =>
    seen.push(event as unknown as Record<string, unknown>),
  );

  startAction("work_study", "写完 assignment2", 60, ActionPriority.Normal);
  vi.advanceTimersByTime(61_000);
  off();

  expect(seen).toHaveLength(1);
  expect(seen[0].title).toBe("写完 assignment2");
  expect(seen[0].size).toBe("node");
  // 行动开箱没有链——硬塞空串的话 ChestOverlay 会去查一条不存在的链
  expect(seen[0].chainId).toBeUndefined();
  expect(seen[0].iconId).toBeUndefined();
});

test("action_chest_休息不弹开箱面板", () => {
  placeSupport("bedroll");
  vi.useFakeTimers();
  let fired = 0;
  const off = on("action_chest_ready", () => { fired += 1; });

  startAction("rest", "躺一会", 60, ActionPriority.Normal);
  vi.advanceTimersByTime(61_000);
  off();

  expect(fired).toBe(0);
});

test("action_chest_开出的东西记进昨日事实_报纸要写做完X得了Y", () => {
  placeSupport("furniture_study_desk");
  vi.useFakeTimers();

  startAction("work_study", "写完 assignment2", 60, ActionPriority.Normal);
  vi.advanceTimersByTime(61_000);

  const today = factsOfToday()!;
  expect(today.actions).toHaveLength(1);
  expect(today.actions[0].name).toBe("写完 assignment2");
  expect(today.actions[0].gained).toBe(getLastActionEnd()!.rewards[0].itemId);
});

test("action_chest_候选池两种origin都在_池子不按origin筛", () => {
  // 决策 12 只要求"商人不卖家具"、决策 17 说他"什么都收"，
  // 所以 origin 在机制上用不着——它是说法（他没货源）和定价依据
  const pool = [...buildCandidatePool().values()].flat();
  const origins = new Set(
    pool.map((id) => findItemDefinition(id)?.origin ?? "otherworld"),
  );
  expect(origins.size).toBeGreaterThan(1);
});
