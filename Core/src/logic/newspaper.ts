import { headlinePriority, neighborKinds } from "../Data/newspaper/index.js";

/**
 * 编一期报纸。**纯函数**——给一份昨日事实，回一份定稿。
 *
 * ## 为什么在 Core
 *
 * 照 `goldJar.ts` / `shopkeeping.ts` 的先例：算法在 Core、接线在前端。
 * "头条按优先级表挑而不是 if 链""同样的事实编两次结果一样"这类判据
 * 因此都是纯函数用例，不用起浏览器、不碰存档。
 *
 * ## 一期定稿之后不再变
 *
 * 这个函数只负责**编**，存进 `WorldSave.newspaper.latest` 之后就不再调。
 * 现算的话"水獭这回想要什么"那一栏会在他走了之后凭空变空——
 * 报纸上印过的字不该自己改。
 */

export type FactsInput = {
  worldDayId: string;
  weatherId: string;
  goldIn: number;
  goldOut: number;
  actions: Array<{ name: string; minutes: number }>;
  headlines: Array<{ kind: string; subject?: string }>;
};

export type ComposeInput = {
  /** 出刊那天 */
  worldDayId: string;
  /** 报道的那天（通常是前一天）的事实。没有事实也要能出刊 */
  facts: FactsInput | null;
  /** 第几期 */
  number: number;
  /** 隔了几天没出。1 = 昨天刚出过 */
  spanDays: number;
  /** 水獭这回想要什么，定稿时抄一份 */
  wanted: string[];
};

export type Issue = {
  number: number;
  worldDayId: string;
  aboutDayId: string;
  spanDays: number;
  headline: { kind: string; subject?: string } | null;
  weatherId: string;
  neighbors: Array<{ kind: string; subject?: string }>;
  goldIn: number;
  goldOut: number;
  actions: Array<{ name: string; minutes: number }>;
  wanted: string[];
};

/**
 * 从一堆事里挑头条。
 *
 * **优先级读表，同分时取先发生的那件**（数组里靠前的）。同分取先的
 * 理由是可复现：同一份事实编两次必须一模一样，而"随便挑一个"
 * 会让玩家在存读之后看到不同的头版。
 *
 * 表里没有的 kind 算 0 分——上不了头版，但不会让整份报纸出不来。
 */
export function pickHeadline(
  headlines: readonly { kind: string; subject?: string }[],
): { kind: string; subject?: string } | null {
  let best: { kind: string; subject?: string } | null = null;
  let bestScore = -1;
  for (const item of headlines) {
    const score = headlinePriority[item.kind] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export function composeIssue(input: ComposeInput): Issue {
  const { facts } = input;
  const headlines = facts?.headlines ?? [];

  return {
    number: input.number,
    worldDayId: input.worldDayId,
    aboutDayId: facts?.worldDayId ?? input.worldDayId,
    spanDays: Math.max(1, input.spanDays),
    headline: pickHeadline(headlines),
    weatherId: facts?.weatherId ?? "sunny",
    /*
     * 邻居动态和头条**不互斥**：搬家既上头版也在这一栏里展开，
     * 报纸本来就是这么写的。
     */
    neighbors: headlines.filter((item) => neighborKinds.has(item.kind)),
    goldIn: facts?.goldIn ?? 0,
    goldOut: facts?.goldOut ?? 0,
    actions: facts?.actions ?? [],
    wanted: [...input.wanted],
  };
}
