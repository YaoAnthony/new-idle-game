import type { ResidentActivity } from "./residentAgent";

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
export type FacingTarget = { x: number; z: number } | number;

export type ActionStep =
  | {
      verb: "walk_to";
      x: number;
      z: number;
      /** 走路速度倍率（雨天慢一点、心情低慢一点）。缺省 1 */
      speedScale?: number;
      /** 走路期间对外报的活动名。缺省 "wander"（凑向玩家的填 "approach"） */
      state?: ResidentActivity;
    }
  | {
      verb: "stand";
      /** 站多久（秒）。缺省 2 */
      seconds?: number;
      facing?: FacingTarget;
      state?: ResidentActivity;
      /** 表现层挑动画用的口味标签（eating / drinking / browsing …），身体不解释它 */
      flavor?: string;
    }
  | {
      /**
       * 坐下（01 先只有语义，02 场所到了再接坐姿锚点）。到这一步之前
       * 调用方已经把 `walk_to` 排到了座旁；这里只是站定 + 报 "sitting"。
       */
      verb: "sit";
      facing?: FacingTarget;
      seconds?: number;
    }
  | {
      verb: "sleep";
      /** 睡多久（秒）。缺省按性情表的 napSeconds 随机 */
      seconds?: number;
    }
  | { verb: "hide" }
  | { verb: "show" }
  | {
      /**
       * 站在工地上干活。进度由 Core 按 startUtc/finishUtc 算，这一步只看
       * "到点没到"和"工地还在不在"。完工即完成；被抢走时释放工地由
       * Intent 的 `onInterrupted` 负责。
       */
      verb: "work_at";
      instanceId: string;
      /** 站定时朝哪（工地中心）。原 beginWork 转身面向工地那一下 */
      facing?: FacingTarget;
    }
  /** —— 并行槽：遇到就立刻发出，不占用串行队列 —— */
  | { verb: "gesture"; gestureId: string }
  | { verb: "speak"; localizationKey: string; seconds?: number };

export type ActionVerb = ActionStep["verb"];

export const ACTION_VERBS: readonly ActionVerb[] = [
  "walk_to",
  "stand",
  "sit",
  "sleep",
  "hide",
  "show",
  "work_at",
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
export type Intent = {
  skillId: string;
  priority: number;
  steps: ActionStep[];
  /** 能不能被更高优先级的技能抢走。指令（command）无视它 */
  interruptible: boolean;
  /**
   * 走到最后一个 `walk_to` 时翻成不可打断（吃到一半不该被叫走，
   * 但走过去的路上可以）。needs 用。
   */
  lockAfterLastWalk?: boolean;
  /** 做完之后发呆多久再问技能（秒）。缺省 1 */
  idleAfter?: number;
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

export type WireIntent = Omit<Intent, "onArrive" | "onDone" | "onInterrupted">;

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
