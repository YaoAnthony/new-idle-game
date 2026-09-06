import { AffectionStage } from "core";
import { priorityOf } from "../residentAgent";
import type { Skill } from "./types";

/**
 * 三个"无所事事时的选择"（原 `chooseNextActivity` 的后半，2026-09-06 搬出来）。
 * 它们都是**填充型**技能：看到手上有事（`current` 非 null）就闭嘴，不抢。
 * 顺序由优先级表定：nap 25 > approach 20 > wander 10，和原来 if 链的顺序一致。
 */

/** 闲下来时按睡意掷一次：舒舒十次有八次接着睡 */
export const napSkill: Skill = {
  id: "nap",
  decide: ({ agent, current }) => {
    if (current) return null;
    if (agent.sleepiness <= 0 || Math.random() >= agent.sleepiness) return null;
    return {
      skillId: "nap",
      priority: priorityOf("nap"),
      interruptible: true,
      steps: [{ verb: "sleep" }],
      idleAfter: 2 + Math.random() * 3,
    };
  },
};

/** 熟悉后偶尔主动走向玩家（好感度的空间表现） */
export const approachSkill: Skill = {
  id: "approach",
  decide: ({ agent, player, current }) => {
    if (current) return null;
    if (agent.affectionStage === AffectionStage.Stranger) return null;
    const nearPlayer = Math.hypot(player.x - agent.x, player.z - agent.z) < 2.2;
    if (nearPlayer || Math.random() >= 0.45) return null;
    if (!agent.routeTo(player.x, player.z)) return null;
    return {
      skillId: "approach",
      priority: priorityOf("approach"),
      interruptible: true,
      steps: [{ verb: "walk_to", x: player.x, z: player.z, state: "approach" }],
      idleAfter: 4 + Math.random() * 4,
    };
  },
};

/** 兜底：驻地附近随便挑一个站得进去的点走过去 */
export const wanderSkill: Skill = {
  id: "wander",
  decide: ({ agent, current }) => {
    if (current) return null;
    const spot = agent.randomFreeSpot();
    if (!spot) return null;
    return {
      skillId: "wander",
      priority: priorityOf("wander"),
      interruptible: true,
      steps: [{ verb: "walk_to", x: spot[0], z: spot[1], state: "wander" }],
      // 原来是出发时就定 3~8 秒，走路占掉一部分；现在从到达算，所以短一点
      idleAfter: 1 + Math.random() * 4,
    };
  },
};
