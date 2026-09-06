import { pairKeyOf, pairPoolOf, relationKindOf, socialTuning } from "core";
import {
  activePairTalk,
  hangoutDue,
  isInPairTalk,
  isInitiatorOf,
  markHangout,
  pairChatsToday,
  shouldStopToChat,
  startPairTalk,
} from "../../Systems/residents/social";
import { getResidents } from "../residentsRuntime";
import { priorityOf, type ResidentAgent } from "../residentAgent";
import type { Skill } from "./types";

/**
 * 居民之间（居民系统 06）：碰面停下聊两句、shy 挪一步、一起待着时隔一会儿聊一段。
 *
 * 优先级 45：在作息（40）之上——碰面比赶路重要；在饿了渴了（60）之下。
 * 关系是显式表（`relations.ts`），没写的一对什么都不做。不追人、不吵架。
 * 同帧两人互相发起会死锁：只有 residentId 字典序小的那位发起（`isInitiator`）。
 */
const stepAsideCooldown = new WeakMap<ResidentAgent, number>();

function others(agent: ResidentAgent): ResidentAgent[] {
  return getResidents().filter(
    (other) => other !== agent && !other.puppet && !other.dormant && other.state !== "hidden" && other.state !== "entering" && !other.asleep,
  );
}

export const socialSkill: Skill = {
  id: "social",
  decide: ({ agent, current }) => {
    if (agent.puppet || agent.state === "hidden" || agent.state === "entering" || agent.asleep) return null;
    // 已经在聊了就不再发起
    if (current?.skillId === "social" || isInPairTalk(agent.residentId)) return null;

    for (const other of others(agent)) {
      const relation = relationKindOf(agent.definitionId, other.definitionId);
      const distance = Math.hypot(other.x - agent.x, other.z - agent.z);

      // shy：对方走近就往旁边挪一步。冷却 30 秒，不然俩人会一直互相躲
      if (relation.stepAside && distance < relation.keepDistance) {
        const until = stepAsideCooldown.get(agent) ?? 0;
        if (agent.elapsedSeconds < until) continue;
        const away = Math.atan2(agent.x - other.x, agent.z - other.z);
        const target = agent.findSpotNear(
          agent.x + Math.sin(away) * socialTuning.stepAsideMeters,
          agent.z + Math.cos(away) * socialTuning.stepAsideMeters,
          0.8,
        );
        if (!target) continue;
        stepAsideCooldown.set(agent, agent.elapsedSeconds + socialTuning.stepAsideCooldownSeconds);
        agent.performParallel({ verb: "gesture", gestureId: "look_away" });
        return {
          skillId: "social",
          priority: priorityOf("social"),
          interruptible: true,
          steps: [{ verb: "walk_to", x: target.x, z: target.z, state: "wander" }],
          idleAfter: 2,
        };
      }

      // 有话可聊的关系：碰面 / 一起待着
      if (!pairPoolOf(agent.definitionId, other.definitionId)) continue;
      if (!isInitiatorOf(agent, other)) continue;
      const key = pairKeyOf(agent.definitionId, other.definitionId);
      if (activePairTalk(key) || isInPairTalk(other.residentId)) continue;
      if (pairChatsToday(key) >= socialTuning.chatsPerPairPerDay) continue;
      if (current && !current.interruptible) continue;
      if (other.currentIntent && !other.currentIntent.interruptible) continue;

      const near = distance < socialTuning.meetDistance;
      const hangingOut = relation.hangoutTogether && distance < 3.5 && bothVisiting(agent, other);
      if (hangingOut) {
        if (!hangoutDue(key)) continue;
        markHangout(key);
        return startPairTalk(agent, other);
      }
      if (near && shouldStopToChat(agent, other)) return startPairTalk(agent, other);
    }
    return null;
  },
};

/** 两位都在作息的"到了场所待着"那一步（坐着 / 站着，不在走路） */
function bothVisiting(a: ResidentAgent, b: ResidentAgent): boolean {
  const staying = (agent: ResidentAgent): boolean => {
    const intent = agent.currentIntent;
    if (!intent || intent.skillId !== "routine") return false;
    const step = intent.steps[agent.currentStepIndex];
    return step?.verb === "sit" || step?.verb === "stand";
  };
  return staying(a) && staying(b);
}
