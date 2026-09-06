/**
 * 动词表（居民系统 01，2026-09-06）：一只活物**能做的全部事**。
 *
 * 技能（`skills/`）只能用这张表里的词说"去哪、做什么"；身体（`ResidentAgent`）
 * 负责把词变成位置、朝向、计时器和动画钩子。这张表是三层之间唯一的接口，
 * 所以也是**联机复制的最小单位**：房主把 Intent 发过去，房客用同一套动词
 * 自己走（01c）。
 *
 * 词表是有限的、封口的：`walk_to` `stand` `sit` `sleep` `hide` `show` `work_at`
 * 串行，`gesture` `speak` 并行（不排队，走路时也能做）。以后的活动、节日、
 * 剧情全用组合，不再加词——加词等于改联机协议。
 *
 * 每个词都带 `state?`：身体执行这个词时对外报的活动名。它是给表现层和
 * 旧代码（`resident.state === "sleeping"`）看的，不是决策依据。
 */
import type {
  ResidentActionStep,
  ResidentActionVerb,
  ResidentFacingTarget,
  ResidentWireIntent,
} from "core";

/**
 * 动词、Intent 的**形状住在 Core**（`types/residents.ts`）：它们是联机协议的一部分
 * （`resident_intent` op 原样发 `WireIntent`）。这里只留前端才需要的东西——
 * 带回调的 `Intent`、并行槽判定、动词常量表。
 */
export type FacingTarget = ResidentFacingTarget;
export type ActionStep = ResidentActionStep;
export type ActionVerb = ResidentActionVerb;
export type WireIntent = ResidentWireIntent;

export const ACTION_VERBS: readonly ActionVerb[] = [
  "walk_to",
  "stand",
  "sit",
  "sleep",
  "hide",
  "show",
  "work_at",
  "knock",
  "gesture",
  "speak",
];

export const PARALLEL_VERBS: ReadonlySet<ActionVerb> = new Set<ActionVerb>(["gesture", "speak"]);

/**
 * 一次"想做的事"：谁下的、多重要、按顺序做哪几个动词、到了要改什么、
 * 被抢时怎么收尾。
 *
 * **回调不上网线。** `WireIntent` 是能序列化的那一半（01c 的 `resident_intent` op）。
 * 技能产出 Intent 时 `steps` 里的目标必须已经解析成坐标 / 实例 id——
 * "最近的椅子"这种描述在对端会搜出另一把椅子。
 */
export type Intent = WireIntent & {
  /**
   * 到达**最后一个** `walk_to` 时调，改世界的部分放这里（认领工地、确认
   * 食物还在）。返回 false = 目的没了，整个 Intent 作废、回去发呆。
   */
  onArrive?: (agent: IntentAgent) => boolean | void;
  /** 全部动词做完时调（吃完结算、喝完回水分） */
  onDone?: (agent: IntentAgent) => void;
  /** 被抢走 / 走不到 / 目的没了时调（释放工地）。不会和 onDone 同时调 */
  onInterrupted?: (agent: IntentAgent) => void;
};

/** 剥掉回调，剩下能上网线的那一半 */
export function toWire(intent: Intent): WireIntent {
  return {
    skillId: intent.skillId,
    priority: intent.priority,
    steps: intent.steps,
    interruptible: intent.interruptible,
    lockAfterLastWalk: intent.lockAfterLastWalk,
    idleAfter: intent.idleAfter,
  };
}

/**
 * 回调里能拿到的身体。**只有这些**——回调不该去改位置和路径，那是身体的事。
 * 用一个显式的接口而不是 `ResidentAgent` 本身，是为了让"技能不碰身体私有字段"
 * 这条规矩在类型上就成立（TS 的 private 只是编译期的礼貌）。
 */
export type IntentAgent = {
  readonly residentId: string;
  readonly definitionId: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  heading: number;
  needs: { hunger: number; thirst: number };
  mood: number;
  feed(itemId: string, tier: import("core").GiftTier): void;
};

export function isParallel(step: ActionStep): boolean {
  return PARALLEL_VERBS.has(step.verb);
}

/** 最后一个 walk_to 的下标；没有走路的 Intent 返回 -1 */
export function lastWalkIndex(steps: readonly ActionStep[]): number {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i].verb === "walk_to") return i;
  }
  return -1;
}
