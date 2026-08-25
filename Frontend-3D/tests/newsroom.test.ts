import { afterEach, beforeEach, expect, test } from "vitest";
import { newsworthySignals, newsworthyStages } from "core";

import { emit } from "../src/Game/EventBus";
import { factsOfToday, restoreDayFacts, startDayRecord } from "../src/Game/Systems/dayRecord";
import { restoreNewspaper, startNewspaper } from "../src/Game/Systems/newspaper";
import {
  restoreFiredStoryRules,
  restoreSignalCounts,
  signal,
  startStorySystem,
} from "../src/Game/Systems/story";
import { restoreProgression, setEventStage } from "../src/Game/Systems/events";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";

/**
 * 采编（期 7）：**把发生的事记成明天的头条素材**。
 *
 * 这一份钉的是一个真实的缺口。期 7 落地时发现施工文档那张表声称
 * "期 3 接了失窃、期 4 接了搬家"——**实际一条都没接**，只有卖货（期 5）
 * 和行动（期 0）在写事实。散落式的 `recordHeadlineFact` 调用就是这么漏的：
 * 每个系统的作者都以为别人接了。
 *
 * 集中成三条监听 + 两张表之后，这份用例守的就是"表里有的确实会被记下"。
 */

let stops: Array<() => void> = [];

beforeEach(() => {
  setRemoteWorldActive(false);
  restoreDayFacts([]);
  restoreNewspaper(undefined);
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  restoreFiredStoryRules([]);
  restoreSignalCounts({});
  stops.push(startDayRecord());
  /*
   * **剧情系统也要起**。它把 `building_completed` 转发成同名剧情信号，
   * 而采编读的就是那条转发——不起剧情系统的话，这一份用例测的是一套
   * 实机里不存在的接线（第一版就是这么放过双重记录的）。
   */
  stops.push(startStorySystem(false));
  stops.push(startNewspaper());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
});

test("newsroom_搬家会被记成头条素材_不再是没人接的信号", () => {
  signal("resident_moved_in", "slime_neighbor");

  const headlines = factsOfToday()?.headlines ?? [];
  expect(headlines).toContainEqual({
    kind: "resident_moved_in",
    subject: "slime_neighbor",
  });
});

/**
 * 回归：**一次完工只能记一条**。
 *
 * 实机 `/build` 一次记了两条才发现的。原因是我两头都接了：既在
 * `newsworthySignals` 里登记了 `building_completed`，又另挂了一条
 * `on("building_completed")`——而 `story.ts` 本来就把这个事件转发成
 * 同名剧情信号。当时用例全绿，因为那一版只 emit 了事件、没跑剧情系统。
 */
test("newsroom_完工只记一条_不因为两条到达路径记两遍", () => {
  emit("building_completed", { buildingId: "gold_jar", instanceId: "j1" });

  const built = (factsOfToday()?.headlines ?? []).filter(
    (item) => item.kind === "building_completed",
  );

  expect(built).toEqual([{ kind: "building_completed", subject: "gold_jar" }]);
});

test("newsroom_失窃和追回上报_中间三幕不上报", () => {
  // 五幕里只有两幕值得上报：东西没了 / 东西回来了
  setEventStage("gold_theft", "eyed");
  setEventStage("gold_theft", "robbed");
  setEventStage("gold_theft", "chasing");
  setEventStage("gold_theft", "caught");
  setEventStage("gold_theft", "settled", "completed");

  const kinds = (factsOfToday()?.headlines ?? []).map((item) => item.kind);

  expect(kinds).toEqual(["theft", "theft_settled"]);
});

test("newsroom_表里没有的信号不记_报纸不该什么都登", () => {
  signal("day_started");
  signal("map_entered", "town");

  expect(factsOfToday()?.headlines ?? []).toEqual([]);
});

test("newsroom_两张表的值都要在优先级表里有位置", async () => {
  /*
   * 采编记下来的 kind 如果不在 `headlinePriority` 里，它会拿 0 分——
   * 不会崩，但**永远上不了头版**，而那多半是忘了登记而不是有意的。
   * 这条把两张表对上账。
   */
  const { headlinePriority } = await import("core");
  const produced = [
    ...Object.values(newsworthySignals),
    ...Object.values(newsworthyStages),
  ];

  for (const kind of produced) {
    expect(headlinePriority[kind], `${kind} 没在优先级表里登记`).toBeGreaterThan(0);
  }
});
