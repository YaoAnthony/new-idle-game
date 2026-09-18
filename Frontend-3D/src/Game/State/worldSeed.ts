import { emit } from "../EventBus";

/**
 * 世界的初始 seed（`WorldSave.seed`）。建档那一刻定，之后不变；跟着世界走（做客用房主的）。
 *
 * 2026-09-13 审计时它"只在建档时定、运行时无人读"。2026-09-16 起随机池的抽签把它拌进种子
 * （`drawFromPool` 的 worldSeed），两个世界同一天的访客 / 委托才不一样；同一个世界重开还是那一套
 * （抽签仍然确定性，刷不出人来）。
 */

let seed = 1;

export function getWorldSeed(): number {
  return seed;
}

/** 31 位正整数，够 hashSeed 拌 */
function freshSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/**
 * 读档 / 开新档时灌。开新档（mode = new_game）抓一个新的——复位源是开机那一刻的快照，
 * 里面的 seed 是上一局的，照抄等于所有新档同一套抽签。
 */
export function restoreWorldSeed(value: number | undefined, mode: string): void {
  const next = mode === "new_game" || value === undefined || !Number.isFinite(value) ? freshSeed() : value;
  if (next === seed) return;
  seed = next;
  emit("world_changed", { reason: "seed" });
}
