import { COMMAND_SKILL_ID, findSkillPriority, findTalkPool, renderAddress, renderTalk, residentIdOf, type DayPhaseId } from "core";
import { on } from "../../EventBus";
import { getClock } from "../../State/clock";
import { findDroppedItem } from "../../State/droppedItems";
import { getResident, getResidents } from "../../State/residentsRuntime";
import { residentNickname } from "../../../i18n/residentName";
import { t } from "../../../i18n/t";
import { getActiveDialogue } from "../dialogue";
import { addressTermFor } from "./affection";

/**
 * 对话的系统层（居民系统 03）。三件事：
 *
 * 1. **时钟来源**：招呼节流、闲聊种子、"几天没聊"都读它。用例可以换掉（同 02 的做法）。
 * 2. **台词渲染**：文案键 → 文字，`{cp}` 换成这位的口头禅。气泡和面板都走这一个口。
 * 3. **接线**：对话开着他看着你（注意力 `dialogue`，身体转过来、头跟着你，21）并站住
 *    （`stand`，指令优先级，关掉恢复）；
 *    EventBus 的天气 / 落地事件翻成事件键递给 `reactions` 技能。
 *
 * 台词、条件、抽取都不在这里——这里没有一句话。
 */

export type TalkClock = { worldDayId: string; phase: `${DayPhaseId}` };

let clockSource: () => TalkClock = () => {
  const clock = getClock();
  return { worldDayId: clock.worldDayId, phase: clock.phase };
};

export function talkClock(): TalkClock {
  return clockSource();
}

export function setTalkClockSource(source: (() => TalkClock) | null): void {
  clockSource = source ?? (() => {
    const clock = getClock();
    return { worldDayId: clock.worldDayId, phase: clock.phase };
  });
}

/** 一位居民的口头禅（文字）。玩家改过的优先（04）；没有口头禅的 undefined */
export function catchphraseOf(definitionId: string): string | undefined {
  const custom = getResidents().find((agent) => agent.definitionId === definitionId)?.catchphrase;
  if (custom) return custom;
  const key = findTalkPool(definitionId)?.catchphrase;
  return key ? t(key) : undefined;
}

/** 文案里的 `{name:<definitionId>}` → 那位的昵称（06 的八卦引用别人） */
export function renderNames(text: string): string {
  if (!text.includes("{name:")) return text;
  return text.replace(/\{name:([a-z_]+)\}/g, (_match, definitionId: string) => residentNickname(residentIdOf(definitionId)));
}

/** 文案键 → 这位说出来的样子：`{cp}` 换口头禅，`{you}` 换他此刻怎么叫你（04），`{name:x}` 换别人的名字（06） */
export function talkText(definitionId: string, localizationKey: string): string {
  return renderNames(renderAddress(renderTalk(t(localizationKey), catchphraseOf(definitionId)), addressTermFor(definitionId)));
}

/** 反应的事件半径：扔的东西落在这么近才算"落在身边" */
const NEAR_METERS = 2.5;

let detach: (() => void) | null = null;

export function startTalkSystem(): () => void {
  if (detach) return detach;

  /*
   * 对话开着 → 面向玩家。用指令优先级的 stand：正在走的作息被抢掉，onInterrupted
   * 会把座位放掉，关掉对话后 routine 重新决策——比"暂停再恢复"简单得多，
   * 而且他本来就该站住听你说话。3600 秒只是"直到我叫停"的写法。
   */
  const offDialogue = on("dialogue_changed", ({ open }) => {
    const active = getActiveDialogue();
    if (open) {
      const agent = active?.residentId ? getResident(active.residentId) : undefined;
      if (!agent || agent.puppet || agent.state === "hidden") return;
      // 整段对话他都不 tick（tickResidents 冻住说话的那位），头顶那句——敲门的「叩叩……」、没说完的闲话——
      // 不会自己到期，会一直挂到对话结束（20：门开着对你说话，头上还顶着叩叩）。话归对话框说
      agent.hush();
      /*
       * 看着你（21）：身体站着就转过来、头跟着你。目标每帧重读，不是开对话那一拍你站哪的快照——
       * 原来 stand 里带的 facing 就是那种快照。敲门的那位也看：门一开你站在门口，他转过来。
       */
      agent.attend("dialogue", { kind: "player" });
      speaker = agent.residentId;
      // 正在你门外敲门的那位（07）已经站定在等你，别把 knock 那条 Intent 抢掉——
      // 抢掉等于"没人开门他走了"，来访状态会被清空，开门对话选了"进来吧"也进不来
      if (agent.currentIntent?.steps[agent.currentStepIndex]?.verb === "knock") return;
      agent.perform({
        skillId: COMMAND_SKILL_ID,
        priority: findSkillPriority(COMMAND_SKILL_ID)?.priority ?? 1000,
        interruptible: false,
        steps: [{ verb: "stand", seconds: 3600 }],
        idleAfter: 0.5,
      });
      commanded = agent.residentId;
    } else {
      if (speaker) getResident(speaker)?.unattend("dialogue");
      if (commanded) getResident(commanded)?.cancelCommand();
      speaker = null;
      commanded = null;
    }
  });
  /** 正在和你说话的那位（挂了 dialogue 注意力） / 被下了 stand 指令的那位（敲门的没有） */
  let speaker: string | null = null;
  let commanded: string | null = null;

  const offWeather = on("weather_changed", ({ kind }) => {
    for (const agent of getResidents()) {
      if (!agent.puppet) agent.notify({ key: `weather:${kind}` });
    }
  });

  const offLanded = on("dropped_item_landed", ({ id }) => {
    const entity = findDroppedItem(id);
    if (!entity) return;
    for (const agent of getResidents()) {
      if (agent.puppet) continue;
      const distance = Math.hypot(entity.x - agent.x, entity.z - agent.z);
      if (distance <= NEAR_METERS) agent.notify({ key: "item_landed_near", x: entity.x, z: entity.z });
    }
  });

  detach = () => {
    offDialogue();
    offWeather();
    offLanded();
    speaker = null;
    commanded = null;
    detach = null;
  };
  return detach;
}
