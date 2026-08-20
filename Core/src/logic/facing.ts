import { Facing } from "../types/base.js";

/**
 * 连续朝向（弧度）↔ 四向 `Facing` 的换算。
 *
 * **这两个函数不再出现在存档路径上**（save v19）。原来的分工是
 * "四向进存档、弧度只给渲染"，`WorldPosition` 因此存 `Facing`——
 * 现在身体的朝向直接存弧度，理由写在 `WorldPosition` 的注释里。
 *
 * 留着是因为**离散朝向仍然是真问题**，只是问的人变了：
 * - `headingToFacing`：占用图、寻路、"人面朝哪面墙"这类按格子问的判定；
 * - `facingToHeading`：家具的 `Facing` 转成渲染用的 y 轴旋转。
 *
 * 换句话说，它们从"存档的编解码器"退回成了"网格世界的取整函数"。
 * 别再拿它们做持久化——量化是有损的，损在存档里就找不回来了。
 */

const ORDER = [Facing.North, Facing.East, Facing.South, Facing.West];

/** 朝向 → 四分之一圈数（North=0 顺时针数）。离散旋转的唯一编码 */
export const FACING_TURNS: Record<Facing, number> = {
  [Facing.North]: 0,
  [Facing.East]: 1,
  [Facing.South]: 2,
  [Facing.West]: 3,
};

/**
 * 平面向量按四分之一圈旋转（本地 → 世界）。**全项目唯一的一份查表**——
 * 家具锚点（logic/anchors）、房屋锚点（logic/roomAnchor）都转它。
 * 和表现层 FACING_ROTATION（North=0、East=-π/2…）逐项等价，
 * 用查表而不是三角函数：四向旋转没有理由引入浮点误差。
 */
export function rotateQuarter(
  turns: number,
  x: number,
  z: number,
): { x: number; z: number } {
  switch (turns & 3) {
    case 0:
      return { x, z };
    case 1:
      return { x: -z, z: x };
    case 2:
      return { x: -x, z: -z };
    default:
      return { x: z, z: -x };
  }
}

/** 弧度（从 +z 轴转向 +x）量化到最近的四向 */
export function headingToFacing(heading: number): Facing {
  // & 3 而不是 % 4：负角度取模在 JS 里会得到负数，按位与直接落回 0..3
  return ORDER[Math.round(heading / (Math.PI / 2)) & 3];
}

/** 四向还原成弧度 */
export function facingToHeading(facing: Facing): number {
  return ORDER.indexOf(facing) * (Math.PI / 2);
}
