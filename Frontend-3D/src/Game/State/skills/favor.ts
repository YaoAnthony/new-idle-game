import { getSelectedStack } from "../inventory";
import { completeFavor, deliveryFor, offeredFavorFor, plantFavorFor, visitFavorFor } from "../../Systems/residents/favors";
import { priorityOf } from "../residentAgent";
import type { Skill } from "./types";

/**
 * 委托（居民系统 05）：他有事求你。
 *
 * - `interact`（排在 talk 前面，优先级表定的）：挂着一件 → 开求你的那段；手里拿着他要的
 *   （或者送给他的信物）→ 当场交付、开道谢那段；visit_me 在窗口里站到他门口 → 交付。
 *   都不是 → null，落回闲聊。木偶不管（房客按 F 是闲聊）。
 * - `decide`：挂着一件、你在 12 米内 → 走到你跟前站住。不追人：你走远他就回作息。
 * - `observe`：挂着一件时头顶挂"！"（表情 exclaim，每次到期再挂）。
 */
const NOTICE_METERS = 12;
const STOP_METERS = 2.2;

export const favorSkill: Skill = {
  id: "favor",
  interact: ({ agent, player }) => {
    if (agent.puppet || agent.dormant) return null;
    const offered = offeredFavorFor(agent.definitionId);
    if (offered) return { kind: "dialogue", dialogueId: offered.offerDialogueId };

    const held = getSelectedStack();
    if (held) {
      const delivery = deliveryFor(agent.definitionId, held.itemId);
      if (delivery) {
        const dialogueId = completeFavor(delivery.id);
        if (dialogueId) return { kind: "dialogue", dialogueId };
      }
    }
    const visit = visitFavorFor(agent.definitionId, player);
    if (visit) {
      const dialogueId = completeFavor(visit.id);
      if (dialogueId) return { kind: "dialogue", dialogueId };
    }
    // 13：她家旁边种下了 → 来告诉她就算
    const plant = plantFavorFor(agent.definitionId);
    if (plant) {
      const dialogueId = completeFavor(plant.id);
      if (dialogueId) return { kind: "dialogue", dialogueId };
    }
    return null;
  },

  decide: ({ agent, player, current }) => {
    if (agent.state === "hidden" || agent.asleep) return null;
    if (!offeredFavorFor(agent.definitionId)) return null;
    if (current?.skillId === "favor") return null;
    const distance = Math.hypot(player.x - agent.x, player.z - agent.z);
    if (distance > NOTICE_METERS || distance <= STOP_METERS) return null;
    const stand = agent.findSpotNear(player.x, player.z, STOP_METERS + agent.radius);
    if (!stand) return null;
    return {
      skillId: "favor",
      priority: priorityOf("favor"),
      interruptible: true,
      steps: [
        { verb: "walk_to", x: stand.x, z: stand.z, state: "approach" },
        { verb: "stand", seconds: 20, facing: { x: player.x, z: player.z } },
      ],
      idleAfter: 3,
    };
  },

  observe: ({ agent }) => {
    if (agent.state === "hidden") return;
    if (!offeredFavorFor(agent.definitionId)) return;
    if (!agent.expression) agent.showExpression("exclaim", 6);
  },
};
