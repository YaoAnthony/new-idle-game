import type { AutoBehaviorDefinition } from "../../types/autoLife.js";

/**
 * 自动生活的调平衡表。**改行为节奏只动这张表，不动 logic 里的算法。**
 *
 * 节奏的总原则（声音是本体推出来的）：**行为要长而稳**。音景频繁切换
 * 是噪音不是白噪音，所以有 `minWorkSeconds` 这道粘性——刚回到桌前
 * 不到这个时长，谁都别想再把角色拽起来。
 */
export const autoLifeTuning = {
  /**
   * 工作中每隔多久评估一次"要不要起身"。
   *
   * 20 秒不是响应速度（饿了 20 秒内一定有反应），是**演出的最小节拍**：
   * 更密的话状态一波动角色就坐立不安，画面看着像有虫子。
   */
  replanSeconds: 20,

  /** 饱食低于这个数才考虑去吃饭 */
  hungerThreshold: 40,

  /**
   * 背包里能吃的少于这个数就**饿着也不吃**。
   *
   * 自动模式动的是真库存（用户拍板），这道保险丝拦住"挂一晚上机
   * 把家吃空"——最后几份食物留给玩家自己决定怎么用。
   */
  minEdibleCount: 2,

  /**
   * 每次评估时起身溜达的概率（0~1）。
   *
   * 溜达没有任何数值效果，纯粹是"活人不会钉在椅子上"的演出，
   * 也是脚步声这路白噪音的来源。概率低是刻意的：主旋律是干活。
   */
  strollChance: 0.06,

  /** 刚回到工位之后至少坐这么久才允许下一次起身（粘性） */
  minWorkSeconds: 90,

  /** 吃完一顿之后多久不再考虑吃（哪怕还饿）——防止库存不够回饱食时抽搐 */
  eatCooldownSeconds: 300,
};

/**
 * 行为表：每步到位后停多久、进行中响什么。
 *
 * `soundscape` 全部留空——**音效素材和接线归用户**（2026-08-29 分工），
 * 位置在这儿，往里填 AudioEngine 的 profileId 就生效。
 */
export const autoBehaviors: AutoBehaviorDefinition[] = [
  {
    kind: "work",
    // work 的 dwell 没有意义（一直坐到下一次评估），置 0 只为形状统一
    dwellSeconds: 0,
    soundscape: [],
  },
  {
    kind: "eat",
    // 走到厨房后"做饭+吃"的演出时长。够长才装得下炉火声起落
    dwellSeconds: 25,
    soundscape: [],
  },
  {
    kind: "stroll",
    // 走到随机点后站一会儿再回来。溜达的主体是"走"，站定只是收尾
    dwellSeconds: 6,
    soundscape: [],
  },
];

export function findAutoBehavior(
  kind: AutoBehaviorDefinition["kind"],
): AutoBehaviorDefinition | undefined {
  return autoBehaviors.find((entry) => entry.kind === kind);
}
