import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { faced, type Quad } from "../quadMesh.js";

/**
 * 化妆椽子（化粧垂木）：檐底那排露出来的木条。
 *
 * 为什么值得单独一个模块：**主屋顶和下檐要铺一模一样的椽子**，
 * 而它们的坡度、朝向、跨度全都不同——两边各抄一份，改一次样式
 * 就得改两处，而这段又恰好是最容易把符号推错的斜面数学。
 *
 * 为什么要有它：查到的原话是「垂木を見せる方が和風の色合いが
 * 強くなります」——露椽子的檐底和风浓度最高。参考图里最抓眼的
 * 也不是屋顶，是抬头看到的那片带条纹的暖木色檐底。
 *
 * 椽子做成三面（底 + 两侧）的四边形而不是 Object3D 的盒子：
 * 一圈檐下几十根，盒子就是几十个 draw call，四边形能合批成一个。
 * 看不见的顶面不建——它贴着檐里皮。
 */

/** 椽子断面：宽 × 垂下的高（格） */
const RAFTER_WIDTH = 0.16;
const RAFTER_DROP = 0.17;

type Vec3 = [number, number, number];

export type SlopeRafterParams = {
  /** 坡沿哪个轴下降。屋脊沿 x 的切妻顶 → 坡沿 z */
  axis: "x" | "z";
  /** 坡在轴的正侧还是负侧 */
  side: -1 | 1;
  /** 墙面线（沿坡轴的绝对值）——椽子从这里起 */
  innerAlong: number;
  /** 檐口（沿坡轴的绝对值）——椽子到这里止 */
  outerAlong: number;
  /** 檐口处椽子顶面的高度 */
  outerY: number;
  /** 每往内一格升多少 */
  pitch: number;
  /** 垂直于坡轴的跨度起止 */
  spanFrom: number;
  spanTo: number;
  /** 椽距 */
  spacing: number;
  /**
   * 坡轴上的原点。房子的屋顶对称在世界原点上（默认 0），
   * 但门廊那种挂在墙上某一处的小屋顶，屋脊在别的地方。
   */
  alongOrigin?: number;
};

export function slopeRafters(params: SlopeRafterParams): Quad[] {
  const {
    axis,
    side,
    innerAlong,
    outerAlong,
    outerY,
    pitch,
    spanFrom,
    spanTo,
    spacing,
    alongOrigin = 0,
  } = params;

  /** (跨度, 坡轴, 高) → 世界坐标。坡轴带原点偏移 */
  const at = (span: number, along: number, y: number): Vec3 =>
    axis === "z"
      ? [span, y, alongOrigin + along]
      : [alongOrigin + along, y, span];

  /** 跨度方向的法线（椽子两个侧面朝这儿） */
  const spanNormal = (dir: number): Vec3 =>
    axis === "z" ? [dir, 0, 0] : [0, 0, dir];

  const aOuter = side * outerAlong;
  const aInner = side * innerAlong;
  const yOuter = outerY;
  const yInner = outerY + (outerAlong - innerAlong) * pitch;

  const quads: Quad[] = [];
  let index = 0;

  for (let s = spanFrom + spacing / 2; s < spanTo; s += spacing) {
    const lo = s - RAFTER_WIDTH / 2;
    const hi = s + RAFTER_WIDTH / 2;
    const color = jitterShade(PALETTE.rafter, index, side + 1, 0.03);
    index += 1;

    // 底面（抬头看到的那一面）
    quads.push({
      corners: faced(
        [
          at(lo, aOuter, yOuter - RAFTER_DROP),
          at(hi, aOuter, yOuter - RAFTER_DROP),
          at(hi, aInner, yInner - RAFTER_DROP),
          at(lo, aInner, yInner - RAFTER_DROP),
        ],
        [0, -1, 0],
      ),
      normal: [0, -1, 0],
      color,
    });

    // 两个侧面：斜着看过去时它们才是画出"一根根"的东西
    for (const [span, dir] of [
      [lo, -1],
      [hi, 1],
    ] as const) {
      const normal = spanNormal(dir);
      quads.push({
        corners: faced(
          [
            at(span, aOuter, yOuter),
            at(span, aOuter, yOuter - RAFTER_DROP),
            at(span, aInner, yInner - RAFTER_DROP),
            at(span, aInner, yInner),
          ],
          normal,
        ),
        normal,
        color: jitterShade(PALETTE.rafter, index, 9, 0.02),
      });
    }
  }

  return quads;
}
