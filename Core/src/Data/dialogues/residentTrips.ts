import type { DialogueDefinition } from "../../types/dialogue.js";
import { tripDefinitions } from "../residents/trips.js";

/**
 * 多日出门的两段（居民系统 09）：出发前一天当面说、回来见面第一句。
 * 每位一份、每趟一份，由表生成：id = `<趟的对话前缀>_<who>`，文案键同名。
 * 回来那段说完由规则接 `dialogue_ended` 给礼物（trip_hometown_gift_<who>）。
 */
const WHO = ["slime", "fox", "spirit"] as const;

function linear(id: string, who: (typeof WHO)[number], count: number, expressions: readonly (string | undefined)[]): DialogueDefinition {
  const nodes: DialogueDefinition["nodes"] = {};
  for (let i = 1; i <= count; i += 1) {
    const nodeId = `n${i}`;
    nodes[nodeId] = {
      nodeId,
      speaker: "npc",
      localizationKey: `dlg.${id}.${nodeId}`,
      ...(i < count ? { nextNodeId: `n${i + 1}` } : {}),
      ...(expressions[i - 1] ? { expression: expressions[i - 1] } : {}),
    };
  }
  return { id, localizationKey: `dlg.${id}`, speakerNameKey: `pet.${who}_neighbor`, entryNodeId: "n1", nodes };
}

export const residentTripDialogues: DialogueDefinition[] = tripDefinitions.flatMap((trip) =>
  WHO.flatMap((who) => [
    linear(`${trip.announceDialogueId}_${who}`, who, 2, [undefined, "shy"]),
    linear(`${trip.backDialogueId}_${who}`, who, 2, ["happy", "happy"]),
  ]),
);
