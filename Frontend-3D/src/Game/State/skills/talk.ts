import { findTalkPool, listTalkCandidates, pickTalkEntry, type ChatEntry } from "core";
import { evaluateCondition } from "../../Systems/dialogue";
import { talkClock } from "../../Systems/residents/talk";
import { visitorDialogueFor } from "../../Systems/residents/visitors";
import { signal } from "../../Systems/story";
import type { ResidentAgent } from "../residentAgent";
import type { Skill } from "./types";

/**
 * 闲聊（居民系统 03）：按 F 开哪一段。没有 `decide`——他不会主动找你聊，是你找他。
 *
 * 段落由闲聊池按条件抽（`pickTalkEntry`，确定性：同一天同一次数重开必是同一段）。
 * 抽到了就记一笔 `talksToday`（"说够了"靠它）和"今天出现过"（`oncePerDay` 的段不重播）。
 * 记账写在 interact 里而不是对话开始时：F 是玩家的动作，账就该在这一下结。
 * 木偶（房客做客时）**只读不写**：条件在房客本地算，账留在房主那边。
 */

/** 今天已经出现过的一次性段落。运行时，跨天自然作废 */
const shownToday = new WeakMap<ResidentAgent, { dayId: string; ids: Set<string> }>();

function shownSetOf(agent: ResidentAgent, dayId: string): Set<string> {
  const entry = shownToday.get(agent);
  if (entry && entry.dayId === dayId) return entry.ids;
  const fresh = { dayId, ids: new Set<string>() };
  shownToday.set(agent, fresh);
  return fresh.ids;
}

/** 此刻能抽的段和权重、会抽到哪段——`/npc <谁> talk` 打印用 */
export function chatOutlook(agent: ResidentAgent): {
  talksToday: number;
  candidates: Array<{ entry: ChatEntry; weight: number }>;
  pick: ChatEntry | null;
} | null {
  const pool = findTalkPool(agent.definitionId);
  if (!pool) return null;
  const { worldDayId } = talkClock();
  const talks = agent.talksOn(worldDayId);
  const shown = shownSetOf(agent, worldDayId);
  const holds = (condition: Parameters<typeof evaluateCondition>[0]) => evaluateCondition(condition, agent.residentId);
  const entries = pool.chats.filter((entry) => !(entry.oncePerDay && shown.has(entry.dialogueId)));
  return {
    talksToday: talks,
    candidates: listTalkCandidates(entries, holds),
    pick: pickTalkEntry(entries, holds, `${agent.residentId}|${worldDayId}|${talks}|chat`),
  };
}

/** 清掉今天的账（调试口 `/npc <谁> reset-talk`） */
export function resetTalkToday(agent: ResidentAgent): void {
  shownToday.delete(agent);
  agent.resetTalks();
}

export const talkSkill: Skill = {
  id: "talk",
  forVisitors: true,
  interact: ({ agent }) => {
    if (agent.dormant) return null;
    // 09：桥头的访客按 F 是"想住下来吗"那段（邀过了就是普通寒暄），不进闲聊池
    const visitorDialogue = visitorDialogueFor(agent);
    if (visitorDialogue) return { kind: "dialogue", dialogueId: visitorDialogue };
    const outlook = chatOutlook(agent);
    if (!outlook?.pick) return null;
    const { worldDayId } = talkClock();
    if (!agent.puppet) {
      agent.noteTalk(worldDayId);
      if (outlook.pick.oncePerDay) shownSetOf(agent, worldDayId).add(outlook.pick.dialogueId);
      signal("resident_talked", agent.definitionId);
    }
    return { kind: "dialogue", dialogueId: outlook.pick.dialogueId };
  },
};
