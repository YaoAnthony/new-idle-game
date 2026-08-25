import { afterEach, beforeEach, expect, test } from "vitest";

import {
  issueToday,
  latestIssue,
  paperName,
  restoreNewspaper,
  setPaperName,
  snapshotNewspaper,
} from "../src/Game/Systems/newspaper";
import { recordGoldFact, recordHeadlineFact, restoreDayFacts, startDayRecord } from "../src/Game/Systems/dayRecord";
import { restoreProgression, unlockFeature } from "../src/Game/Systems/events";
import { debugAdvanceHours, getDebugOffsetMs } from "../src/Game/State/clock";
import { setRemoteWorldActive } from "../src/Game/Multiplayer/worldLock";

/**
 * 报纸的出刊规矩（期 7）。**编排本身在 Core 的用例里钉**
 * （`Core/tests/newspaper.test.ts`：头条按表挑、同一份事实编两次一样）。
 * 这里钉前端那一层：什么时候出、出几期、定稿变不变。
 */

let stops: Array<() => void> = [];

beforeEach(() => {
  setRemoteWorldActive(false);
  restoreNewspaper(undefined);
  restoreDayFacts([]);
  restoreProgression({ events: {}, unlockedFeatureIds: [] });
  stops.push(startDayRecord());
});

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
  // 时钟偏移还原，否则同一个 worker 里后跑的用例活在几天之后
  debugAdvanceHours(-getDebugOffsetMs() / 3_600_000);
});

test("newspaper_没解锁永不出刊_打印机是唯一的开关", () => {
  expect(issueToday()).toBeNull();
  expect(latestIssue()).toBeNull();

  unlockFeature("newspaper");

  expect(issueToday()).not.toBeNull();
});

test("newspaper_每个世界日恰好一期_同一天再触发不重复出", () => {
  unlockFeature("newspaper");

  const first = issueToday();
  const second = issueToday();

  expect(first?.number).toBe(1);
  // 第二次返回 null（不是又出一期），已经定稿的那份原样留着
  expect(second).toBeNull();
  expect(latestIssue()?.number).toBe(1);
});

test("newspaper_同一天反复读是同一份_一字不差", () => {
  unlockFeature("newspaper");
  issueToday();

  const a = JSON.stringify(latestIssue());
  const b = JSON.stringify(latestIssue());

  expect(a).toBe(b);
});

test("newspaper_离线七天回来只出一期_不补发往期", () => {
  unlockFeature("newspaper");
  issueToday();
  expect(latestIssue()?.number).toBe(1);

  // 假装离开七天
  debugAdvanceHours(24 * 7);
  const back = issueToday();

  /*
   * 一上线七份报纸等着读，那是欠账不是惊喜（总纲："每日内容不补发"）。
   * 但 `spanDays` 要认得出你离开过——头版那句"这几天"靠它。
   */
  expect(back?.number).toBe(2);
  expect(back?.spanDays).toBe(7);
  expect(latestIssue()?.number).toBe(2);
});

test("newspaper_期号连续递增_不因为离线跳号", () => {
  unlockFeature("newspaper");
  issueToday();
  debugAdvanceHours(24 * 5);
  issueToday();
  debugAdvanceHours(24);
  const third = issueToday();

  expect(third?.number).toBe(3);
});

test("newspaper_报名进存档_存读之后报头不变", () => {
  unlockFeature("newspaper");
  setPaperName("松果谷");
  issueToday();

  const saved = snapshotNewspaper();
  restoreNewspaper(undefined);
  expect(paperName()).toBe("");

  restoreNewspaper(saved);

  expect(paperName()).toBe("松果谷");
  expect(latestIssue()?.number).toBe(1);
});

test("newspaper_报名超长会截断_报头一行要放得下", () => {
  setPaperName("这是一个非常非常长的报纸名字");

  expect(paperName().length).toBeLessThanOrEqual(8);
});

test("newspaper_头条取自昨天的事实_不是今天的", () => {
  unlockFeature("newspaper");
  // 今天记一条：出刊报道的是昨天，所以它不该上今天这一期
  recordHeadlineFact("theft");
  recordGoldFact(50);

  const issue = issueToday();

  /*
   * 第一期出刊时"昨天"还没有任何记录（游戏才刚开始记），所以头条是空的。
   * 这条钉的是**取的是昨天不是今天**——取错的话，今天刚发生的事会在
   * 今天早上的报纸上出现，时间线是反的。
   */
  expect(issue?.headline).toBeNull();
  expect(issue?.goldIn).toBe(0);
});
