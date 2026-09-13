import type { GameSave, PlayerSliceKey, WorldSliceKey } from "core";
import type { GameEvents, SaveApplyMode } from "../../../Game/EventBus";

/**
 * 前端注册表的形状。**每一片持久状态在这里长什么样**：怎么从运行时抓出来、
 * 怎么灌回去、哪些事件意味着它脏了。Core 那张 `WORLD_SLICE_POLICY` 说的是
 * "同不同步"，这张说的是"怎么做"——两张表都按存档键穷举，漏一片编译不过。
 *
 * 读档、序列化、自动存档触发、房主刷新触发、房客应用，全部遍历这张表，
 * 不再各自手抄一份函数清单。
 */

export type RestoreMode = SaveApplyMode;

export type SnapshotCtx = {
  /** 上一份存档。createdAtUtc / seed / houseId / name 这类"只在建档时定"的字段从它抄 */
  readonly previous: GameSave | undefined;
  /**
   * 同一次序列化里跨片共用的中间物。世界实体五键（maps / placedFurniture /
   * droppedItems / pets / doors）共用一次 `snapshotWorldEntities()`——分桶是
   * 运行时的私事，存档形状看不见它，但抓快照时得一次抓齐。
   */
  readonly memo: Map<string, unknown>;
};

export type RestoreCtx = {
  readonly mode: RestoreMode;
  /**
   * 整份存档。`replica`（房客收到刷新切片）模式下没有——只有切片本身。
   * 需要读整份存档的 restore（实体分桶、restoreNeeds 要 updatedAtUtc）
   * 只在整份读档里被调到；replica 走 `applyReplica`。
   */
  readonly save: GameSave | null;
  /** 组 owner 留给成员的中间物：`world.maps` 分桶后的当前图切片 */
  readonly bundles: Map<string, unknown>;
};

/** 需要整份存档的 restore 用它拿；replica 模式下调到就是接线错误，直接报 */
export function requireSave(ctx: RestoreCtx): GameSave {
  if (!ctx.save) {
    throw new Error(`[save-registry] ${ctx.mode} 模式下没有整份存档，这一片不该在这里被灌`);
  }
  return ctx.save;
}

/**
 * "这一片脏了"的判据：一个事件名，或者事件名 + 载荷谓词。
 * 谓词是给 `resident_changed` 这种一条事件几十种 reason 的准备的——
 * 活物说话 / 吃饭每秒好几条，都推整片刷新会把房客淹掉。
 */
export type ChangeTrigger = {
  [K in keyof GameEvents]: {
    readonly event: K;
    readonly when?: (payload: GameEvents[K]) => boolean;
  };
}[keyof GameEvents];

export type Trigger = keyof GameEvents | ChangeTrigger;

export function when<K extends keyof GameEvents>(
  event: K,
  predicate: (payload: GameEvents[K]) => boolean,
): ChangeTrigger {
  return { event, when: predicate } as ChangeTrigger;
}

export function triggerEvent(trigger: Trigger): keyof GameEvents {
  return typeof trigger === "string" ? trigger : trigger.event;
}

export function triggerMatches(trigger: Trigger, payload: unknown): boolean {
  if (typeof trigger === "string") return true;
  const predicate = trigger.when as ((p: unknown) => boolean) | undefined;
  return predicate ? predicate(payload) : true;
}

export type RestoreKey = `world.${WorldSliceKey}` | `player.${PlayerSliceKey}`;

export type LiveSlice<V> = {
  snapshot(ctx: SnapshotCtx): V;
  restore(value: V, ctx: RestoreCtx): void;
  /**
   * 房主发出去的形状；缺省 = `snapshot()`。世界实体三键（placedFurniture /
   * droppedItems / pets）用它保住"只发当前图在场的"这个既有行为；几片
   * `snapshot` 会返回 undefined 的（空信箱、空旗子）用它补成空值，
   * 否则 JSON 里键消失，房客那边就不会清掉自己的旧值。
   */
  replicate?(ctx: SnapshotCtx): V;
  /**
   * 房客收到这一片怎么灌；缺省 = `restore(value, {mode:"replica"})`。
   * 掉落物 / 活物走对账（reconcile*）而不是整体替换：正在飞的、正在走的要保住。
   */
  applyReplica?(value: V, ctx: RestoreCtx): void;
  /** 全部 restore 跑完后的收尾（清孤儿箱子这类跨片清理）。replica 不跑 */
  finalize?(ctx: RestoreCtx): void;
  /** 哪些事件意味着这一片脏了 → 自动存档 */
  readonly changedBy: readonly Trigger[];
  /** 哪些事件值得推给房客；缺省 = changedBy。活物那片两者不同 */
  readonly replicateOn?: readonly Trigger[];
  /**
   * 脏了立刻写还是防抖写。剧情节点（事件阶段推进）是 immediate：低频、重要，
   * 实测撞过"刚认完的朋友读档又要重新哄一遍"——防抖窗口内刷新页面就丢。
   */
  readonly write?: "debounced" | "immediate";
  /** 只作校验：`RESTORE_ORDER` 必须让这些键排在前面（`tests/saveRegistry.test.ts`） */
  readonly after?: readonly RestoreKey[];
};

/**
 * 死字段：类型里有、从来没人读写。序列化时**不写这个键**（和手写那版一致，
 * 键根本不存在），读档时跳过。留到阶段 6 连类型一起删。
 */
export type DeadSlice = { readonly dead: string };

export type SliceRuntime<V> = LiveSlice<V> | DeadSlice;

export function isDead(slice: object): slice is DeadSlice {
  return "dead" in slice;
}
