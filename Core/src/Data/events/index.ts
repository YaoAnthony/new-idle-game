import type { EventDefinition } from "../../types/events.js";

/**
 * 事件注册表。事件推进只由玩家实际完成交互触发（V0.2：
 * 现实时间只是触发条件之一，不能代替事件状态）。
 */
export const eventDefinitions = [
  {
    id: "pet_arrival",
    localizationKey: "event.pet_arrival",
    stages: [
      { stageId: "not_met", localizationKey: "event.pet_arrival.not_met" },
      { stageId: "met", localizationKey: "event.pet_arrival.met" },
      { stageId: "gifted", localizationKey: "event.pet_arrival.gifted" },
    ],
  },
] satisfies EventDefinition[];

export function findEventDefinition(id: string): EventDefinition | undefined {
  return eventDefinitions.find((event) => event.id === id);
}
