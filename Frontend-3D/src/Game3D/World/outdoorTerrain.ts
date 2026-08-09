import type { Object3D } from "three";

/**
 * 外景地形的接口（箱庭③）。
 *
 * OutdoorScene 拆成两半：**天气机器**（天穹、星、日月、云、雾、雨——
 * 每张图都一样，留在 OutdoorScene）和**地形**（草地、树、河、地标——
 * 每张图各不相同，住进 Maps/<id>/outdoor.ts）。在此之前 770 行的
 * OutdoorScene 把 home 的森林河流写死在类里，加第二张图只能整个抄一份。
 *
 * 地形只拿到一个挂载根和几何上下文，天气反应（风大时花瓣飘斜）通过
 * update 的 tick 参数喂进来——地形不 import 天气系统，保持纯函数构建。
 */

export type TerrainContext = {
  /** 当前图主房间的占地。外景距离从它推导（北墙 z、半宽…） */
  roomSize: { width: number; depth: number };
  /** 北墙的世界 z（负数）。惯用的"离房子多远"基准 */
  northZ: number;
};

export type TerrainTick = {
  /** 起风了（含暴风）。花瓣、草浪之类照它加剧 */
  windy: boolean;
};

export type OutdoorTerrain = {
  root: Object3D;
  /** 每帧动画（河的流光、花瓣飘落…）。没有动画的地形不用给 */
  update?(deltaSeconds: number, elapsed: number, tick: TerrainTick): void;
};

export type OutdoorTerrainBuilder = (context: TerrainContext) => OutdoorTerrain;

/** 确定性伪随机：地形每次加载长得一样。各图的 outdoor 共用 */
export function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
