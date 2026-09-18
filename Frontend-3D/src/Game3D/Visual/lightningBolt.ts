/**
 * 闪电的折线（暴风雨，2026-09-18，照 Lightning-VFX 那份攻略的做法）。**纯函数**。
 *
 * 随机游走：从落点 (0, 0) 起往上走，每一步偏离竖直至多 ±45°、步长在 [SEG_MIN, SEG_MAX]
 * 之间随机，走到画布顶为止。每次劈都重新掷，没有两道一样。点是**画布本地的米**
 * （x 左右、y 向上），交给 shader 做 SDF 描边；分叉、抖动、断裂全在 shader 里，
 * 这里只管骨架。
 */

export type BoltPoint = { x: number; y: number };

/** shader 里数组的长度上限（GLSL 的 uniform 数组得是常量） */
export const MAX_BOLT_POINTS = 64;

export type WalkOptions = {
  /** 偏离竖直的最大角（弧度） */
  maxLean?: number;
  segMin?: number;
  segMax?: number;
  /** 画布的半宽（米）：走出去就往回压，别画到画布外面 */
  halfWidth?: number;
};

export function randomWalkBolt(height: number, random: () => number, options: WalkOptions = {}): BoltPoint[] {
  const maxLean = options.maxLean ?? Math.PI / 4;
  const segMin = options.segMin ?? 0.6;
  const segMax = options.segMax ?? 2.4;
  const halfWidth = options.halfWidth ?? 10;
  const points: BoltPoint[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  while (y < height && points.length < MAX_BOLT_POINTS) {
    let lean = (random() * 2 - 1) * maxLean;
    // 快出画布了就往回偏
    if (Math.abs(x) > halfWidth - 1.5) lean = -Math.sign(x) * Math.abs(lean);
    const length = segMin + random() * (segMax - segMin);
    x += Math.sin(lean) * length;
    y += Math.cos(lean) * length;
    points.push({ x, y });
  }
  return points;
}
