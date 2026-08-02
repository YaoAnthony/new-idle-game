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

  /**
   * 舒舒的初见（2026-08-02）。和苔灵那段结构相同（分支选择 + 送礼 +
   * emitEventId 交给事件系统），但开场不一样：苔灵是造出工作台之后
   * 突然登场，舒舒是搬进来那天就已经在屋里睡着了——第一段剧情不是
   * "遇见"而是"叫不叫得醒"。
   *
   * 两轮"喂"都能选不管它退出：戳醒一只陌生的巨兽这件事不该是必须的，
   * 玩家想先去忙别的、晚点再来，对话从 s1 重新开始，什么都不会卡住。
   *
   * 送礼只有 loved / liked 两档真正"吃了"（giftConsumesItem），文案也只有
   * 这两档写的是"它眼睛一亮"；disliked / inedible 汇到 s12_mild，
   * 不建立好感、不完成初见——**这里特意没有照抄苔灵"任何档位都算认识"
   * 的哲学**：苔灵的题眼是"你递上的是它没见过的东西"，和好不好吃无关，
   * 所以四档一视同仁；舒舒这段的题眼就是"喂它吃到了爱吃的"，
   * 反应文本本身要求了这个前提（"它抢过去吃了起来"不该配一份
   * 其实没有吃的判定）。送错不会扣好感、东西也不会被吞掉，
   * 只是这次先不算数，睡一觉，下次再叫醒它重新试。
   */
  {
    id: "shushu_first_meet",
    localizationKey: "dialogue.shushu_first_meet",
    speakerNameKey: "pet.shushu.nickname",
    entryNodeId: "s1",
    nodes: {
      s1: {
        nodeId: "s1",
        speaker: "player",
        localizationKey: "dlg.shushu.s1",
        nextNodeId: "s2",
      },
      s2: {
        nodeId: "s2",
        speaker: "npc",
        localizationKey: "dlg.shushu.s2",
        choices: [
          { choiceId: "s_leave1", localizationKey: "dlg.shushu.c_leave" },
          {
            choiceId: "s_call_again",
            localizationKey: "dlg.shushu.c_call_again",
            nextNodeId: "s3",
          },
        ],
      },
      s3: {
        nodeId: "s3",
        speaker: "player",
        localizationKey: "dlg.shushu.s3",
        nextNodeId: "s4",
      },
      s4: {
        nodeId: "s4",
        speaker: "npc",
        localizationKey: "dlg.shushu.s4",
        choices: [
          { choiceId: "s_leave2", localizationKey: "dlg.shushu.c_leave" },
          {
            choiceId: "s_poke",
            localizationKey: "dlg.shushu.c_poke",
            nextNodeId: "s5",
          },
        ],
      },
      s5: {
        nodeId: "s5",
        speaker: "npc",
        localizationKey: "dlg.shushu.s5",
        nextNodeId: "s6",
        // 戳醒的那一刻：宠物运行时的睡→醒交给事件系统，节点只报告"戳到了"
        emitEventId: "shushu_wake_moment",
      },
      s6: {
        nodeId: "s6",
        speaker: "npc",
        localizationKey: "dlg.shushu.s6",
        nextNodeId: "s7",
      },
      s7: {
        nodeId: "s7",
        speaker: "player",
        localizationKey: "dlg.shushu.s7",
        nextNodeId: "s8",
      },
      s8: {
        nodeId: "s8",
        speaker: "npc",
        localizationKey: "dlg.shushu.s8",
        petGesture: "shake_head",
        nextNodeId: "s9",
      },
      s9: {
        nodeId: "s9",
        speaker: "npc",
        localizationKey: "dlg.shushu.s9",
        nextNodeId: "s10",
      },
      s10: {
        nodeId: "s10",
        speaker: "player",
        localizationKey: "dlg.shushu.s10",
        nextNodeId: "s11",
      },
      s11: {
        nodeId: "s11",
        speaker: "npc",
        localizationKey: "dlg.shushu.s11",
        itemRequest: {
          onTierNodeId: {
            loved: "s12_loved",
            liked: "s12_liked",
            disliked: "s12_mild",
            inedible: "s12_mild",
          },
          onDeclineNodeId: "s_bye",
        },
      },
      s12_loved: {
        nodeId: "s12_loved",
        speaker: "player",
        localizationKey: "dlg.shushu.s12_loved",
        nextNodeId: "s13_loved",
      },
      s13_loved: {
        nodeId: "s13_loved",
        speaker: "npc",
        localizationKey: "dlg.shushu.s13_loved",
        nextNodeId: "s14_loved",
      },
      s14_loved: {
        nodeId: "s14_loved",
        speaker: "player",
        localizationKey: "dlg.shushu.s14_loved",
        nextNodeId: "s15_bond",
      },
      s12_liked: {
        nodeId: "s12_liked",
        speaker: "player",
        localizationKey: "dlg.shushu.s12_liked",
        nextNodeId: "s13_liked",
      },
      s13_liked: {
        nodeId: "s13_liked",
        speaker: "npc",
        localizationKey: "dlg.shushu.s13_liked",
        nextNodeId: "s15_bond",
      },
      s15_bond: {
        nodeId: "s15_bond",
        speaker: "npc",
        localizationKey: "dlg.shushu.s15_bond",
        nextNodeId: "s16_bond",
      },
      s16_bond: {
        nodeId: "s16_bond",
        speaker: "npc",
        localizationKey: "dlg.shushu.s16_bond",
        nextNodeId: "s17_bond",
      },
      s17_bond: {
        nodeId: "s17_bond",
        speaker: "player",
        localizationKey: "dlg.shushu.s17_bond",
        // 认作朋友 + 好感度 + 哄睡，三件事都挂在"它说着说着又睡着了"这句上
        emitEventId: "shushu_gift_received",
      },
      s12_mild: {
        nodeId: "s12_mild",
        speaker: "player",
        localizationKey: "dlg.shushu.s12_mild",
        nextNodeId: "s13_mild",
      },
      s13_mild: {
        nodeId: "s13_mild",
        speaker: "npc",
        localizationKey: "dlg.shushu.s13_mild",
        nextNodeId: "s14_mild",
      },
      s14_mild: {
        nodeId: "s14_mild",
        speaker: "player",
        localizationKey: "dlg.shushu.s14_mild",
        emitEventId: "shushu_gift_declined",
      },
      s_bye: {
        nodeId: "s_bye",
        speaker: "npc",
        localizationKey: "dlg.shushu.s_bye",
        emitEventId: "shushu_gift_declined",
      },
    },
  },

  /**
   * 舒舒的日常寒暄。结构照抄 moss_wisp_casual——每天回来看看、
   * 递一样东西、看它什么反应，是送礼系统的日常形态，不是一次性过场。
   */
  {
    id: "shushu_casual",
    localizationKey: "dialogue.shushu_casual",
    speakerNameKey: "pet.shushu.nickname",
    entryNodeId: "sc1",
    nodes: {
      sc1: {
        nodeId: "sc1",
        speaker: "npc",
        localizationKey: "dlg.shushu_casual.sc1",
        choices: [
          {
            choiceId: "sc_gift",
            localizationKey: "dlg.shushu_casual.sc_gift",
            nextNodeId: "sc_give",
          },
          {
            choiceId: "sc_bye",
            localizationKey: "dlg.shushu_casual.sc_bye",
            nextNodeId: "sc_end",
          },
        ],
      },
      sc_give: {
        nodeId: "sc_give",
        speaker: "npc",
        localizationKey: "dlg.shushu_casual.sc_give",
        itemRequest: {
          onTierNodeId: {
            loved: "sc_loved",
            liked: "sc_liked",
            disliked: "sc_disliked",
            inedible: "sc_inedible",
          },
          onDeclineNodeId: "sc_end",
        },
      },
      sc_loved: {
        nodeId: "sc_loved",
        speaker: "npc",
        localizationKey: "dlg.shushu_casual.sc_loved",
      },
      sc_liked: {
        nodeId: "sc_liked",
        speaker: "npc",
        localizationKey: "dlg.shushu_casual.sc_liked",
      },
      sc_disliked: {
        nodeId: "sc_disliked",
        speaker: "npc",
        localizationKey: "dlg.shushu_casual.sc_disliked",
      },
      sc_inedible: {
        nodeId: "sc_inedible",
        speaker: "npc",
        localizationKey: "dlg.shushu_casual.sc_inedible",
      },
      sc_end: {
        nodeId: "sc_end",
        speaker: "npc",
        localizationKey: "dlg.shushu_casual.sc_end",
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
