import type { FavorDefinition } from "../../types/favors.js";

/**
 * 委托表（居民系统 05）。五种 kind 各一条，三位各有份。
 *
 * 前提复用对话条件（`requires`）；奖励和记忆走剧情效果；文案在前端 i18n。
 * 加一条委托 = 这里一行 + 两段对话 + 几句文案，代码不动。
 */
export const favorDefinitions = [
  {
    // 咕噜怕黑，想要一盏灯。做出来（行动开箱 / 工作台）拿给他
    id: "slime_wants_lamp",
    residentId: "slime_neighbor",
    kind: "find",
    wants: { itemId: "furniture_cloud_lamp", quantity: 1 },
    requires: [{ kind: "affection_at_least", stage: "familiar_resident" }],
    weight: 3,
    expiresDays: 7,
    cooldownDays: 30,
    offerDialogueId: "favor_slime_wants_lamp_offer",
    doneDialogueId: "favor_slime_wants_lamp_done",
    reward: { items: [{ itemId: "cheese", quantity: 2 }] },
    onDone: [{ kind: "add_memory", residentId: "resident-slime_neighbor", memoryId: "favor_slime_lamp" }],
    displayKey: "favor.slime_wants_lamp",
  },
  {
    // 阿茜托你把小包交给薇尔
    id: "fox_deliver_to_spirit",
    residentId: "fox_neighbor",
    kind: "deliver",
    token: { itemId: "favor_token_fox_parcel" },
    to: "spirit_neighbor",
    requires: [{ kind: "neighbor_present", residentId: "spirit_neighbor" }],
    weight: 2,
    expiresDays: 5,
    cooldownDays: 10,
    offerDialogueId: "favor_fox_deliver_to_spirit_offer",
    doneDialogueId: "favor_fox_deliver_to_spirit_done",
    receiveDialogueId: "favor_fox_deliver_to_spirit_receive",
    reward: { items: [{ itemId: "cooked_rice", quantity: 1 }] },
    onDone: [{ kind: "add_memory", residentId: "resident-fox_neighbor", memoryId: "favor_fox_parcel" }],
    displayKey: "favor.fox_deliver_to_spirit",
  },
  {
    // 薇尔想喝一次汤
    id: "spirit_wants_soup",
    residentId: "spirit_neighbor",
    kind: "cook",
    wants: { itemId: "baby_cabbage_soup", quantity: 1 },
    requires: [{ kind: "affection_at_least", stage: "familiar_resident" }],
    weight: 2,
    expiresDays: 7,
    cooldownDays: 20,
    offerDialogueId: "favor_spirit_wants_soup_offer",
    doneDialogueId: "favor_spirit_wants_soup_done",
    reward: { items: [{ itemId: "baby_cabbage", quantity: 3 }] },
    onDone: [{ kind: "add_memory", residentId: "resident-spirit_neighbor", memoryId: "favor_spirit_soup" }],
    displayKey: "favor.spirit_wants_soup",
  },
  {
    // 咕噜病了，要草药（水獭卖）。提出当天起不出门
    id: "slime_sick",
    residentId: "slime_neighbor",
    kind: "sick",
    wants: { itemId: "herbal_medicine", quantity: 1 },
    weight: 1,
    expiresDays: 3,
    cooldownDays: 20,
    offerDialogueId: "favor_slime_sick_offer",
    doneDialogueId: "favor_slime_sick_done",
    reward: { items: [{ itemId: "egg", quantity: 2 }] },
    onDone: [{ kind: "add_memory", residentId: "resident-slime_neighbor", memoryId: "favor_slime_sick" }],
    displayKey: "favor.slime_sick",
  },
  {
    // 薇尔请你明天下午来坐坐（08 之前是站在门口聊；08 之后进屋）
    id: "spirit_invites_you",
    residentId: "spirit_neighbor",
    kind: "visit_me",
    window: { from: "14:00", to: "17:00", dayOffset: 1 },
    requires: [{ kind: "affection_at_least", stage: "life_companion" }],
    weight: 2,
    expiresDays: 2,
    cooldownDays: 14,
    offerDialogueId: "favor_spirit_invites_you_offer",
    doneDialogueId: "favor_spirit_invites_you_done",
    reward: { items: [{ itemId: "furniture_lucky_bamboo", quantity: 1 }] },
    onDone: [{ kind: "add_memory", residentId: "resident-spirit_neighbor", memoryId: "favor_spirit_visit" }],
    displayKey: "favor.spirit_invites_you",
  },
] as const satisfies readonly FavorDefinition[];

export function findFavorDefinition(id: string): FavorDefinition | undefined {
  return (favorDefinitions as readonly FavorDefinition[]).find((entry) => entry.id === id);
}

export const favorTuning = {
  /** 每天早上最多提出几件（全体居民合计） */
  offersPerDay: 1,
  /** 一位居民同时最多挂几件 */
  activePerResident: 1,
  /** 提出的保底池：连续没提出的天数越多越可能提 */
  offerPool: { poolId: "favor_offer", base: 0.35, step: 0.15, max: 1 },
  /** 生病的委托：提出当天起病几天（过期就自愈） */
  sickDays: 3,
} as const;
