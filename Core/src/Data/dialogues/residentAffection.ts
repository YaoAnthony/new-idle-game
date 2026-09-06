import type { DialogueDefinition } from "../../types/dialogue.js";

/**
 * 好感与称呼（居民系统 04）的三种对话，三位各一份，由表生成：
 *
 * - `<who>_chat_naming`：伙伴档起闲聊池里的一段——"别这么叫我 / 换个口头禅 / 算了"。
 *   两个选项只报告（`emitEventId`），打开输入框是剧情规则接 `prompt_text` 效果的事。
 * - `<who>_gives_present`：他跑过来送你东西。说完这段，领取面板才弹（`Systems/residents/presents`）。
 * - `<who>_gives_signature`：到家人档那天，送那件专属家具。
 *
 * 文案键：`dlg.<id>.<node>`；选项 `dlg.<id>.<choice>`。
 */
const WHO = ["slime", "fox", "spirit"] as const;

function naming(who: (typeof WHO)[number]): DialogueDefinition {
  const id = `${who}_chat_naming`;
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
        expression: "shy",
        choices: [
          { choiceId: "nickname", localizationKey: `dlg.${id}.nickname`, emitEventId: `ask_nickname_${who}`, nextNodeId: "n2" },
          { choiceId: "catchphrase", localizationKey: `dlg.${id}.catchphrase`, emitEventId: `ask_catchphrase_${who}`, nextNodeId: "n3" },
          { choiceId: "fine", localizationKey: `dlg.${id}.fine`, nextNodeId: "n4" },
        ],
      },
      n2: { nodeId: "n2", speaker: "npc", localizationKey: `dlg.${id}.n2`, expression: "puzzled" },
      n3: { nodeId: "n3", speaker: "npc", localizationKey: `dlg.${id}.n3`, expression: "happy" },
      n4: { nodeId: "n4", speaker: "npc", localizationKey: `dlg.${id}.n4` },
    },
  };
}

function gives(who: (typeof WHO)[number], what: "present" | "signature"): DialogueDefinition {
  const id = `${who}_gives_${what}`;
  return {
    id,
    localizationKey: `dlg.${id}`,
    speakerNameKey: `pet.${who}_neighbor`,
    entryNodeId: "n1",
    nodes: {
      n1: { nodeId: "n1", speaker: "npc", localizationKey: `dlg.${id}.n1`, expression: what === "present" ? "happy" : "shy", nextNodeId: "n2" },
      n2: { nodeId: "n2", speaker: "npc", localizationKey: `dlg.${id}.n2` },
    },
  };
}

export const residentAffectionDialogues: DialogueDefinition[] = WHO.flatMap((who) => [
  naming(who),
  gives(who, "present"),
  gives(who, "signature"),
]);
