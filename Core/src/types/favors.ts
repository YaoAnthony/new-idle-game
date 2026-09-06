import type { LocalizationKey } from "./base.js";
import type { DialogueCondition, DialogueId } from "./dialogue.js";
import type { ItemId } from "./items.js";
import type { ResidentDefinitionId, SpotKind } from "./residents.js";
import type { StoryEffect } from "./story.js";

/**
 * 委托（居民系统 05）：他有事求你。
 *
 * 委托是**剧情规则的打包**，不是新引擎：定义说"要什么、怎么算交付、给什么"，
 * 运行时（前端 `Systems/residents/favors.ts`）只改状态表和收发物品，
 * 后果（好感、奖励、记忆）全走信号 → 剧情规则。过期只消失，不算失败。
 *
 * 五种 kind 的差别只在**交付条件**：
 * - find / cook：手持 `wants` 那件对他按 F（cook 只是文案和奖励不同，**同一条代码路径**）
 * - deliver：接受时给一件信物，手持信物对 `to` 按 F
 * - sick：手持药按 F；提出当天起他不出门（routine 被 sickUntilDayId 压住）
 * - visit_me：`window` 内到他家门口按 F；窗口过了算过期
 */
/**
 * 五种（05）+ 两种（13）：`escort` = 陪他走到某种场所（接受后他跟着你，你到了那儿就算完成）；
 * `plant` = 在他家旁边种点什么（他家附近有播了种的田就算）。
 */
export type FavorKind = "find" | "cook" | "deliver" | "sick" | "visit_me" | "escort" | "plant";

export type FavorDefinition = {
  id: string;
  residentId: ResidentDefinitionId;
  kind: FavorKind;
  /** find / cook / sick：要的那件 */
  wants?: { itemId: ItemId; quantity: number };
  /** deliver：接受时给你的信物（`ItemDefinition.favorToken` 的物品） */
  token?: { itemId: ItemId };
  /** deliver：送给谁 */
  to?: ResidentDefinitionId;
  /** deliver：送到哪张图（13 阿茜的小包送镇上的杂货铺——踏上那张图就算送到，没有收件人） */
  toMap?: string;
  /** visit_me：哪天几点到几点。dayOffset 1 = 提出的次日 */
  window?: { from: string; to: string; dayOffset: number };
  /** escort：陪他走到哪种场所（02 的场所种类） */
  escortTo?: SpotKind;
  /** plant：他家几米内有播了种的田就算 */
  plantedNear?: { radius: number };
  /** 提出的前提。复用对话条件，不发明第二套 */
  requires?: readonly DialogueCondition[];
  /** 抽签权重，缺省 1 */
  weight?: number;
  /** 提出后几天没做就消失 */
  expiresDays: number;
  /** 做完 / 过期后隔几天才可能再提 */
  cooldownDays?: number;
  offerDialogueId: DialogueId;
  doneDialogueId: DialogueId;
  /** deliver：收信物那位说的 */
  receiveDialogueId?: DialogueId;
  reward?: { items: ReadonlyArray<{ itemId: ItemId; quantity: number }> };
  /** 完成时额外的剧情效果（记忆之类）。由规则接 favor_completed 时一并执行 */
  onDone?: readonly StoryEffect[];
  /** 日记本 / 报纸那一行 */
  displayKey: LocalizationKey;
};

export type FavorState = "offered" | "accepted" | "done" | "expired" | "declined";

/** 存档里一条委托的状态。定义不进存档，只存 id 和日期 */
export type FavorSave = {
  residentId: string;
  offeredDayId: string;
  expiresDayId: string;
  state: FavorState;
  /** 做完 / 过期 / 拒绝的那天。cooldown 从它算 */
  closedDayId?: string;
};
