import type { DialogueDefinition } from "../../types/dialogue.js";

/**
 * 对话注册表。首只宠物（苔灵）的初见对话：
 * 分支选择 + 送礼（itemRequest）+ 通过 emitEventId 把后果交给事件系统。
 *
 * 调子是**好奇话痨**：它把玩家当成"外面世界"的信息源，什么都想问。
 * 送礼那一段是全作的题眼——玩家递上的是**现实行动换来的东西**，
 * 而它连见都没见过，于是意识到你来自另一个世界。
 *
 * 送礼节点写四档回应而不是"接受/拒绝"两条：档位由喜好表算，
 * 内容作者只负责写"它这一档是什么反应"（见 `logic/giftRules.ts`）。
 */
export const dialogueDefinitions: DialogueDefinition[] = [
  /**
   * 开场独白（2026-07-30）。搬进新家的第一分钟不该是"面对空房子发呆"——
   * 玩家自己先说两句，把"这是我的家了"和"该收拾了"两件事说明白，
   * 顺手把目光引到门口那两个箱子上。speaker 是 player：
   * 名字药丸显示"你"，头像那半自然空着，符合独白的样子。
   */
  {
    id: "moving_in_monologue",
    localizationKey: "dialogue.moving_in_monologue",
    entryNodeId: "m1",
    nodes: {
      m1: {
        nodeId: "m1",
        speaker: "player",
        localizationKey: "dlg.movein.m1",
        nextNodeId: "m2",
      },
      m2: {
        nodeId: "m2",
        speaker: "player",
        localizationKey: "dlg.movein.m2",
        nextNodeId: "m3",
      },
      m3: {
        nodeId: "m3",
        speaker: "player",
        localizationKey: "dlg.movein.m3",
      },
    },
  },

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
        /**
         * 递什么都收得下——**没有白名单**。四档各有各的反应，
         * 但四条路最后都汇到 n7：题眼是"你不是这里的人"，
         * 和这一口好不好吃无关，所以哪一档都不该让第一天卡住。
         */
        itemRequest: {
          onTierNodeId: {
            loved: "n5_loved",
            liked: "n5_liked",
            disliked: "n5_disliked",
            inedible: "n5_inedible",
          },
          onDeclineNodeId: "n6",
        },
      },
      n5_loved: {
        nodeId: "n5_loved",
        speaker: "npc",
        localizationKey: "dlg.first.n5_loved",
        nextNodeId: "n7",
      },
      n5_liked: {
        nodeId: "n5_liked",
        speaker: "npc",
        localizationKey: "dlg.first.n5_liked",
        nextNodeId: "n7",
      },
      n5_disliked: {
        nodeId: "n5_disliked",
        speaker: "npc",
        localizationKey: "dlg.first.n5_disliked",
        nextNodeId: "n7",
      },
      n5_inedible: {
        nodeId: "n5_inedible",
        speaker: "npc",
        localizationKey: "dlg.first.n5_inedible",
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
    /**
     * 日常寒暄**必须**带送礼入口，否则整个送礼系统只在初见那一次成立，
     * 「每天一次」的节流也就永远碰不到——那等于把这套系统做成了一次性过场。
     * 每天回来看看、递一样东西、看它什么反应，才是这个循环的日常形态。
     */
    nodes: {
      c1: {
        nodeId: "c1",
        speaker: "npc",
        localizationKey: "dlg.casual.c1",
        choices: [
          {
            choiceId: "cc_gift",
            localizationKey: "dlg.casual.cc_gift",
            nextNodeId: "c_give",
          },
          {
            choiceId: "cc_bye",
            localizationKey: "dlg.casual.cc_bye",
            nextNodeId: "c_bye",
          },
        ],
      },
      c_give: {
        nodeId: "c_give",
        speaker: "npc",
        localizationKey: "dlg.casual.c_give",
        itemRequest: {
          onTierNodeId: {
            loved: "c_loved",
            liked: "c_liked",
            disliked: "c_disliked",
            inedible: "c_inedible",
          },
          onDeclineNodeId: "c_bye",
        },
      },
      c_loved: {
        nodeId: "c_loved",
        speaker: "npc",
        localizationKey: "dlg.casual.c_loved",
      },
      c_liked: {
        nodeId: "c_liked",
        speaker: "npc",
        localizationKey: "dlg.casual.c_liked",
      },
      c_disliked: {
        nodeId: "c_disliked",
        speaker: "npc",
        localizationKey: "dlg.casual.c_disliked",
      },
      c_inedible: {
        nodeId: "c_inedible",
        speaker: "npc",
        localizationKey: "dlg.casual.c_inedible",
      },
      c_bye: {
        nodeId: "c_bye",
        speaker: "npc",
        localizationKey: "dlg.casual.c_bye",
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
