import type { ItemCounts } from "./crafting.js";
import type { EventId, EventStageId } from "../types/events.js";
import type { StorySignal, StoryTrigger } from "../types/story.js";
import type { WorldDayId } from "../types/time.js";
import type { WeatherId } from "../types/weather.js";

/**
 * 剧情触发判定。**纯函数**——所有外部状态由调用方装进 `StoryContext`。
 *
 * 从 Frontend 的解释器里挪过来的。判定是规则不是表现：联机时服务端要
 * 校验访客那边报上来的剧情推进，两边必须读同一份判定，否则"在我这儿
 * 触发了、在房主那儿没有"这种分歧无从查起。
 */

export type StoryContext = {
  /** 当前世界日，用于 minWorldDayId */
  worldDayId: WorldDayId;
  /** 当前天气 */
  weatherId: WeatherId;
  /** 背包里有什么（装着东西的容器不算数，见 inventory 的 getCounts） */
  itemCounts: ItemCounts;
  /** 各信号累计次数，键由 signalCountKey 生成 */
  signalCounts: Readonly<Record<string, number>>;
  /** 事件当前处于哪个阶段；没触发过返回 null */
  eventStage: (eventId: EventId) => EventStageId | null;
  /** 掷点。**注入而不是直接用 Math.random**：测试要能定住，服务端要能复算 */
  roll?: () => number;
};

/**
 * 计数用的键。
 *
 * 每条信号会同时给"不分 subject"和"带 subject"两个键各加一次，
 * 于是 `{ signal: "action_completed", signalCount: 2 }`（数所有行动）和
 * `{ signal: "action_completed", subject: "work_study", signalCount: 2 }`
 * （只数学习）各查各的，不用在计数时预判规则想怎么数。
 */
export function signalCountKey(kind: string, subject?: string): string {
  return subject ? `${kind}|${subject}` : kind;
}

/** 这条信号该给哪些键计数 */
export function signalCountKeysFor(signal: StorySignal): string[] {
  const keys = [signalCountKey(signal.kind)];
  if (signal.subject) keys.push(signalCountKey(signal.kind, signal.subject));
  return keys;
}

export function triggerMatches(
  trigger: StoryTrigger,
  signal: StorySignal,
  context: StoryContext,
): boolean {
  if (trigger.signal !== signal.kind) return false;
  if (trigger.subject && trigger.subject !== signal.subject) return false;

  if (
    trigger.requiresEventUntriggered &&
    context.eventStage(trigger.requiresEventUntriggered) !== null
  ) {
    return false;
  }

  if (trigger.requiresEventStage) {
    const { eventId, stageId } = trigger.requiresEventStage;
    if (context.eventStage(eventId) !== stageId) return false;
  }

  if (trigger.signalCount !== undefined) {
    // 查的键要和 trigger 自己的 subject 对齐：写了 subject 就只数那一种
    const key = signalCountKey(signal.kind, trigger.subject);
    // 这一条信号本身也算数——计数在派发之前累加，所以这里直接比
    if ((context.signalCounts[key] ?? 0) < trigger.signalCount) return false;
  }

  /**
   * 世界日比字符串。WorldDayId 是 "2026-08-02" 这种定长 ISO 日期，
   * 字典序和时间序一致，不用解析成 Date——解析反而会引入时区问题，
   * 而这个 id 本来就是**按世界时区算好的**，再过一次 Date 等于算两遍。
   */
  if (trigger.minWorldDayId && context.worldDayId < trigger.minWorldDayId) {
    return false;
  }

  if (trigger.weatherIs && context.weatherId !== trigger.weatherIs) return false;

  if (trigger.requiresItem) {
    const { itemId, quantity } = trigger.requiresItem;
    if ((context.itemCounts[itemId] ?? 0) < quantity) return false;
  }

  // 概率放**最后**：前面的条件都不满足时不该白掷一次点，
  // 否则同一条规则的命中率会随"被无关信号扫过几次"变化
  if (trigger.chance !== undefined) {
    const roll = context.roll ?? Math.random;
    if (roll() >= trigger.chance) return false;
  }

  return true;
}
