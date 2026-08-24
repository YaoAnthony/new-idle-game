import type { DialogueDefinition } from "../../types/dialogue.js";

/**
 * 对话注册表。
 *
 * 2026-08-13 清空：旧的六段（搬家独白、苔灵初见/寒暄、舒舒初见/寒暄、
 * 妈妈来电，共 56 个节点）随旧剧情一起推倒。
 *
 * 重写时的几条既有约定，都还成立：
 *
 * - **对话本身不写效果**。节点只用 `emitEventId` 报告"我到了这里"，
 *   接什么后果由 storyRules 按 subject 声明。两套效果系统会打架。
 * - **送礼节点四档回应一个都不能少**（`onTierNodeId` 是 Record，
 *   编译器会逼出穷尽性）。档位由喜好表算，作者只负责写"这一档什么反应"。
 * - **收不收礼不在对话里点名**。玩家能送错是设计要求，试错是了解对方的
 *   一部分——判定在 `logic/giftRules.ts`。
 * - 宠物的对话由 `PetDefinition.dialogues` 认领（firstMeet / casual），
 *   交互层不认识具体是哪只，加宠物不用改 RoomScene。
 *
 * ⚠️ 写条件分支前先知道三处坏的（`Frontend-3D/src/Game/Systems/dialogue.ts`）：
 * `event_completed` 实际判的是"触发过"不是"完成了"；
 * `feature_unlocked` 和 `weather_is` 恒返回 false，挂它们的选项永远不显示。
 */
