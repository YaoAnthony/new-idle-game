import { afterEach, beforeEach, expect, test } from "vitest";
import {
  ActionPriority,
  Facing,
  PlacementSurface,
  actionLogTuning,
  findItemDefinition,
} from "core";

import {
  cancelAction,
  describeActionLog,
  logCompletedAction,
  startAction,
} from "../src/Game/Systems/actions";
import { restoreActionLog } from "../src/Game/State/actionLog";
import { factsOfToday, restoreDayFacts } from "../src/Game/Systems/dayRecord";
import { diaryDoneOn, restoreDiary } from "../src/Game/State/diary";
import { getClock } from "../src/Game/State/clock";
import { getCounts, replaceCounts } from "../src/Game/State/inventory";
import {
  clearAllFurniture,
  replayPlaceFurniture,
} from "../src/Game/State/world";
import { getNeeds, restoreNeeds } from "../src/Game/State/needs";

/**
 * 事后补记（P 路径，2026-08-25）。
 *
 * 行动系统原本只有"提前建条目 → 坐着等计时器"这一条路，只服务提前规划
 * 的人。补记是给另一半人的入口：做完了才回头记一笔，拿**同样的奖励**。
 *
 * 三条要害，每一条都对应一个真实存在的失衡：
 *
 * 1. **补记和亲手做发的东西必须一模一样**。两条路各写一份发奖逻辑的话，
 *    迟早出现"补记的不吃重要级倍率"这种分歧，而且不会有任何东西报错；
 * 2. **补记必须扣同样的精力**。不扣的话补记严格优于亲手做，计时器那条路
 *    当场没人走——那等于把整个专注工具废掉；
 * 3. **补记必须有每日额度**。坐 45 分钟的代价是真实时间，补记没有任何
 *    代价，不封顶就是无限开箱。
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
  restoreDiary(undefined);
  restoreActionLog(undefined);
  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);
});

afterEach(() => {
  cancelAction();
});

test("action_log_补记一件_开出恰好一件家具并进包", () => {
  placeSupport("furniture_study_desk");

  expect(
    logCompletedAction({
      actionId: "work_study",
      customName: "写完 assignment2",
      durationMinutes: 120,
    }),
  ).toBe("ok");

  // 和计时器那条路一样：一件，而且是能摆的家具
  const counts = getCounts();
  const gained = Object.keys(counts);
  expect(gained).toHaveLength(1);
  expect(findItemDefinition(gained[0])?.placement).toBeTruthy();
  expect(counts[gained[0]]).toBe(1);
});

test("action_log_补记扣同样的精力——否则计时器那条路当场没人走", () => {
  placeSupport("furniture_study_desk");
  const before = getNeeds().fatigue;

  logCompletedAction({
    actionId: "work_study",
    customName: "写论文",
    durationMinutes: 60,
    priority: ActionPriority.Normal,
  });

  // work_study 的 fatigueCost 是 18，普通倍率 1.0
  expect(getNeeds().fatigue).toBe(before - 18);
});

test("action_log_重要级同时放大代价——标重要不是纯收益", () => {
  placeSupport("furniture_study_desk");
  const before = getNeeds().fatigue;

  logCompletedAction({
    actionId: "work_study",
    customName: "重要的活",
    durationMinutes: 60,
    priority: ActionPriority.High,
  });

  // 18 × 1.6 = 28.8 → 29
  expect(getNeeds().fatigue).toBe(before - 29);
});

test("action_log_没摆家具照样能补记", () => {
  /*
   * **家具门槛 2026-08-28 取消了。**
   *
   * 这条测试原来钉的是反面："没摆书桌就不能说我学习了"。取消的理由是
   * 接下来玩家会自动在小镇里生活，行动不该被"屋里摆没摆哑铃"卡住；
   * 家具从门槛降级成偏好（有就走过去用，没有就算了）。
   *
   * 保留这条测试而不是删掉：它现在钉的是"没有家具也放行"，正好是那次
   * 改动最容易被下一个人无意中改回去的地方。
   */
  expect(
    logCompletedAction({
      actionId: "work_study",
      customName: "写论文",
      durationMinutes: 60,
    }),
  ).toBe("ok");
});

test("action_log_行动进行中不能补记别的", () => {
  placeSupport("furniture_study_desk");
  expect(startAction("work_study", "正在做", 600, ActionPriority.Normal)).toBe(
    true,
  );

  // 手上正做着一件、同时声称做完了另一件，读起来就是假的
  expect(
    logCompletedAction({
      actionId: "work_study",
      customName: "另一件",
      durationMinutes: 60,
    }),
  ).toBe("busy");
});

test("action_log_时长超出合法区间会被拒——不然一句话就是顶格箱子", () => {
  placeSupport("furniture_study_desk");

  // work_study 的上限是 480 分钟
  expect(
    logCompletedAction({
      actionId: "work_study",
      customName: "我今天学了一整年",
      durationMinutes: 99999,
    }),
  ).toBe("bad_duration");
  expect(getCounts()).toEqual({});
});

