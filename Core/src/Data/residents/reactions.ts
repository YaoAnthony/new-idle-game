import type { ReactionDefinition } from "../../types/talk.js";

/**
 * 反应表（居民系统 03）：世界里发生了什么 → 表情 + 可选的一句话。
 *
 * 事件键由前端 `Systems/residents/reactions.ts` 把 EventBus 事件翻成：
 *   `weather:<kind>`      天气种类变了（sunny / cloudy / rain / wind / storm / fog）
 *   `item_landed_near`    玩家扔的东西落在身边两米内
 *   `player_gesture`      玩家做了个表情（玩家表情系统还没有，先留键）
 *
 * 表里没有的事件什么都不发生——不是错误。`say` 是给所有人共用的文案（`talk.common.*`），
 * 各人的口头禅照样 `{cp}` 替换（薇尔没有口头禅就是没有）。
 */
export const reactionDefinitions = [
  { on: "weather:storm", expression: "surprised", say: "talk.common.storm" },
  { on: "weather:rain", expression: "puzzled" },
  { on: "weather:sunny", expression: "happy" },
  { on: "item_landed_near", expression: "puzzled", say: "talk.common.item_landed" },
] as const satisfies readonly ReactionDefinition[];

export function reactionsFor(eventKey: string, residentDefinitionId: string): ReactionDefinition[] {
  return (reactionDefinitions as readonly ReactionDefinition[]).filter(
    (entry) => entry.on === eventKey && (!entry.residents || entry.residents.includes(residentDefinitionId)),
  );
}
