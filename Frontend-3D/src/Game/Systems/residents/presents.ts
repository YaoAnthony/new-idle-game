import { COMMAND_SKILL_ID, findResidentDefinition, findSkillPriority, hashSeed, seededRandom } from "core";
import { on } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getClock } from "../../State/clock";
import { getLocalParticipant } from "../../State/participants";
import { getResident } from "../../State/residentsRuntime";
import { startDialogue } from "../dialogue";
import { signal } from "../story";
import { presentItems } from "../unpack";

/**
 * 他送你东西（居民系统 04）：随机赠礼和家人档的专属家具走同一条路。
 *
 * 剧情效果 `resident_present` → 这里：挑出那件东西 → 他走到你跟前（指令优先级的 walk_to，
 * 走不到就原地）→ 一段对话 → 对话结束那一拍弹领取面板。
 *
 * "要送什么"是运行时账（`pending`），不进存档：关掉游戏就作废，保底池下次再来——
 * 存一份"欠你的礼物"比丢一次礼物更容易出错（存了却找不到人 / 对话）。
 */
type Pending = { residentId: string; itemId: string; dialogueId: string };
const pending = new Map<string, Pending>();

/** 从他的 presents 里确定性挑一件（同一天同一位同一件） */
function pickPresent(definitionId: string, worldDayId: string): string | undefined {
  const presents = findResidentDefinition(definitionId)?.presents ?? [];
  if (presents.length === 0) return undefined;
  const index = Math.floor(seededRandom(hashSeed(`${definitionId}|${worldDayId}|present`))() * presents.length);
  return presents[Math.min(index, presents.length - 1)];
}

export function giveResidentPresent(residentId: string, dialogueId: string, itemId?: string): boolean {
  if (isRemoteWorld()) return false;
  const agent = getResident(residentId);
  if (!agent || agent.puppet) return false;
  const chosen = itemId ?? pickPresent(agent.definitionId, getClock().worldDayId);
  if (!chosen) return false;

  pending.set(dialogueId, { residentId, itemId: chosen, dialogueId });
  const { transform } = getLocalParticipant();
  const open = () => {
    if (!startDialogue(dialogueId, residentId)) pending.delete(dialogueId);
  };
  // 走到跟前再开口；排不出路（藏着、隔着墙）就原地说
  const accepted = agent.perform({
    skillId: COMMAND_SKILL_ID,
    priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
    interruptible: false,
    steps: [{ verb: "show" }, { verb: "walk_to", x: transform.x, z: transform.y, state: "approach" }],
    idleAfter: 0.5,
    onDone: open,
    onInterrupted: open,
  });
  if (!accepted) open();
  return true;
}

/** 调试 / 用例：现在等着送的 */
export function pendingPresents(): Pending[] {
  return [...pending.values()];
}

let detach: (() => void) | null = null;

export function startPresentSystem(): () => void {
  if (detach) return detach;
  const offEnded = on("story_signal", ({ kind, subject }) => {
    if (kind !== "dialogue_ended" || !subject) return;
    const entry = pending.get(subject);
    if (!entry) return;
    pending.delete(subject);
    const agent = getResident(entry.residentId);
    presentItems("loot.resident_present", [{ itemId: entry.itemId, quantity: 1 }]);
    if (agent) signal("resident_present_given", agent.definitionId);
  });
  detach = () => {
    offEnded();
    pending.clear();
    detach = null;
  };
  return detach;
}
