import { autoLifeTuning, findAutoBehavior } from "../Data/autoLife/index.js";
import type { AutoLifeSnapshot, AutoStepPlan } from "../types/autoLife.js";

/**
 * 自动生活的决策：**给一份世界快照，回答"现在该不该起身、起身去干嘛"**。
 *
 * 纯函数，不摸任何状态仓库，随机数由调用方掷好递进来（`roll`）——
 * 这两条都是为了 headless 直接测：同样的快照 + 同样的骰子 = 同样的决定。
 *
 * 优先级是写死的次序而不是权重表：吃饭 > 溜达。只有两档的时候权重表
 * 是过度设计；等表里长到四五行再改成按分数排。
 */
export function decideBreak(
  snapshot: AutoLifeSnapshot,
  roll: number,
): AutoStepPlan | null {
  const tuning = autoLifeTuning;

  // 粘性：刚回到工位不满 minWorkSeconds，谁都别想拽人起来。
  // 行为长而稳是"声音是本体"的直接推论——音景频繁切换是噪音不是白噪音
  if (snapshot.secondsSinceBreak < tuning.minWorkSeconds) return null;

  /*
   * 饿了、且家里存粮够（保险丝：少于 minEdibleCount 就饿着也不吃，
   * 自动模式不许把库存吃空——最后几份留给玩家自己决定）。
   */
  if (
    snapshot.hunger < tuning.hungerThreshold &&
    snapshot.edibleCount >= tuning.minEdibleCount
  ) {
    const behavior = findAutoBehavior("eat");
    if (behavior) return { kind: "eat", dwellSeconds: behavior.dwellSeconds };
  }

  // 低概率起身溜达。纯演出（脚步声这路白噪音的来源），没有数值效果
  if (roll < tuning.strollChance) {
    const behavior = findAutoBehavior("stroll");
    if (behavior) return { kind: "stroll", dwellSeconds: behavior.dwellSeconds };
  }

  return null;
}
