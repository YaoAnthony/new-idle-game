import type { Intent } from "../actions";
import type { ResidentAgent } from "../residentAgent";

/**
 * 技能接口（居民系统 01）。
 *
 * 技能是"脑子的一片"：闲下来被问一句"想干什么"，答一个 Intent 或 null；
 * 玩家按 F 时被问一句"开什么"。**技能不改世界**——它只读 `ctx`，把要做的
 * 事说成动词序列，改世界的动作放进 Intent 的回调（认领工地、吃掉东西），
 * 而且调的是既有系统函数，不是自己改数组。
 *
 * 一只活物挂哪些技能写在它的子类上（`residents/*.ts` 的 `static skills`）。
 */
export type SkillContext = {
  agent: ResidentAgent;
  player: { x: number; z: number };
  /** 正在做的事。填充型技能（wander / approach / nap）看到非 null 就闭嘴 */
  current: Intent | null;
};

export type InteractOffer =
  | { kind: "trade"; merchantId: string }
  | { kind: "build_shop" }
  | { kind: "dialogue"; dialogueId: string };

export type Skill = {
  id: string;
  /**
   * 藏起来（在屋里）的时候还要不要问它。缺省不问——`hide` 之后只有明确说
   * `show` 的技能（02 的 routine 早上叫他出门）才有资格把他弄出来；
   * 不然 wander 一轮就把刚藏好的人拉出去溜达了（2026-09-06 双端验收抓到的）。
   */
  worksWhileHidden?: boolean;
  /** 被问"想干什么"。null = 现在不想。每 0.5s 一轮，闲下来立刻一轮 */
  decide?: (ctx: SkillContext) => Intent | null;
  /** 玩家按 F 时开什么。null = 这个技能不管 F */
  interact?: (ctx: SkillContext) => InteractOffer | null;
};
