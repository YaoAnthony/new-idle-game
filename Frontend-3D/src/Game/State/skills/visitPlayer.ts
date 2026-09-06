import { knockIntent, outsideFrontDoor, visitorAtDoor, visitorOfDay, whyCannotVisit } from "../../Systems/residents/visits";
import type { Skill } from "./types";

/**
 * 来你家（居民系统 07）：今天抽中了他、时段对、你在屋里闲着 → 走到主屋门外敲门。
 *
 * 优先级 50：压过作息和居民之间——约好了来就来。敲门之后的一切（开门、进屋、坐、说、送、走）
 * 在 `Systems/residents/visits.ts`：开门是你的动作，走对话选项 → 规则 → `visit_admit` 效果。
 * 木偶不跑（房客做客时房主的邻居不会来敲房主的门——条件里"玩家"是房主本人）。
 *
 * 他在门外敲的时候按 F 找他——不管你是对着门还是对着他——都是同一段"进来吧 / 现在不方便"。
 * 这里答 interact 是因为技能按优先级排、50 压过 talk 的 0：不答的话 talk 会把它当成闲聊
 * （第一版就是：门开着、你站门口对他按 F，弹出来的是聊天）。门那边（RoomScene）也认这段。
 */
export const visitPlayerSkill: Skill = {
  id: "visitPlayer",
  interact: ({ agent }) => {
    if (visitorAtDoor() !== agent.residentId) return null;
    return { kind: "dialogue", dialogueId: `${agent.definitionId.replace(/_neighbor$/, "")}_knocks` };
  },
  decide: ({ agent, current }) => {
    if (agent.puppet) return null;
    if (current?.skillId === "visitPlayer") return null;
    if (visitorOfDay() !== agent.residentId) return null;
    if (whyCannotVisit(agent.residentId)) return null;
    const outside = outsideFrontDoor();
    if (!outside) return null;
    return knockIntent(agent, outside);
  },
};
