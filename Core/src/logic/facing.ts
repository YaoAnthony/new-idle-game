import { Facing } from "../types/base.js";

/**
 * 连续朝向（弧度）↔ 四向 `Facing` 的换算。
 *
 * 两套朝向是**故意分开**的：
 * - `Facing` 是**逻辑朝向**，进存档、上网络，四个值就够描述"这人面朝哪"；
 * - 弧度是**表现朝向**，渲染层为了转身平滑要连续值。
 *
 * 存四向而不是存弧度，是为了对齐 `WorldPosition`（V0.2 文档里的 `Position`）：
 * 联机时各端的插值参数不可能一致，传弧度等于把表现层的实现细节塞进协议，
 * 而"面朝北"在哪台机器上都是同一件事。读档 / 收包后由 `facingToHeading`
 * 还原成弧度，转身动画自然接上。
 */

const ORDER = [Facing.North, Facing.East, Facing.South, Facing.West];

/** 弧度（从 +z 轴转向 +x）量化到最近的四向 */
export function headingToFacing(heading: number): Facing {
  // & 3 而不是 % 4：负角度取模在 JS 里会得到负数，按位与直接落回 0..3
  return ORDER[Math.round(heading / (Math.PI / 2)) & 3];
}

/** 四向还原成弧度 */
export function facingToHeading(facing: Facing): number {
  return ORDER.indexOf(facing) * (Math.PI / 2);
}
