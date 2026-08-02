import type { EventDefinition } from "../../types/events.js";

/**
 * 事件注册表。事件推进只由玩家实际完成交互触发（V0.2：
 * 现实时间只是触发条件之一，不能代替事件状态）。
 *
 * **每个被 storyRules 写进存档的 eventId 都要在这里有一条。**
 * 原来只登记了 pet_arrival，另外四个（moving_in / mom_first_call /
 * pet_missing / mom_gift）是 set_event_stage 直接写出来的野生事件——
 * 存档里有它们的进度，但事件名、阶段名、给玩家看的文案全都没有出处。
 * 「事件记录」那一屏一做出来就会有四条显示不出名字。
 * 现在开机的 auditStoryContent 会拦住这种情况。
 */
export const eventDefinitions = [
  {
    id: "moving_in",
    localizationKey: "event.moving_in",
    stages: [{ stageId: "arrived", localizationKey: "event.moving_in.arrived" }],
  },
  {
    id: "pet_arrival",
    localizationKey: "event.pet_arrival",
    stages: [
      { stageId: "not_met", localizationKey: "event.pet_arrival.not_met" },
      { stageId: "met", localizationKey: "event.pet_arrival.met" },
      { stageId: "gifted", localizationKey: "event.pet_arrival.gifted" },
    ],
  },
  {
    id: "mom_first_call",
    localizationKey: "event.mom_first_call",
    stages: [{ stageId: "done", localizationKey: "event.mom_first_call.done" }],
  },
  {
    id: "pet_missing",
    localizationKey: "event.pet_missing",
    stages: [
      { stageId: "noticed", localizationKey: "event.pet_missing.noticed" },
    ],
  },
  {
    /** 妈妈的礼物（V0.7）：承诺 → 快递送到（损坏）→ 修好 */
    id: "mom_gift",
    localizationKey: "event.mom_gift",
    stages: [
      { stageId: "promised", localizationKey: "event.mom_gift.promised" },
      { stageId: "delivered", localizationKey: "event.mom_gift.delivered" },
      { stageId: "repaired", localizationKey: "event.mom_gift.repaired" },
    ],
  },
  {
    /**
     * 舒舒的初见：戳醒 → 送礼认作朋友。三段结构照抄 pet_arrival，
     * 但推进方式不同——它不是"造出来才出现"，是搬进来那天就已经在
     * 屋里睡着了，met 由玩家戳醒它触发，不是任何制作行为。
     */
    id: "shushu_bond",
    localizationKey: "event.shushu_bond",
    stages: [
      { stageId: "not_met", localizationKey: "event.shushu_bond.not_met" },
      { stageId: "met", localizationKey: "event.shushu_bond.met" },
      { stageId: "gifted", localizationKey: "event.shushu_bond.gifted" },
    ],
  },
] satisfies EventDefinition[];

export function findEventDefinition(id: string): EventDefinition | undefined {
  return eventDefinitions.find((event) => event.id === id);
}
