import { findTalkPool, pickTalkEntry } from "core";
import { evaluateCondition } from "../../Systems/dialogue";
import { talkClock } from "../../Systems/residents/talk";
import { signal } from "../../Systems/story";
import { insideHomeOf } from "../../Systems/residents/spots";
import { resolvedPersonalityOf } from "./routine";
import type { Skill } from "./types";

/**
 * 打招呼（居民系统 03）：玩家走进 `greetDistance` 且这个时段还没打过 → 头顶一句气泡。
 *
 * 它是**并行槽**技能：不下串行 Intent（那会让他停下手里的事），走 `observe` 每半秒
 * 看一眼玩家多近——所以他坐着、走着、干着活都能打招呼。这也是它不走 `decide` 的
 * 原因：`decide` 只在闲着或被更高优先级问到时才被问，作息（40）压着它（30）的话
 * 白天他永远在赶路、永远没空开口。
 *
 * 说哪句是池子的事（`Data/residents/talk`）：这里只知道"该打招呼了"。
 * 一个时段只主动说一次（`lastGreetPhase`，运行时，不进存档——读档后再打一次很自然）。
 * 木偶不跑：身体那层不给木偶问技能；房客看到的是房主同步过来的表情。
 */
export const greetSkill: Skill = {
  id: "greet",
  forVisitors: true,
  observe: ({ agent, player }) => {
    if (agent.state === "hidden" || agent.state === "entering" || agent.asleep) return;
    const personality = resolvedPersonalityOf(agent);
    if (!personality) return;
    const distance = Math.hypot(player.x - agent.x, player.z - agent.z);
    if (distance > personality.greetDistance) return;
    // 08：他在屋里你在院子里（或反过来）——隔着墙不打招呼
    if (insideHomeOf(agent.definitionId, agent.x, agent.z) !== insideHomeOf(agent.definitionId, player.x, player.z)) return;

    const { worldDayId, phase } = talkClock();
    if (agent.lastGreetPhase === phase) return;
    // 先记账再挑话：池子答不出来也算打过了，别每半秒重算一遍条件
    agent.lastGreetPhase = phase;

    const pool = findTalkPool(agent.definitionId);
    if (!pool) return;
    const entry = pickTalkEntry(
      pool.greetings,
      (condition) => evaluateCondition(condition, agent.residentId),
      `${agent.residentId}|${worldDayId}|${phase}|greet`,
    );
    if (!entry) return;

    agent.say(entry.key);
    agent.lastGreetDayId = worldDayId;
    if (entry.expression) agent.showExpression(entry.expression);
    signal("resident_greeted", agent.definitionId);
  },
};
