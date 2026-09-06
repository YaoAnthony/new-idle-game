import type { DialogueDefinition } from "../../types/dialogue.js";
import { favorDefinitions } from "../residents/favors.js";

/**
 * 委托的对话（居民系统 05），由委托表生成：
 *
 * - `favor_<id>_offer`：他开口求你。两个选项——答应（什么都不发，对话结束即接受）、
 *   拒绝（`emitEventId: favor_decline_<id>` → 直接过期，不进 cooldown 惩罚）。
 * - `favor_<id>_done`：交付时他说的。
 * - `favor_<id>_receive`（deliver）：收信物那位说的。
 *
 * 节点数固定：offer 两句 + 选项，done 两句，receive 一句。想给某条委托写长对话，
 * 把它从这里挪到手写即可，id 不变。
 */
function speakerOf(definitionId: string): string {
  return `pet.${definitionId}`;
}

function offer(id: string, residentId: string): DialogueDefinition {
  const dialogueId = `favor_${id}_offer`;
  return {
    id: dialogueId,
    localizationKey: `dlg.${dialogueId}`,
    speakerNameKey: speakerOf(residentId),
    entryNodeId: "n1",
    nodes: {
      n1: { nodeId: "n1", speaker: "npc", localizationKey: `dlg.${dialogueId}.n1`, expression: "shy", nextNodeId: "n2" },
      n2: {
        nodeId: "n2",
        speaker: "npc",
        localizationKey: `dlg.${dialogueId}.n2`,
        choices: [
          { choiceId: "accept", localizationKey: `dlg.${dialogueId}.accept`, nextNodeId: "n3" },
          { choiceId: "decline", localizationKey: `dlg.${dialogueId}.decline`, emitEventId: `favor_decline_${id}`, nextNodeId: "n4" },
        ],
      },
      n3: { nodeId: "n3", speaker: "npc", localizationKey: `dlg.${dialogueId}.n3`, expression: "happy" },
      n4: { nodeId: "n4", speaker: "npc", localizationKey: `dlg.${dialogueId}.n4` },
    },
  };
}

function line(dialogueId: string, residentId: string, count: number, expression?: string): DialogueDefinition {
  const nodes: DialogueDefinition["nodes"] = {};
  for (let i = 1; i <= count; i += 1) {
    nodes[`n${i}`] = {
      nodeId: `n${i}`,
      speaker: "npc",
      localizationKey: `dlg.${dialogueId}.n${i}`,
      ...(i === 1 && expression ? { expression } : {}),
      ...(i < count ? { nextNodeId: `n${i + 1}` } : {}),
    };
  }
  return { id: dialogueId, localizationKey: `dlg.${dialogueId}`, speakerNameKey: speakerOf(residentId), entryNodeId: "n1", nodes };
}

export const residentFavorDialogues: DialogueDefinition[] = favorDefinitions.flatMap((favor) => {
  const out: DialogueDefinition[] = [
    offer(favor.id, favor.residentId),
    line(`favor_${favor.id}_done`, favor.residentId, 2, "happy"),
  ];
  if (favor.kind === "deliver" && "to" in favor && favor.to) {
    out.push(line(`favor_${favor.id}_receive`, favor.to, 1, "surprised"));
  }
  return out;
});
