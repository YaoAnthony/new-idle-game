/**
 * 雨的调参表（2026-09-18，照 Peter Adams《Cheap, Beautiful Rain in Three.js》那套：
 * Points + 一张模糊竖线的贴图当"运动模糊"、以镜头为心的圆柱雨区、shader 里 mod 回收、
 * 镜头抬头时把 UV 横向压扁）。
 *
 * **临时可调**：`/rainpanel` 开一个面板现场拖数，定了再把数抄回这里。各天气档的
 * `rain.count / opacity`（weatherProfiles）是**乘在这上面**的：这里是雨滴长什么样，那里是下多大。
 */
export type RainTuning = {
  /** 粒子池上限（面板里改要重建） */
  count: number;
  /** 雨区半径（米，以镜头为心的圆柱） */
  radius: number;
  /** 雨从多高落到多低（米，相对镜头脚下） */
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

export const rainTuning: RainTuning = {
  count: 2600,
  radius: 32,
  height: 22,
  size: 0.7,
  sizeJitter: 0.4,
  streakWidth: 0.05,
  streakSoftness: 0.3,
  speedMin: 10,
  speedMax: 17,
  opacity: 0.42,
  color: "#dbe9f7",
  blending: "normal",
  uvSquashMin: 0.18,
  nearFade: 3,
  farFade: 34,
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
