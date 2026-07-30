import {
  storyRules,
  type StorySignal,
  type StoryTrigger,
  type StoryEffect,
} from "core";
import { emit, on } from "../EventBus";
import { addItem } from "../State/inventory";
import { setPetAffection, spawnPet } from "../State/petsRuntime";
import { startDialogue } from "./dialogue";
import { getEventStage, setEventStage, unlockFeature } from "./events";

/**
 * 剧情解释器。剧情内容全部来自 Core 的 storyRules 注册表，
 * 这里只负责"匹配触发器 → 执行效果"，不含任何具体剧情分支。
 *
 * 玩法系统只管发信号（emit("story_signal", {...})），不知道剧情的存在；
 * 剧情规则声明关心哪些信号。两边完全解耦。
 */

const firedRules = new Set<string>();

/**
 * 有没有挡视线的面板开着（工作台/背包这类）。
 *
 * 宠物登场是"制作完之后突然出现"的突发事件，如果在玩家还盯着工作台面板时
 * 就蹦出来，过场被面板挡住、也没有"突然"可言。所以延迟登场要**先等面板关掉**
 * 再开始计时。这里只订阅 EventBus 的事件，不知道 React 的存在。
 */
let blockingPanelOpen = false;

/** 等到没有面板挡着再执行；已经空着就直接跑 */
function whenPanelsClear(run: () => void): void {
  if (!blockingPanelOpen) return run();

  const poll = setInterval(() => {
    if (blockingPanelOpen) return;
    clearInterval(poll);
    run();
  }, 250);
}

function triggerMatches(trigger: StoryTrigger, signal: StorySignal): boolean {
  if (trigger.signal !== signal.kind) return false;
  if (trigger.subject && trigger.subject !== signal.subject) return false;

  if (
    trigger.requiresEventUntriggered &&
    getEventStage(trigger.requiresEventUntriggered) !== null
  ) {
    return false;
  }

  if (trigger.requiresEventStage) {
    const { eventId, stageId } = trigger.requiresEventStage;
    if (getEventStage(eventId) !== stageId) return false;
  }

  return true;
}

function runEffect(effect: StoryEffect): void {
  switch (effect.kind) {
    case "set_event_stage":
      setEventStage(
        effect.eventId,
        effect.stageId,
        effect.complete ? "completed" : "active",
      );
      break;

    case "set_affection":
      setPetAffection(effect.petId, effect.stage);
      break;

    case "unlock_feature":
      unlockFeature(effect.featureId);
      break;

    case "give_item":
      addItem(effect.itemId, effect.quantity);
      break;

    case "spawn_pet": {
      const { petId, definitionId, delayMs = 0, jitterMs = 0 } = effect;
      const wait = delayMs + Math.random() * jitterMs;

      // 先等面板关掉，再等这段时间——"突然出现"要发生在玩家看得见屋子的时候
      whenPanelsClear(() => {
        if (wait > 0) setTimeout(() => spawnPet(petId, definitionId), wait);
        else spawnPet(petId, definitionId);
      });
      break;
    }

    case "start_dialogue": {
      const run = () =>
        startDialogue(effect.dialogueId, effect.petId ?? null);
      if (effect.delayMs) setTimeout(run, effect.delayMs);
      else run();
      break;
    }

    case "show_toast":
      emit("story_toast", {
        localizationKey: effect.localizationKey,
        durationMs: effect.durationMs ?? 6000,
      });
      break;
  }
}

function handleSignal(signal: StorySignal): void {
  for (const rule of storyRules) {
    if ((rule.once ?? true) && firedRules.has(rule.id)) continue;
    if (!rule.triggers.some((trigger) => triggerMatches(trigger, signal))) {
      continue;
    }

    firedRules.add(rule.id);
    for (const effect of rule.effects) runEffect(effect);
  }
}

// ---- 存档 ----
//
// 已触发过的规则必须入档，否则读档后 once 重新成立，
// 开场提示和灰灰登场会再演一遍。

export function getFiredStoryRuleIds(): string[] {
  return [...firedRules];
}

export function restoreFiredStoryRules(ids: string[]): void {
  firedRules.clear();
  for (const id of ids) firedRules.add(id);
}

let detach: (() => void) | null = null;

/**
 * 挂上信号监听。整个应用只调一次。
 *
 * `emitGameStarted` 在读档进入时传 false——存档里的剧情已经推进过了，
 * 不该把"终于搬进来了"再播一遍。
 */
export function startStorySystem(emitGameStarted = true): () => void {
  if (detach) return detach;

  const off = on("story_signal", handleSignal);
  const offPanel = on("blocking_panel_changed", ({ open }) => {
    blockingPanelOpen = open;
  });
  detach = () => {
    off();
    offPanel();
    blockingPanelOpen = false;
    detach = null;
  };

  // 开场信号：让"搬进新家"这类规则有机会触发
  if (emitGameStarted) emit("story_signal", { kind: "game_started" });
  return detach;
}

/** 玩法系统发信号的统一入口 */
export function signal(
  kind: StorySignal["kind"],
  subject?: string,
): void {
  emit("story_signal", { kind, subject });
}
