/**
 * 手势登记表（2026-09-16）。
 *
 * 手势是给造型层的一次性动作名：对话节点的 `residentGesture`、表情的 `gesture`、活动 / 技能里的
 * `{ verb: "gesture", gestureId }` 都写这里的 id。物种实现了就演，没实现就不理（造型的 `playGesture`）。
 * 原来是自由字符串，拼错了不报错、也不演，靠玩发现不了；现在审计对表。
 *
 * **两类名字**
 * - **意思手势**（`yes` / `no`）：对话里表达"是 / 不是"，**只演、不写成字**（用户定：石傀儡举双手是
 *   "是的"、举一只手是"不是"，别显示到对话里）。每个物种自己决定怎么演——石傀儡用手，
 *   会点头摇头的物种映射到 nod / shake_head。写对话的人只管意思，不管身体。
 * - **动作手势**：就是那个动作本身（跺脚、伸懒腰…）。
 */
export const GESTURES = {
  // ---- 意思 ----
  /** 是的。石傀儡：双手举起、往上顿两下；水獭：点头 */
  yes: "yes",
  /** 不是。石傀儡：举起一只手；水獭 / 舒舒 / 小龙：摇头 */
  no: "no",

  // ---- 动作 ----
  stomp: "stomp",
  stretch: "stretch",
  look_away: "look_away",
  bounce: "bounce",
  hop: "hop",
  tilt: "tilt",
  nod_off: "nod_off",
  nod: "nod",
  shake_head: "shake_head",
} as const;

export type GestureId = (typeof GESTURES)[keyof typeof GESTURES];

const KNOWN = new Set<string>(Object.values(GESTURES));

export function isKnownGesture(id: string): id is GestureId {
  return KNOWN.has(id);
}
