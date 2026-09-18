import type { DialogueDefinition } from "../../types/dialogue.js";
import { GESTURES } from "../residents/gestures.js";

/**
 * 石傀儡醒来之后按 F（2026-09-16，用户给的原话，照抄）。
 *
 * 建造还没解锁（feature `golem_construction`）时，F 不开建造面板，而是这段：他只会"咔咔"。
 * 说完一遍（事件 `golem_intro` 到 talked）之后再按 F，他只回"...."（golem_silent）。
 * 什么时候能盖楼、他什么时候开口说人话，是后面的剧情（用户：我们后面慢慢安排）。
 *
 * 手势是**意思**，不写成字（用户 2026-09-16）：石傀儡举一只手 = 不是（`no`），举双手 = 是的（`yes`）。
 * "他举起了手"= n5 挂 `no`；"他看着你"= 对话本身就注视着你（21）。
 */
const golemFirstTalk: DialogueDefinition = {
  id: "golem_first_talk",
  localizationKey: "dlg.golem_first_talk",
  speakerNameKey: "pet.stone_golem",
  entryNodeId: "n1",
  nodes: {
    n1: { nodeId: "n1", speaker: "npc", localizationKey: "dlg.golem_first_talk.n1", nextNodeId: "n2" },
    n2: { nodeId: "n2", speaker: "player", localizationKey: "dlg.golem_first_talk.n2", nextNodeId: "n3" },
    n3: { nodeId: "n3", speaker: "npc", localizationKey: "dlg.golem_first_talk.n3", nextNodeId: "n4" },
    n4: { nodeId: "n4", speaker: "player", localizationKey: "dlg.golem_first_talk.n4", nextNodeId: "n5" },
    n5: { nodeId: "n5", speaker: "npc", localizationKey: "dlg.golem_first_talk.n5", residentGesture: GESTURES.no, nextNodeId: "n6" },
    n6: { nodeId: "n6", speaker: "player", localizationKey: "dlg.golem_first_talk.n6", nextNodeId: "n7" },
    n7: { nodeId: "n7", speaker: "npc", localizationKey: "dlg.golem_first_talk.n7", nextNodeId: "n8" },
    n8: { nodeId: "n8", speaker: "player", localizationKey: "dlg.golem_first_talk.n8" },
  },
};

/** 说过一遍之后：他不理你了 */
const golemSilent: DialogueDefinition = {
  id: "golem_silent",
  localizationKey: "dlg.golem_silent",
  speakerNameKey: "pet.stone_golem",
  entryNodeId: "n1",
  nodes: {
    n1: { nodeId: "n1", speaker: "npc", localizationKey: "dlg.golem_silent.n1" },
  },
};

export const golemDialogues: DialogueDefinition[] = [golemFirstTalk, golemSilent];
