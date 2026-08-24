import type { DayFactsSave } from "core";
import { on } from "../EventBus";
import { getClock } from "../State/clock";
import { getWeather } from "../State/weather";

/**
 * 「昨天发生了什么」。**报纸的素材源，不是日志。**
 *
 * 两者的区别在取舍：日志求全（出了什么都记下来好排查），素材求**可读**
 * ——报纸一版登得下的就那么几条，所以这里记的是**已经归好类的事实**
 * （"做完了写作业 45 分钟"），归类在写入那一刻做，不是出报时从几百条
 * 日志里挖。也**不复用 chatLog**：它只留 3 个世界日 / 500 条，还混着
 * "金库满了"这类系统提示——报纸要的是"昨天这一天"的干净切片。
 *
 * 一共只留两条：**今天**（还在写）和**昨天**（定稿，出报读它）。
 * 不做更长的历史——往回翻报纸是明确不做的（总纲：每日内容不补发）。
 *
 * 本期（期 0）只接两个源：行动完成、翻页时记天气。金币和头条等
 * 期 2/3 有东西可记了再接——现在接了也全是零，而空字段比不存在
 * 更容易让人以为它在工作。
 */

let facts: DayFactsSave[] = [];

function blankFacts(worldDayId: string): DayFactsSave {
  return {
    worldDayId,
    actions: [],
    weatherId: getWeather().id,
    goldIn: 0,
    goldOut: 0,
    headlines: [],
  };
}

/** 今天那条，没有就开一条。**所有写入都从这里走**，翻页因此是惰性的 */
function todayFacts(): DayFactsSave {
  const worldDayId = getClock().worldDayId;
  let today = facts.find((entry) => entry.worldDayId === worldDayId);
  if (!today) {
    today = blankFacts(worldDayId);
    /*
     * 只留今天 + 紧挨着的上一条。不按"日期是昨天"过滤——玩家离线三天
     * 回来，上一条是三天前的，那就是报纸该报的"上一期以来"；按日历筛
     * 会把它扔掉，第一天回来反而无报可出。
     */
    facts = [...facts.slice(-1), today];
  }
  return today;
}

/**
 * 记一笔"做完的行动"。actions.ts 的完成结算处调。
 *
 * `gained` 是开箱开出的那件（期 2 起）。报纸要写的是"做完 X，得了 Y"，
 * 光有 X 那一栏读起来像流水账。休息这类不开箱的不带。
 */
export function recordActionFact(
  name: string,
  minutes: number,
  gained?: string,
): void {
  todayFacts().actions.push({ name, minutes, gained });
}

/** 记一笔金币进出（期 2/3 接）。amount 正负都收，分别落进 in/out */
export function recordGoldFact(amount: number): void {
  const today = todayFacts();
  if (amount > 0) today.goldIn += amount;
  else if (amount < 0) today.goldOut += -amount;
}

/** 记一条大事（谁搬来了、什么建成了、被偷了）。头条从这里挑 */
export function recordHeadlineFact(kind: string, subject?: string): void {
  todayFacts().headlines.push({ kind, subject });
}

/**
 * 昨天那条——**出报读它**。"昨天"指紧挨着今天的上一条，不按日历算
 * （离线三天回来，上一条就是三天前的，报纸报"上一期以来"）。
 */
export function factsOfYesterday(): DayFactsSave | null {
  const worldDayId = getClock().worldDayId;
  const previous = facts.filter((entry) => entry.worldDayId !== worldDayId);
  return previous.length > 0 ? previous[previous.length - 1] : null;
}

export function factsOfToday(): DayFactsSave | null {
  const worldDayId = getClock().worldDayId;
  return facts.find((entry) => entry.worldDayId === worldDayId) ?? null;
}

// ---- 存档 ----

export function getDayFacts(): DayFactsSave[] {
  return facts.map((entry) => ({
    ...entry,
    actions: [...entry.actions],
    headlines: [...entry.headlines],
  }));
}

/** 老存档没有这一段 → 从空开始，不需要迁移 */
export function restoreDayFacts(saved: DayFactsSave[] | undefined): void {
  facts = (saved ?? []).map((entry) => ({
    ...entry,
    actions: [...entry.actions],
    headlines: [...entry.headlines],
  }));
}

let detach: (() => void) | null = null;

/**
 * 翻页时立刻把新的一天开出来（记下当天天气）。
 *
 * 写入本来就是惰性开条的（todayFacts），这条订阅只是让"今天的天气"
 * 在翻页那一刻就定格——不订的话，玩家整天没做行动，今天那条就不存在，
 * 明天的报纸连天气都没得登。
 */
export function startDayRecord(): () => void {
  if (detach) return detach;
  const offDay = on("world_day_changed", () => {
    todayFacts();
  });
  detach = () => {
    offDay();
    detach = null;
  };
  return detach;
}
