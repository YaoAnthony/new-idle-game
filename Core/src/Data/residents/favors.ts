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
    // 13：这是他那条线的第二幕——先陪他去过井边、听他说了怕黑，才轮到灯。抽签和规则都看这一条
    requires: [{ kind: "affection_at_least", stage: "familiar_resident" }, { kind: "event_stage", eventId: "arc_slime", stageId: "afraid_of_dark" }],
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

  // ---- 13：三条个人线各自的委托。不进每天的抽签（requires 卡在只有规则才会写的阶段），由 offer_favor 提出 ----
  {
    // 咕噜第一幕：搬来第三天，请你陪他走到井边。接了他跟着你，你到井边就算
    id: "slime_walk_to_well",
    residentId: "slime_neighbor",
    kind: "escort",
    escortTo: "water",
    requires: [{ kind: "event_stage", eventId: "arc_slime", stageId: "settled" }],
    weight: 0,
    expiresDays: 5,
    offerDialogueId: "favor_slime_walk_to_well_offer",
    doneDialogueId: "favor_slime_walk_to_well_done",
    onDone: [{ kind: "add_memory", residentId: "resident-slime_neighbor", memoryId: "walked_to_well" }],
    displayKey: "favor.slime_walk_to_well",
  },
  {
    // 阿茜第二幕：把小包送到镇上的杂货铺——你第一次因此过桥；做成了小镇从此通
    id: "fox_deliver_town",
    residentId: "fox_neighbor",
    kind: "deliver",
    token: { itemId: "favor_token_fox_town_parcel" },
    toMap: "town",
    requires: [{ kind: "event_stage", eventId: "arc_fox", stageId: "wants_shortcut" }],
    weight: 0,
    expiresDays: 14,
    offerDialogueId: "favor_fox_deliver_town_offer",
    doneDialogueId: "favor_fox_deliver_town_done",
    onDone: [{ kind: "add_memory", residentId: "resident-fox_neighbor", memoryId: "delivered_to_town" }],
    displayKey: "favor.fox_deliver_town",
  },
  {
    // 薇尔第一幕：在她家旁边种点什么。她家六米内有播了种的田就算
    id: "spirit_plant_near_home",
    residentId: "spirit_neighbor",
    kind: "plant",
    plantedNear: { radius: 6 },
    requires: [{ kind: "event_stage", eventId: "arc_spirit", stageId: "asked_to_plant" }],
    weight: 0,
    expiresDays: 10,
    offerDialogueId: "favor_spirit_plant_near_home_offer",
    doneDialogueId: "favor_spirit_plant_near_home_done",
    reward: { items: [{ itemId: "baby_cabbage", quantity: 2 }] },
    onDone: [{ kind: "add_memory", residentId: "resident-spirit_neighbor", memoryId: "planted_for_spirit" }],
    displayKey: "favor.spirit_plant_near_home",
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
