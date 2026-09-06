import { reactionsFor } from "core";
import type { ResidentAgent } from "../residentAgent";
import type { Skill } from "./types";

/**
 * 反应（居民系统 03）：世界里发生了什么，他做个表情、可能说一句。
 *
 * 没有 `decide`，只有 `onEvent`——事件由 `Systems/residents/talk.ts` 从 EventBus 翻成
 * 事件键（`weather:storm`、`item_landed_near`）递进来。表里没有的键什么都不发生。
 * 同一个键十秒内只反应一次：暴风雨里天气每次重算都喊一声"哇"就成复读机了。
 */
const COOLDOWN_SECONDS = 10;
const lastReactionAt = new WeakMap<ResidentAgent, Map<string, number>>();

export const reactionsSkill: Skill = {
  id: "reactions",
  forVisitors: true,
  worksWhileHidden: false,
  onEvent: ({ agent }, event) => {
    if (agent.state === "hidden" || agent.asleep) return;
    const hits = reactionsFor(event.key, agent.definitionId);
    if (hits.length === 0) return;

    const stamps = lastReactionAt.get(agent) ?? new Map<string, number>();
    lastReactionAt.set(agent, stamps);
    const now = agent.elapsedSeconds;
    const last = stamps.get(event.key);
    if (last !== undefined && now - last < COOLDOWN_SECONDS) return;
    stamps.set(event.key, now);

    const reaction = hits[0];
    agent.showExpression(reaction.expression);
    if (reaction.say) agent.say(reaction.say);
  },
};
