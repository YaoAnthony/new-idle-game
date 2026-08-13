import type { DialogueDefinition } from "../../types/dialogue.js";

/**
 * 对话注册表。
 *
 * 2026-08-13 清空：旧的六段（搬家独白、苔灵初见/寒暄、舒舒初见/寒暄、
 * 妈妈来电，共 56 个节点）随旧剧情一起推倒。
 *
 * 重写时的几条既有约定，都还成立：
 *
 * - **对话本身不写效果**。节点只用 `emitEventId` 报告"我到了这里"，
 *   接什么后果由 storyRules 按 subject 声明。两套效果系统会打架。
 * - **送礼节点四档回应一个都不能少**（`onTierNodeId` 是 Record，
 *   编译器会逼出穷尽性）。档位由喜好表算，作者只负责写"这一档什么反应"。
 * - **收不收礼不在对话里点名**。玩家能送错是设计要求，试错是了解对方的
 *   一部分——判定在 `logic/giftRules.ts`。
 * - 宠物的对话由 `PetDefinition.dialogues` 认领（firstMeet / casual），
 *   交互层不认识具体是哪只，加宠物不用改 RoomScene。
 *
 * ⚠️ 写条件分支前先知道三处坏的（`Frontend-3D/src/Game/Systems/dialogue.ts`）：
 * `event_completed` 实际判的是"触发过"不是"完成了"；
 * `feature_unlocked` 和 `weather_is` 恒返回 false，挂它们的选项永远不显示。
 */
export const dialogueDefinitions: DialogueDefinition[] = [];

export function findDialogueDefinition(
  id: string,
): DialogueDefinition | undefined {
  return dialogueDefinitions.find((dialogue) => dialogue.id === id);
}
