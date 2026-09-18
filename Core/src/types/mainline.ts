import type { FeatureId, LocalizationKey } from "./base.js";
import type { DialogueCondition } from "./dialogue.js";

/**
 * 主线（2026-09-16）。
 *
 * ## 架构
 *
 * - **主线是注册表**（`Data/mainline`）：一章 = 若干节拍 + 一个"算完成"的条件 + 完成时解锁的 feature。
 *   条件复用对话条件表（旗子 / 事件阶段 / feature / 物品…），所以一章的进度**不另存**：
 *   随时从现有的事件、旗子、背包重算。
 * - **"做完了"落成的事实** = `unlockedFeatureIds` 里多一个 id（只增不减，现成机制）。
 *   随机池、门、面板要问"主线到哪了"，问的都是 feature，不问章。
 * - **章按顺序推进**：上一章没完成，下一章的节拍不求值。
 * - **运行时**在 Frontend `Systems/mainline.ts`：开机对账一次（老档里早做完的补 feature），
 *   之后听进度 / 旗子 / 背包变化重算；章完成那一拍发剧情信号 `mainline_chapter_done`（subject = 章 id），
 *   "某章做完弹一段旁白"就是一条普通剧情规则。
 *
 * 加一章 = 注册表里追加一项 + 文案键。不改引擎。
 */

export type MainlineChapterId = string;

/** 一章里的一个节拍。只做展示与调试（"到哪一步了"），章的完成只看 `doneWhen` */
export type MainlineBeat = {
  id: string;
  titleKey: LocalizationKey;
  /** 这一拍算做完的判据（对话条件语法，按"没有对话对象"求值） */
  done: DialogueCondition;
};

export type MainlineChapter = {
  id: MainlineChapterId;
  titleKey: LocalizationKey;
  /** 顺序节拍 */
  beats: readonly MainlineBeat[];
  /** 这一章算完成的判据 */
  doneWhen: DialogueCondition;
  /** 完成那一拍解锁的 feature（至少一个）。随机池的门、小镇、面板都拿这些当门槛 */
  unlocks: readonly FeatureId[];
};

/** 面板 / 调试口消费的进度快照 */
export type MainlineProgress = {
  /** 当前章；全部完成 = null */
  chapter: MainlineChapter | null;
  /** 当前章里第一个没做完的节拍；章刚完成还没落成时可能是 null */
  beat: MainlineBeat | null;
  /** 已完成的章 id，按注册表顺序 */
  completed: readonly MainlineChapterId[];
};
