import {
  composeIssue,
  newsworthySignals,
  newsworthyStages,
  paperNameLimit,
  type NewspaperIssue,
  type NewspaperSave,
} from "core";

import { on } from "../EventBus";
import { getClock } from "../State/clock";
import { factsOfYesterday, recordHeadlineFact } from "./dayRecord";
import { isFeatureUnlocked } from "./events";
import { epochDayOf, wantedToday } from "./trading";

/**
 * 报纸的出刊（期 7）。**编排算法在 Core**（`logic/newspaper.ts`），
 * 这里只负责：什么时候出、拿哪一天的事实、定稿存哪。
 *
 * ## 三条规矩
 *
 * 1. **没解锁不出刊。** 打印机送出去、名字取好了才有第一期
 *    （`newspaper` 这个 feature）。
 * 2. **每个世界日最多一期。** 同一天反复触发 `world_day_changed`
 *    不会重复出刊，也不会把已经定稿的那期覆盖掉。
 * 3. **不补发往期。** 离线七天回来出的是**今天这一期**，不是七期
 *    （总纲："每日内容不补发"，照动森）。但 `spanDays` 会记下隔了几天，
 *    头版那句"这几天"靠它——不补发，但要认得出你离开过。
 *
 * ## 定稿之后不再变
 *
 * 出刊那一刻把水獭的想要清单**抄一份**进这一期。现算的话他走了之后
 * 那一栏会凭空变空，而报纸上印过的字不该自己改。
 */

let state: NewspaperSave = { issued: 0 };

/** 报名。空的时候退到据点的名字，报头不开洞 */
export function paperName(): string {
  return state.name?.trim() || "";
}

export function setPaperName(name: string): void {
  state = { ...state, name: name.trim().slice(0, paperNameLimit) };
}

/** 最新一期。没出过就是 null */
export function latestIssue(): NewspaperIssue | null {
  return state.latest ?? null;
}

export function issuedCount(): number {
  return state.issued;
}

/**
 * 出一期。已经出过今天的就什么都不做（返回 null）。
 *
 * 报道的是**前一天**：今天早上的报纸写昨天的事。离线回来时前一天
 * 未必有事实记录（那几天没开游戏），拿不到就用空的编——版面照出，
 * 只是内容清淡，比"今天没有报纸"好。
 */
export function issueToday(): NewspaperIssue | null {
  if (!isFeatureUnlocked("newspaper")) return null;

  const worldDayId = getClock().worldDayId;
  if (state.latest?.worldDayId === worldDayId) return null;

  const today = epochDayOf(worldDayId);
  const lastDay = state.latest ? epochDayOf(state.latest.worldDayId) : today - 1;
  const spanDays = Math.max(1, today - lastDay);

  /*
   * 拿**最后一个有记录的日子**，不是字面上的昨天。
   *
   * 离线七天回来时，字面昨天根本没有记录（那几天没开游戏），按日期去查
   * 只会拿到空。`factsOfYesterday` 给的是"今天之前最近的那份事实"——
   * 配上 `spanDays`（隔了几天），版面就能写成"这几天里……"。
   */
  const facts = factsOfYesterday();

  const issue = composeIssue({
    worldDayId,
    facts: facts
      ? {
          worldDayId: facts.worldDayId,
          weatherId: facts.weatherId,
          goldIn: facts.goldIn,
          goldOut: facts.goldOut,
          actions: facts.actions,
          headlines: facts.headlines,
        }
      : null,
    number: state.issued + 1,
    spanDays,
    // 定稿时抄一份，之后不跟着变
    wanted: [...wantedToday()],
  });

  state = { ...state, issued: issue.number, latest: issue };
  return issue;
}

let detach: (() => void) | null = null;

/**
 * 挂上两条监听。整个应用只调一次。
 *
 * - **翻篇出刊**：每个世界日一期
 * - **采编**：把剧情信号和剧情阶段翻成昨日事实里的头条素材
 *
 * 采编这条是期 7 补的缺口。此前只有卖货（期 5）和行动（期 0）在写事实，
 * 被偷、搬家、完工一条都没接——施工文档的表声称接了，实际没有。
 * 集中成两个监听 + 两张表（`newsworthySignals` / `newsworthyStages`）之后，
 * "这件事上不上报"是一行数据，而且不会再有人以为别人接了。
 *
 * ## 只走剧情信号，不再直连 `building_completed`
 *
 * 第一版两头都接了：既在 `newsworthySignals` 里登记了 `building_completed`，
 * 又另挂了一条 `on("building_completed")`。而 `story.ts` **本来就把这个
 * 事件转发成同名剧情信号**——于是盖一栋楼在报纸上记了两遍。
 *
 * 教训是"同一件事有两条到达路径"这件事本身：能走表就都走表，
 * 别为某一件事开小灶。实机 `/build` 一次记两条才发现，用例当时全绿——
 * 因为用例里我只 emit 了事件、没跑剧情系统。
 */
export function startNewspaper(): () => void {
  if (detach) return detach;

  const offDay = on("world_day_changed", () => {
    issueToday();
  });

  const offSignal = on("story_signal", ({ kind, subject }) => {
    const newsKind = newsworthySignals[kind];
    if (newsKind) recordHeadlineFact(newsKind, subject);
  });

  /*
   * 剧情事件走第三条：`event_progress_changed`。失窃链那五幕里只有两幕
   * 上报（东西没了 / 东西回来了）——中间三幕是过程，报纸不写过程。
   */
  const offStage = on("event_progress_changed", ({ eventId, stageId }) => {
    const newsKind = newsworthyStages[`${eventId}:${stageId}`];
    if (newsKind) recordHeadlineFact(newsKind);
  });

  detach = () => {
    offDay();
    offSignal();
    offStage();
    detach = null;
  };
  return detach;
}

// ---- 存档 ----

/**
 * 存档快照。**三个键都显式给值**，哪怕还没出过报。
 *
 * 同 v29/v30 立的规矩：形状在存档里落实，`saveShape` 的指纹才稳定。
 * 少给一个键的话，"还没出过报"和"这个字段被删了"在指纹上长得一样。
 */
export function snapshotNewspaper(): NewspaperSave {
  return {
    name: state.name ?? "",
    issued: state.issued,
    latest: state.latest ? { ...state.latest } : undefined,
  };
}

export function restoreNewspaper(saved: NewspaperSave | undefined): void {
  state = saved ? { ...saved } : { issued: 0 };
}
