import { emit } from "../EventBus";

/**
 * 调试模式的开关（F3）。**只是一个布尔 + 一个事件 + 一个探针**，故意不多。
 *
 * 用户要的第一版就一句话："左边 sidebar 多出来显示 XYZ，先这样就行，
 * 后面再调整"。所以这里不设计"调试面板系统"，不预留一堆分类；只把
 * 开关本身放对地方——住在 State 层，UI 订阅事件——以后加什么都从这个
 * 布尔长，而不是每个调试玩意各自记一个 useState。
 *
 * 不进存档、不进设置：调试模式是**这一次会话**的事，刷新就关。
 * 存进设置的话测试员忘关会一直开着，反过来玩家误按也不该被记住。
 */
let enabled = false;

export function isDebugMode(): boolean {
  return enabled;
}

export function setDebugMode(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  emit("debug_mode_changed", { enabled });
}

export function toggleDebugMode(): boolean {
  setDebugMode(!enabled);
  return enabled;
}

/**
 * 调试探针：面板每次刷新问一次"现在的数"。
 *
 * 由 RoomScene 在构造时挂上、dispose 时摘掉（和 autoWalk 的 setAutoWalker
 * 一个模式）——面板不持有场景引用，场景换图重建时不会攥着一具死的。
 * 返回 null = 场景还没就绪，面板显示"—"。
 */
export type DebugProbe = () => {
  x: number;
  y: number;
  z: number;
  /** 脚下承托面（世界 Y），和 y 分开看得出"在跳/在台阶上" */
  groundY: number;
  mapId: string;
} | null;

let probe: DebugProbe | null = null;

export function setDebugProbe(next: DebugProbe | null): void {
  probe = next;
}

export function readDebugProbe(): ReturnType<DebugProbe> {
  return probe?.() ?? null;
}
