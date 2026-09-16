import type { AttentionSource } from "../../types/residents.js";

/**
 * 注视（居民系统 21）：说话的双方互相看着对方。
 *
 * 两层，和业界的 look-at 一个结构：**身体转向**（有转速；站着才转，坐着不转身——
 * 用户 2026-09-15 定，椅子上原地转圈很诡异）+ **头的偏转**（相对身体、限角；坐着也转）。
 * 数值全在这里，身体（ResidentAgent / CharacterController）和造型（各 recipe）只读不带数。
 */
export const attentionTuning = {
  /** 身体转速：一阶趋近的系数（每秒收掉 1−e^−k 的差）。和走路转向同一档，转身不该比走路慢 */
  turnRate: 10,
  /** 头最多扭多少（弧度）。≈52°——再大就是猫头鹰；目标在这个角度外，站着的人身体会跟着转 */
  headClampRad: 0.9,
  /** 头的跟随速度（同上的系数）。比身体快一点：先转头再转身才像"注意到了" */
  headRate: 8,
  /** 转到这个角度以内算转完（弧度），之后直接对齐、不再逼近 */
  settleRad: 0.01,
  /**
   * 来源的优先级，前面的赢：正在和你说话 > 正在和邻居聊 > 只是看你走近。
   * `turnsBody`：站着时身体跟不跟着转。打招呼只转头——路过的人冲你抬一下头是自然的，
   * 整个人转过来盯着你走就成了别的意思（动森的村民也是抬头看，按 A 才转身）。
   */
  sources: [
    { id: "dialogue", turnsBody: true },
    { id: "pair", turnsBody: true },
    { id: "greet", turnsBody: false },
  ] as const satisfies readonly { id: AttentionSource; turnsBody: boolean }[],
  /** 打招呼那一眼看多久（秒）：比气泡（3 秒）略长，话说完了眼神再收回来 */
  greetLookSeconds: 4,
} as const;
