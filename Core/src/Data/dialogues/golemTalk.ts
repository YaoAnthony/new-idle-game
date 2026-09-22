import type { DialogueDefinition } from "../../types/dialogue.js";
import { GESTURES } from "../residents/gestures.js";

/**
 * 石傀儡醒来之后按 F（2026-09-16，用户给的原话，照抄）。
 *
 * 建造还没解锁（feature `golem_construction`）时，F 不开建造面板，而是这段：他只会"咔咔"。
 * 说完一遍（事件 `golem_intro` 到 talked）之后再按 F，他只回"...."（golem_silent）。
 *
 * 手势是**意思**，不写成字（用户 2026-09-16）：石傀儡举一只手 = 不是（`no`），举双手 = 是的（`yes`）。
 * "他举起了手"= n5 挂 `no`；"他看着你"= 对话本身就注视着你（21）。没手的时候造型用身子演（22）。
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

/*
 * ==== 三形态（居民系统 22，2026-09-21，用户原话）====
 * 把两只手给他 → "阿咔咔咔"；给他一张图纸 → "哇咔咔"，解锁建造；
 * 解锁之后按 F → "咔咔？"，选「建点什么」开建造面板。
 */

/** 第二只手装上那一拍（剧情规则接 resident_assembled 开的）：他第一次举起双手 */
const golemArms: DialogueDefinition = {
  id: "golem_arms",
  localizationKey: "dlg.golem_arms",
  speakerNameKey: "pet.stone_golem",
  entryNodeId: "n1",
  nodes: {
    n1: { nodeId: "n1", speaker: "npc", localizationKey: "dlg.golem_arms.n1", residentGesture: GESTURES.yes },
  },
};

/** 拿着图纸按 F（建造未解锁、零件齐全）。说完 → 剧情规则解锁 golem_construction。图纸不消耗 */
const golemBlueprint: DialogueDefinition = {
  id: "golem_blueprint",
  localizationKey: "dlg.golem_blueprint",
  speakerNameKey: "pet.stone_golem",
  entryNodeId: "n1",
  nodes: {
    n1: { nodeId: "n1", speaker: "npc", localizationKey: "dlg.golem_blueprint.n1", residentGesture: GESTURES.yes },
  },
};

/**
 * 建造解锁之后按 F：他问"咔咔？"，你选「建点什么」→ `dialogue_event golem_open_shop` → 开建造面板；
 * 「没事」就走。面板不直接开：用户定的是先有这一问。
 */
const golemReady: DialogueDefinition = {
  id: "golem_ready",
  localizationKey: "dlg.golem_ready",
  speakerNameKey: "pet.stone_golem",
  entryNodeId: "n1",
  nodes: {
    n1: {
      nodeId: "n1",
      speaker: "npc",
      localizationKey: "dlg.golem_ready.n1",
      choices: [
        { choiceId: "build", localizationKey: "dlg.golem_ready.build", emitEventId: "golem_open_shop" },
        { choiceId: "nothing", localizationKey: "dlg.golem_ready.nothing" },
      ],
    },
  },
};

export const golemDialogues: DialogueDefinition[] = [golemFirstTalk, golemSilent, golemArms, golemBlueprint, golemReady];