export const dialogueDefinitions: DialogueDefinition[] = [
  /**
   * 水獭初见（期 3 · 失窃链第三幕）。**追不追是玩家的选择**——
   * "不用管它"那一项发 theft_waived，规则 ④' 把事件直接推到 settled，
   * 于是次日的"抓回来"永远不成立：龙不会被抓、钱不回来，但生意照做。
   *
   * 对话本身零效果（既有约定）：选项只报告"我选了这个"，
   * 后果全在 storyRules 里声明。
   */
  {
    id: "otter_first_meet",
    localizationKey: "dlg.otter_first_meet",
    speakerNameKey: "pet.otter_trader",
    entryNodeId: "n1",
    nodes: {
      n1: {
        nodeId: "n1",
        speaker: "npc",
        localizationKey: "dlg.otter_first_meet.n1",
        nextNodeId: "n2",
      },
      n2: {
        nodeId: "n2",
        speaker: "npc",
        localizationKey: "dlg.otter_first_meet.n2",
        choices: [
          {
            choiceId: "help",
            localizationKey: "dlg.otter_first_meet.help",
            nextNodeId: "n3",
          },
          {
            choiceId: "waive",
            localizationKey: "dlg.otter_first_meet.waive",
            emitEventId: "theft_waived",
            nextNodeId: "n4",
          },
        ],
      },
      n3: {
        nodeId: "n3",
        speaker: "npc",
        localizationKey: "dlg.otter_first_meet.n3",
      },
      /*
       * 放弃那一支也要把"以后可以找我卖家具"说出口——解锁在 ④' 里
       * 已经发生了，玩家得从话里知道这扇门开了，不能只靠界面上多个按钮。
       */
      n4: {
        nodeId: "n4",
        speaker: "npc",
        localizationKey: "dlg.otter_first_meet.n4",
      },
    },
  },

  /**
   * 小龙被拎回来（第四幕）。它是这一幕的主角——从一个偷钱的影子
   * 变成一只委屈巴巴的幼龙。没有选项：这一幕是**看**的，不是选的。
   */
  {
    id: "dragon_caught",
    localizationKey: "dlg.dragon_caught",
    speakerNameKey: "pet.coin_dragon",
    entryNodeId: "d1",
    nodes: {
      d1: {
        nodeId: "d1",
        speaker: "npc",
        localizationKey: "dlg.dragon_caught.d1",
        nextNodeId: "d2",
      },
      d2: {
        nodeId: "d2",
        speaker: "npc",
        localizationKey: "dlg.dragon_caught.d2",
        nextNodeId: "d3",
      },
      d3: {
        nodeId: "d3",
        speaker: "npc",
        localizationKey: "dlg.dragon_caught.d3",
      },
    },
  },

  /** 第五幕：全额奉还 + 提出长期合作。生意从这句话开始 */
  {
    id: "otter_returns",
    localizationKey: "dlg.otter_returns",
    speakerNameKey: "pet.otter_trader",
    entryNodeId: "r1",
    nodes: {
      r1: {
        nodeId: "r1",
        speaker: "npc",
        localizationKey: "dlg.otter_returns.r1",
        nextNodeId: "r2",
      },
      r2: {
        nodeId: "r2",
        speaker: "npc",
        localizationKey: "dlg.otter_returns.r2",
      },
    },
  },

  /*
   * ==== 三位居民（期 4）====
   *
   * 初见都是同一个骨架：夸这块地 → 说想住下 → 图纸已经在你手上了
   * （give_item 在规则效果里，和对话同一拍发）。三位的**说话方式刻意
   * 分开**：史莱姆软乎乎话少、狐狸嘴快话密、精灵斯文有礼——
   * 没有分工的话玩家只会觉得"来了三个 NPC"，不是"来了三位邻居"。
   */
  {
    id: "slime_asks_to_stay",
    localizationKey: "dlg.slime_asks_to_stay",
    speakerNameKey: "pet.slime_neighbor",
    entryNodeId: "s1",
    nodes: {
      s1: { nodeId: "s1", speaker: "npc", localizationKey: "dlg.slime_asks_to_stay.s1", nextNodeId: "s2" },
      s2: { nodeId: "s2", speaker: "npc", localizationKey: "dlg.slime_asks_to_stay.s2", nextNodeId: "s3" },
      s3: { nodeId: "s3", speaker: "npc", localizationKey: "dlg.slime_asks_to_stay.s3" },
    },
  },
  {
    id: "slime_casual",
    localizationKey: "dlg.slime_casual",
    speakerNameKey: "pet.slime_neighbor",
    entryNodeId: "c1",
    nodes: {
      c1: { nodeId: "c1", speaker: "npc", localizationKey: "dlg.slime_casual.c1" },
    },
  },
  {
    id: "fox_asks_to_stay",
    localizationKey: "dlg.fox_asks_to_stay",
    speakerNameKey: "pet.fox_neighbor",
    entryNodeId: "f1",
    nodes: {
      f1: { nodeId: "f1", speaker: "npc", localizationKey: "dlg.fox_asks_to_stay.f1", nextNodeId: "f2" },
      f2: { nodeId: "f2", speaker: "npc", localizationKey: "dlg.fox_asks_to_stay.f2", nextNodeId: "f3" },
      f3: { nodeId: "f3", speaker: "npc", localizationKey: "dlg.fox_asks_to_stay.f3" },
    },
  },
  {
    id: "fox_casual",
    localizationKey: "dlg.fox_casual",
    speakerNameKey: "pet.fox_neighbor",
    entryNodeId: "c1",
    nodes: {
      c1: { nodeId: "c1", speaker: "npc", localizationKey: "dlg.fox_casual.c1" },
    },
  },
  {
    id: "spirit_asks_to_stay",
    localizationKey: "dlg.spirit_asks_to_stay",
    speakerNameKey: "pet.spirit_neighbor",
    entryNodeId: "p1",
    nodes: {
      p1: { nodeId: "p1", speaker: "npc", localizationKey: "dlg.spirit_asks_to_stay.p1", nextNodeId: "p2" },
      p2: { nodeId: "p2", speaker: "npc", localizationKey: "dlg.spirit_asks_to_stay.p2", nextNodeId: "p3" },
      p3: { nodeId: "p3", speaker: "npc", localizationKey: "dlg.spirit_asks_to_stay.p3" },
    },
  },
  {
    id: "spirit_casual",
    localizationKey: "dlg.spirit_casual",
    speakerNameKey: "pet.spirit_neighbor",
    entryNodeId: "c1",
    nodes: {
      c1: { nodeId: "c1", speaker: "npc", localizationKey: "dlg.spirit_casual.c1" },
    },
  },

  /**
   * 日常寒暄（交易解锁后按 F 走到的兜底——正常按 F 开的是交易面板，
   * 这段只在对话被剧情主动拉起时用得到，留一句免得空转）。
   */
  {
    id: "otter_casual",
    localizationKey: "dlg.otter_casual",
    speakerNameKey: "pet.otter_trader",
    entryNodeId: "c1",
    nodes: {
      c1: {
        nodeId: "c1",
        speaker: "npc",
        localizationKey: "dlg.otter_casual.c1",
      },
    },
  },
];

export function findDialogueDefinition(
  id: string,
): DialogueDefinition | undefined {
  return dialogueDefinitions.find((dialogue) => dialogue.id === id);
}
