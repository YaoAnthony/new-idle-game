/**
 * 雨的调参表（2026-09-18，照 Peter Adams《Cheap, Beautiful Rain in Three.js》那套：
 * Points + 一张模糊竖线的贴图当"运动模糊"、以镜头为心的圆柱雨区、shader 里 mod 回收、
 * 镜头抬头时把 UV 横向压扁）。
 *
 * **临时可调**：`/rainpanel` 开一个面板现场拖数，定了再把数抄回这里。各天气档的
 * `rain.density / opacity`（weatherProfiles）是**乘在这上面**的：这里是雨滴长什么样，那里是下多大。
 */
export type RainTuning = {
  /** 粒子池上限（面板里改要重建） */
  count: number;
  /** 雨区半径（米，以镜头为心的圆柱） */
  radius: number;
  /** 雨从多高落到多低（米，相对雨区中心） */
  height: number;
  /** 雨滴的世界高度（米）：越大越长 */
  size: number;
  /** 大小的随机幅度（0..1）：0.5 = 一半到一倍半 */
  sizeJitter: number;
  /** 贴图里那条线占宽度的比例：越小越细 */
  streakWidth: number;
  /** 贴图的模糊（0..1）：越大越糊 */
  streakSoftness: number;
  speedMin: number;
  speedMax: number;
  opacity: number;
  color: string;
  blending: "additive" | "normal";
  /** 抬头看时 UV 横向最多压到几分之几（1 = 不压） */
  uvSquashMin: number;
  /** 离镜头多近开始淡（米）；太近的雨滴一个像素大一片糊 */
  nearFade: number;
  /** 多远之外淡没（米） */
  farFade: number;
  /** 风：每秒横漂多少米（乘天气档的 windSlant） */
  windDrift: number;
  /** 风：雨丝倾斜多少度（乘 windSlant） */
  slantDeg: number;
};

/**
 * 2026-09-18 用户在 /rainpanel 里拖出来的一版。
 *
 * `color` 在面板里一度调成了 #148aff（蓝）——蓝雨是"雨天"这个概念的
 * 图标画法，真雨丝没有颜色：看到的是天光在水柱上的高光，所以雨永远
 * 比背景亮、偏白。压暗天穹（weatherProfiles 的 sky）之后蓝更不对了，
 * 一片深灰天上挂着一层蓝纱。改回白，靠 opacity 控制存在感。
 */
export const rainTuning: RainTuning = {
  count: 700,
  radius: 29,
  height: 20,
  size: 0.4,
  sizeJitter: 0.4,
  streakWidth: 0.05,
  streakSoftness: 0.25,
  speedMin: 8.5,
  speedMax: 17,
  opacity: 0.42,
  color: "#ffffff",
  blending: "normal",
  uvSquashMin: 0.18,
  nearFade: 3,
  farFade: 39,
  windDrift: 4,
  slantDeg: 18,
};

/** 面板 / 指令改完后喂回运行时的雨（RainField 订阅） */
type Listener = (tuning: RainTuning, rebuild: boolean) => void;
const listeners = new Set<Listener>();
export function onRainTuning(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function setRainTuning(patch: Partial<RainTuning>): void {
  const rebuild = ["count", "radius", "height", "sizeJitter", "speedMin", "speedMax"].some(
    (key) => key in patch && patch[key as keyof RainTuning] !== rainTuning[key as keyof RainTuning],
  );
  Object.assign(rainTuning, patch);
  for (const listener of listeners) listener(rainTuning, rebuild);
}

// ---- 积水（2026-09-18，照那条 2D 雨天 dev log 的做法搬进 3D）----

export type PuddleTuning = {
  /** 噪波的世界尺度（每米几个噪波单位）：越小水坑越大块 */
  scale: number;
  /** 全干时的阈值（噪波 0..1，超过才是水）；1 = 没有水坑 */
  thresholdDry: number;
  /** 全湿时的阈值：越低水坑越多 */
  thresholdWet: number;
  /** 边缘那层移动噪波的幅度：水坑边缘晃 */
  edgeNoise: number;
  /** 倒影占多少（0 = 只有深色水面） */
  reflect: number;
  /** 倒影的噪波扰动 */
  distort: number;
  /** 湿地整体的深色罩子（水坑之外那层"地湿了"） */
  tint: number;
  /** 雨打出来的波纹：每秒几个（乘雨的密度） */
  rippleRate: number;
  /** 一圈波纹活多久（秒） */
  rippleLife: number;
  /** 下雨多少秒积满 */
  fillSeconds: number;
  /** 雨停多少秒干透 */
  drySeconds: number;
};

export const puddleTuning: PuddleTuning = {
  scale: 0.09,
  thresholdDry: 1,
  thresholdWet: 0.56,
  edgeNoise: 0.04,
  reflect: 0.75,
  distort: 0.012,
  tint: 0.35,
  rippleRate: 60,
  rippleLife: 1.1,
  fillSeconds: 25,
  drySeconds: 150,
};

type PuddleListener = (tuning: PuddleTuning) => void;
const puddleListeners = new Set<PuddleListener>();
export function onPuddleTuning(listener: PuddleListener): () => void {
  puddleListeners.add(listener);
  return () => puddleListeners.delete(listener);
}
export function setPuddleTuning(patch: Partial<PuddleTuning>): void {
  Object.assign(puddleTuning, patch);
  for (const listener of puddleListeners) listener(puddleTuning);
}
