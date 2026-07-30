import type { DialogueDefinition } from "../../types/dialogue.js";

/**
 * 对话注册表。首只宠物（苔灵）的初见对话：
 * 分支选择 + 送礼（itemRequest）+ 通过 emitEventId 把后果交给事件系统。
 *
 * 调子是**好奇话痨**：它把玩家当成"外面世界"的信息源，什么都想问。
 * 送礼那一段是全作的题眼——玩家递上的是**现实行动换来的东西**，
 * 而它连见都没见过，于是意识到你来自另一个世界。
 */
export const dialogueDefinitions: DialogueDefinition[] = [
  {
    id: "moss_wisp_first_meet",
    localizationKey: "dialogue.moss_wisp_first_meet",
    speakerNameKey: "pet.moss_wisp.nickname",
    entryNodeId: "n1",
    nodes: {
      n1: {
        nodeId: "n1",
        speaker: "npc",
        localizationKey: "dlg.first.n1",
        nextNodeId: "n2",
      },
      n2: {
        nodeId: "n2",
        speaker: "npc",
        localizationKey: "dlg.first.n2",
        choices: [
          {
            choiceId: "c_who",
            localizationKey: "dlg.first.c_who",
            nextNodeId: "n3",
          },
          {
            choiceId: "c_new",
            localizationKey: "dlg.first.c_new",
            nextNodeId: "n3b",
          },
        ],
      },
      n3: {
        nodeId: "n3",
        speaker: "npc",
        localizationKey: "dlg.first.n3",
        nextNodeId: "n4",
      },
      n3b: {
        nodeId: "n3b",
        speaker: "npc",
        localizationKey: "dlg.first.n3b",
        nextNodeId: "n4",
      },
      n4: {
        nodeId: "n4",
        speaker: "npc",
        localizationKey: "dlg.first.n4",
        itemRequest: {
          acceptedItemIds: ["tomato", "egg", "fried_tomato_egg"],
          consumeItem: true,
          onAcceptNodeId: "n5",
          onRejectNodeId: "n6",
        },
      },
      n5: {
        nodeId: "n5",
        speaker: "npc",
        localizationKey: "dlg.first.n5",
        emitEventId: "pet_gift_accepted",
        nextNodeId: "n7",
      },
      n6: {
        nodeId: "n6",
        speaker: "npc",
        localizationKey: "dlg.first.n6",
      },
      n7: {
        nodeId: "n7",
        speaker: "npc",
        localizationKey: "dlg.first.n7",
      },
    },
  },
  {
    id: "moss_wisp_casual",
    localizationKey: "dialogue.moss_wisp_casual",
    speakerNameKey: "pet.moss_wisp.nickname",
    entryNodeId: "c1",
    nodes: {
      c1: {
        nodeId: "c1",
        speaker: "npc",
        localizationKey: "dlg.casual.c1",
      },
    },
  },
  {
    id: "mom_first_call",
    localizationKey: "dialogue.mom_first_call",
    speakerNameKey: "npc.mom",
    entryNodeId: "m1",
    nodes: {
      m1: {
        nodeId: "m1",
        speaker: "npc",
        localizationKey: "dlg.mom.m1",
        nextNodeId: "m2",
      },
      m2: {
        nodeId: "m2",
        speaker: "npc",
        localizationKey: "dlg.mom.m2",
        choices: [
          {
            choiceId: "mc_good",
            localizationKey: "dlg.mom.mc_good",
            nextNodeId: "m3",
          },
          {
            choiceId: "mc_pet",
            localizationKey: "dlg.mom.mc_pet",
            nextNodeId: "m3b",
          },
        ],
      },
      m3: {
        nodeId: "m3",
        speaker: "npc",
        localizationKey: "dlg.mom.m3",
        nextNodeId: "m4",
      },
      m3b: {
        nodeId: "m3b",
        speaker: "npc",
        localizationKey: "dlg.mom.m3b",
        nextNodeId: "m4",
      },
      m4: {
        nodeId: "m4",
        speaker: "npc",
        localizationKey: "dlg.mom.m4",
        emitEventId: "mom_promised_machine",
      },
    },
  },
];

export function findDialogueDefinition(
  id: string,
): DialogueDefinition | undefined {
  return dialogueDefinitions.find((dialogue) => dialogue.id === id);
}