test("action_log_件数额度用完就记不上了", () => {
  placeSupport("furniture_study_desk");

  // 每条都短，免得先撞上总时长那道闸
  for (let n = 0; n < actionLogTuning.maxPerDay; n += 1) {
    // 精力会被扣光，这里边补边回满，隔离出"件数"这一条闸
    restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);
    expect(
      logCompletedAction({
        actionId: "work_study",
        customName: `第 ${n + 1} 件`,
        durationMinutes: 1,
      }),
    ).toBe("ok");
  }

  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);
  expect(
    logCompletedAction({
      actionId: "work_study",
      customName: "超出的那件",
      durationMinutes: 1,
    }),
  ).toBe("count_full");
});

test("action_log_总时长额度拦得住「一天补五个八小时」", () => {
  placeSupport("furniture_study_desk");
  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);

  // 一次就把总时长吃满
  expect(
    logCompletedAction({
      actionId: "work_study",
      customName: "满满一天",
      durationMinutes: actionLogTuning.maxMinutesPerDay,
    }),
  ).toBe("ok");

  restoreNeeds({ hunger: 100, fatigue: 100 }, undefined);
  expect(
    logCompletedAction({
      actionId: "work_study",
      customName: "再来一天",
      durationMinutes: 60,
    }),
  ).toBe("minutes_full");

  // 件数才用掉 1 格——被拦住的是时长这道闸，两道闸各管各的
  expect(describeActionLog().count).toBe(1);
});

test("action_log_被拒的那次不吃额度、不扣精力", () => {
  placeSupport("furniture_study_desk");
  const fatigueBefore = getNeeds().fatigue;

  logCompletedAction({
    actionId: "work_study",
    customName: "时长非法",
    durationMinutes: 99999,
  });

  expect(describeActionLog().count).toBe(0);
  expect(getNeeds().fatigue).toBe(fatigueBefore);
});

test("action_log_休息补记不掉东西——它的回报是回精力本身", () => {
  placeSupport("furniture_cushion");
  // 精力先压到一半：满格时 restoreFatigue 会被 clamp 在 100，看不出回没回
  restoreNeeds({ hunger: 100, fatigue: 50 }, undefined);
  const before = getNeeds().fatigue;

  expect(
    logCompletedAction({
      actionId: "rest",
      customName: "睡了一觉",
      durationMinutes: 60,
    }),
  ).toBe("ok");

  // noChest：不开箱。但那个负的 fatigueCost 照样回精力
  expect(getCounts()).toEqual({});
  expect(getNeeds().fatigue).toBeGreaterThan(before);
});

test("action_log_补记的事进历史——和亲手做的是同一种事实", () => {
  placeSupport("furniture_study_desk");

  logCompletedAction({
    actionId: "work_study",
    customName: "写完 assignment2",
    durationMinutes: 120,
  });

  const facts = factsOfToday();
  expect(facts?.actions).toHaveLength(1);
  expect(facts?.actions[0].name).toBe("写完 assignment2");
  expect(facts?.actions[0].minutes).toBe(120);
  // 开出的那件也记着——报纸要写"做完 X，得了 Y"
  expect(facts?.actions[0].gained).toBeTruthy();
});

test("action_今天的奖励名额用完之后_照做但不再开箱", () => {
  /*
   * `rewardedPerDay` = 一天几件**有奖励**。超出之后行动照常完成、照常
   * 记进 dayFacts、照常扣精力，只是不开箱——做事本身不该被封顶，奖励才该。
   *
   * 名额是**从 dayFacts 现推**的（今天有 `gained` 的条目数），不另存计数器。
   * 所以这里直接把今天的账面填满，比连做十件快得多，钉的也正是那条推导。
   */
  /*
   * 名额从**日记**现推（v35 起跟人走：做客用的也是自己的名额），
   * 所以种子直接填满今天的日记。
   */
  restoreDiary({
    startedOn: getClock().worldDayId,
    days: [
      {
        day: getClock().worldDayId,
        done: Array.from(
          { length: actionLogTuning.rewardedPerDay },
          (_, i) => ({
            name: `已经开过箱的第${i + 1}件`,
            minutes: 30,
            gained: "wood",
            category: "work_study",
          }),
        ),
      },
    ],
  });
  replaceCounts({});

  expect(
    logCompletedAction({
      actionId: "work_study",
      customName: "第十一件",
      durationMinutes: 60,
    }),
  ).toBe("ok");

  // 记上了，但没开箱：背包一件没多，这条日记也没有 gained
  expect(getCounts()).toEqual({});
  const doneToday = diaryDoneOn(getClock().worldDayId);
  expect(doneToday.at(-1)?.name).toBe("第十一件");
  expect(doneToday.at(-1)?.gained).toBeUndefined();
  // 报纸那份照旧也记了一笔（两份各归各：dayFacts 归报纸，日记归玩家）
  expect(factsOfToday()?.actions.at(-1)?.name).toBe("第十一件");
});
