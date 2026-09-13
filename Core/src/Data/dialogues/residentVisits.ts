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

/**
 * 小鱼人第一次来敲门（居民系统 20）：来找魔女做交易，魔女不在。一条线，没有分支，
 * "你"的台词是 speaker: "player" 的节点而不是选项——这段玩家没有可选的回答。
 * 说完由规则接 `dialogue_ended fish_trader_knocks` 让他走；对话本身不写效果。
 * id 沿用 `<谁>_knocks`：门上按 F 那条路（RoomScene）和 visitPlayer 技能都按这个名字找。
 */
const fishTraderKnocks: DialogueDefinition = {
  id: "fish_trader_knocks",
  localizationKey: "dlg.fish_trader_knocks",
  speakerNameKey: "pet.fish_trader",
  entryNodeId: "n1",
  nodes: {
    n1: { nodeId: "n1", speaker: "npc", localizationKey: "dlg.fish_trader_knocks.n1", nextNodeId: "n2" },
    n2: { nodeId: "n2", speaker: "player", localizationKey: "dlg.fish_trader_knocks.n2", nextNodeId: "n3" },
    n3: { nodeId: "n3", speaker: "npc", localizationKey: "dlg.fish_trader_knocks.n3", expression: "angry", nextNodeId: "n4" },
    n4: { nodeId: "n4", speaker: "npc", localizationKey: "dlg.fish_trader_knocks.n4", nextNodeId: "n5" },
    n5: { nodeId: "n5", speaker: "player", localizationKey: "dlg.fish_trader_knocks.n5", nextNodeId: "n6" },
    n6: { nodeId: "n6", speaker: "npc", localizationKey: "dlg.fish_trader_knocks.n6", expression: "angry", residentGesture: "stomp", nextNodeId: "n7" },
    n7: { nodeId: "n7", speaker: "npc", localizationKey: "dlg.fish_trader_knocks.n7", nextNodeId: "n8" },
    n8: { nodeId: "n8", speaker: "player", localizationKey: "dlg.fish_trader_knocks.n8", nextNodeId: "n9" },
    n9: { nodeId: "n9", speaker: "npc", localizationKey: "dlg.fish_trader_knocks.n9", expression: "speechless", nextNodeId: "n10" },
    n10: { nodeId: "n10", speaker: "npc", localizationKey: "dlg.fish_trader_knocks.n10", expression: "resigned" },
  },
};

export const residentVisitDialogues: DialogueDefinition[] = [...WHO.map(knocks), fishTraderKnocks];
