import type { EventDefinition } from "../../types/events.js";

/**
 * 事件注册表。事件推进只由玩家实际完成交互触发（V0.2：现实时间只是
 * 触发条件之一，不能代替事件状态）。
 *
 * **每个被 storyRules 写进存档的 eventId 都要在这里有一条。**
 * 少登记的后果是"事件记录"那一屏显示不出名字——`logic/storyAudit` 会
 * 拦住这种情况（它校验 storyRules 引用的 eventId 都能查到）。
 *
 * ⚠️ 但 audit **不查这里每条自己的 localizationKey**。上一版六个事件里
 * 有 16 个文案键从来没写过，而审计和 i18n 测试全是绿的——重写时要么把
 * 文案一起补上，要么先把 audit 那段补掉。
 *
 * 2026-08-13 清空：旧的 moving_in / pet_arrival / mom_first_call /
 * pet_missing / mom_gift / shushu_bond 跟着旧剧情一起推倒。
 */
export const eventDefinitions: EventDefinition[] = [];

export function findEventDefinition(id: string): EventDefinition | undefined {
  return eventDefinitions.find((event) => event.id === id);
}
