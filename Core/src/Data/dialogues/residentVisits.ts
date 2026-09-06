import type { DialogueDefinition } from "../../types/dialogue.js";

/**
 * 来访（居民系统 07）的对话，三位各一份，由表生成：
 *
 * `<who>_knocks`：门外站着他，你在门内按 F 开的那段——"进来吧 / 现在不方便"。
 * 两个选项只报告（`visit_admit_<who>` / `visit_refuse_<who>`），开门放人是剧情效果的事。
 * 进屋之后的评论不走对话面板，是头顶气泡（`speak`），文案由 houseComment 求值挑。
 */
const WHO = ["slime", "fox", "spirit"] as const;

function knocks(who: (typeof WHO)[number]): DialogueDefinition {
  const id = `${who}_knocks`;
  return {
    id,
    localizationKey: `dlg.${id}`,
    speakerNameKey: `pet.${who}_neighbor`,
    entryNodeId: "n1",
    nodes: {
      n1: {
        nodeId: "n1",
        speaker: "npc",
        localizationKey: `dlg.${id}.n1`,
        expression: "happy",
        choices: [
          { choiceId: "admit", localizationKey: `dlg.${id}.admit`, emitEventId: `visit_admit_${who}`, nextNodeId: "n2" },
          { choiceId: "refuse", localizationKey: `dlg.${id}.refuse`, emitEventId: `visit_refuse_${who}`, nextNodeId: "n3" },
        ],
      },
      n2: { nodeId: "n2", speaker: "npc", localizationKey: `dlg.${id}.n2` },
      n3: { nodeId: "n3", speaker: "npc", localizationKey: `dlg.${id}.n3`, expression: "shy" },
    },
  };
}

export const residentVisitDialogues: DialogueDefinition[] = WHO.map(knocks);
