import { completeFavor, escortFavorFor } from "../../Systems/residents/favors";
import { resolveSpots } from "../../Systems/residents/spots";
import { startDialogue } from "../../Systems/dialogue";
import { priorityOf } from "../residentAgent";
import type { Skill } from "./types";

/**
 * 陪你走（居民系统 13）：接了 escort 委托，他跟着你，你走到那种场所他就算到了。
 *
 * - `decide`：你离他超过一步半 → 走到你**跟前一步半**的位置（findSpotNear 找的是你身边站得住的点，
 *   不是你脚下——他不该把你挤开）。每段走完 0.3 秒就再问一次，等于一步一步跟；
 *   目标点在你身边而不是身后：身体那层没有玩家朝向，"身后"算不出来，让路逻辑（yielding）照常兜底。
 * - `observe`：你在场所（reach + 2.5 米）里、他在你 4.5 米内 → 委托做成、他开口说到了。
 * 优先级 55：压过作息（不然到点他就回家睡了），让给来访。
 */
const FOLLOW_METERS = 1.6;
const REPLAN_METERS = 2.4;
const ARRIVE_METERS = 4.5;

export const escortSkill: Skill = {
  id: "escort",
  decide: ({ agent, player, current }) => {
    if (agent.puppet || agent.state === "hidden" || agent.asleep) return null;
    if (!escortFavorFor(agent.definitionId)) return null;
    if (current?.skillId === "escort") return null;
    const distance = Math.hypot(player.x - agent.x, player.z - agent.z);
    if (distance <= REPLAN_METERS) return null;
    const stand = agent.findSpotNear(player.x, player.z, FOLLOW_METERS + agent.radius);
    if (!stand) return null;
    return {
      skillId: "escort",
      priority: priorityOf("escort"),
      interruptible: true,
      steps: [{ verb: "walk_to", x: stand.x, z: stand.z, state: "approach" }],
      idleAfter: 0.3,
    };
  },

  observe: ({ agent, player }) => {
    if (agent.puppet || agent.state === "hidden") return;
    const favor = escortFavorFor(agent.definitionId);
    if (!favor?.escortTo) return;
    if (Math.hypot(player.x - agent.x, player.z - agent.z) > ARRIVE_METERS) return;
    const there = resolveSpots(favor.escortTo).some((spot) => Math.hypot(spot.x - player.x, spot.z - player.z) <= spot.reach + 2.5);
    if (!there) return;
    const dialogueId = completeFavor(favor.id);
    if (!dialogueId) return;
    agent.interruptIntentOf("escort");
    startDialogue(dialogueId, agent.residentId);
  },
};
