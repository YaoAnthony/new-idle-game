import type { EventDefinition } from "../../types/events.js";

/**
 * 事件注册表。事件推进只由玩家实际完成交互触发（V0.2：现实时间只是
 * 触发条件之一，不能代替事件状态）。
 *
 * **每个被 storyRules 写进存档的 eventId 都要在这里有一条。**
 * 少登记的后果是"事件记录"那一屏显示不出名字——`logic/storyAudit` 会
 * 拦住这种情况（它校验 storyRules 引用的 eventId 都能查到）。
 *
 * ⚠️ 但 audit **不查这里每条自己的 localizationKey**。上一版六个事件里
 * 有 16 个文案键从来没写过，而审计和 i18n 测试全是绿的——重写时要么把
 * 文案一起补上，要么先把 audit 那段补掉。
 *
 * 2026-08-13 清空：旧的 moving_in / pet_arrival / mom_first_call /
 * pet_missing / mom_gift / shushu_bond 跟着旧剧情一起推倒。
 */
export const eventDefinitions: EventDefinition[] = [
  /**
   * 金库失窃（期 3 · 小动物经济圈）。**剧情引擎推倒重写后的第一条链**，
   * 五幕一天一步：落成 / 失窃 / 上门 / 见贼 / 了结。
   *
   * 阶段是**门闩**不是演出：每一幕的规则都用 requiresEventStage 卡在
   * 上一幕的阶段上，day_started 一天只发一次（期 0 定的），所以这条链
   * 天然一天推一步，离线七天回来也只走一步——剧情不在你不在的时候自己演完。
   */
  {
    id: "gold_theft",
    localizationKey: "event.gold_theft",
    stages: [
      // 金库建成，被盯上了。玩家看不到这一幕，它只是次日偷窃的门闩
      { stageId: "eyed", localizationKey: "event.gold_theft.eyed" },
      // 钱被偷了，水獭还没来
      { stageId: "robbed", localizationKey: "event.gold_theft.robbed" },
      // 水獭上门，答应去追（或者玩家说不用管——那就直接跳 settled）
      { stageId: "chasing", localizationKey: "event.gold_theft.chasing" },
      /*
       * 小龙被抓回来了（用户 2026-08-24 加的一幕）。单独一个阶段而不是
       * 并进 settled：这一幕的内容是**你见到了那条龙**——它从一个影子
       * 变成有脸会说话的角色。追赃和见贼是两件事，合成一步的话
       * 前者会把后者盖掉，玩家读到的只剩"钱回来了"。
       */
      { stageId: "caught", localizationKey: "event.gold_theft.caught" },
      // 结了：钱奉还、水獭提出长期合作（或者玩家放弃了追讨）
      { stageId: "settled", localizationKey: "event.gold_theft.settled" },
    ],
  },
];

export function findEventDefinition(id: string): EventDefinition | undefined {
  return eventDefinitions.find((event) => event.id === id);
}
