import type { DialogueDefinition, DialogueNode } from "../../types/dialogue.js";

/**
 * 个人线的对话（居民系统 13）：
 * - `slime_opens_up`：咕噜家人档那天早上主动来说的长段，最后一句发 `slime_arc_done`；
 * - 幕后段 `<who>_arc_<stage>_<n>`：每幕过后闲聊池里多的三段，条件是 `event_stage`（在 talk 表里）。
 *   文案在前端 i18n `dlg.<id>` / `.n1` / `.n2`。
 */
const ARC_CHATS: ReadonlyArray<readonly [who: string, stage: string, rows: ReadonlyArray<readonly [nodes: number, expressions?: readonly (string | undefined)[]]>]> = [
  ["slime", "afraid_of_dark", [[2, ["shy"]], [2, ["puzzled"]], [2, ["sad"]]]],
  ["slime", "lamp_lit", [[2, ["happy"]], [2, ["happy"]], [2, ["shy"]]]],
  ["slime", "done", [[2, ["sad", "happy"]], [2], [2, ["shy"]]]],
  ["fox", "wants_shortcut", [[2, ["puzzled"]], [2, ["sad"]], [2, ["surprised"]]]],
  ["fox", "delivered_to_town", [[2, ["happy"]], [2, ["happy"]], [2]]],
  ["fox", "brought_letter", [[2, ["puzzled"]], [2, ["surprised"]], [2]]],
  ["spirit", "asked_to_plant", [[2], [2], [2, ["shy"]]]],
  ["spirit", "planted", [[2, ["happy"]], [2], [2, ["shy"]]]],
  ["spirit", "taught_chimes", [[2], [2], [2, ["happy"]]]],
];

function chat(who: string, stage: string, n: number, count: number, expressions: readonly (string | undefined)[] = []): DialogueDefinition {
  const id = `${who}_arc_${stage}_${n}`;
  const nodes: Record<string, DialogueNode> = {};
  for (let i = 1; i <= count; i += 1) {
    const nodeId = `n${i}`;
    const node: DialogueNode = { nodeId, speaker: "npc", localizationKey: `dlg.${id}.${nodeId}` };
    if (i < count) node.nextNodeId = `n${i + 1}`;
    const expression = expressions[i - 1];
    if (expression) node.expression = expression;
    nodes[nodeId] = node;
  }
  return { id, localizationKey: `dlg.${id}`, speakerNameKey: `pet.${who}_neighbor`, entryNodeId: "n1", nodes };
}

export const arcChatIds: Record<string, Record<string, string[]>> = {};
const chats: DialogueDefinition[] = [];
for (const [who, stage, rows] of ARC_CHATS) {
  arcChatIds[who] ??= {};
  arcChatIds[who][stage] = rows.map((row, index) => {
    const definition = chat(who, stage, index + 1, row[0], row[1]);
    chats.push(definition);
    return definition.id;
  });
}

const slimeOpensUp: DialogueDefinition = {
  id: "slime_opens_up",
  localizationKey: "dlg.slime_opens_up",
  speakerNameKey: "pet.slime_neighbor",
  entryNodeId: "n1",
  nodes: {
    n1: { nodeId: "n1", speaker: "npc", localizationKey: "dlg.slime_opens_up.n1", expression: "shy", nextNodeId: "n2" },
    n2: { nodeId: "n2", speaker: "npc", localizationKey: "dlg.slime_opens_up.n2", nextNodeId: "n3" },
    n3: { nodeId: "n3", speaker: "npc", localizationKey: "dlg.slime_opens_up.n3", expression: "sad", nextNodeId: "n4" },
    n4: { nodeId: "n4", speaker: "npc", localizationKey: "dlg.slime_opens_up.n4", nextNodeId: "n5" },
    n5: { nodeId: "n5", speaker: "npc", localizationKey: "dlg.slime_opens_up.n5", expression: "happy", emitEventId: "slime_arc_done" },
  },
};

export const residentArcDialogues: DialogueDefinition[] = [slimeOpensUp, ...chats];
