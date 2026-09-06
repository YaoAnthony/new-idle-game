import { announceDialogueFor, backDialogueFor, markAnnounced } from "../../Systems/residents/trips";
import { priorityOf } from "../residentAgent";
import type { Skill } from "./types";

/**
 * 出门（居民系统 09）：出发前一天当面说、回来见面第一句。
 *
 * 和 favor 一样是"他找你"：有话要说就走到你跟前站住（12 米内），头顶挂"！"；按 F 开那段。
 * 当面说这件事**开了对话就算**——关掉一半也算说过，他已经开口了。
 * 回来那段说完由规则接 dialogue_ended 给礼物，这里不管礼物。
 */
const NOTICE_METERS = 12;
const STOP_METERS = 2.2;

function pendingDialogue(residentId: string): string | null {
  return announceDialogueFor(residentId) ?? backDialogueFor(residentId);
}

export const tripSkill: Skill = {
  id: "trip",
  interact: ({ agent }) => {
    if (agent.puppet || agent.dormant) return null;
    const announce = announceDialogueFor(agent.residentId);
    if (announce) {
      markAnnounced(agent.residentId);
      return { kind: "dialogue", dialogueId: announce };
    }
    const back = backDialogueFor(agent.residentId);
    return back ? { kind: "dialogue", dialogueId: back } : null;
  },

  decide: ({ agent, player, current }) => {
    if (agent.state === "hidden" || agent.asleep) return null;
    if (!pendingDialogue(agent.residentId)) return null;
    if (current?.skillId === "trip") return null;
    const distance = Math.hypot(player.x - agent.x, player.z - agent.z);
    if (distance > NOTICE_METERS || distance <= STOP_METERS) return null;
    const stand = agent.findSpotNear(player.x, player.z, STOP_METERS + agent.radius);
    if (!stand) return null;
    return {
      skillId: "trip",
      priority: priorityOf("trip"),
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
    if (!pendingDialogue(agent.residentId)) return;
    if (!agent.expression) agent.showExpression("exclaim", 6);
  },
};
