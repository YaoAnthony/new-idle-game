import type { RoomId } from "./base.js";

/**
 * 承托面（GroundMap）的数据模型——"脚下踩的是什么"的唯一答案。
 *
 * 立项原因（2026-08-09，用户点破的两个症状）：
 * - "整体抬高地板"要动一堆代码——因为高度焊死在世界 Y 上，
 *   而不是"格子长在面上、面自带标高"；
 * - 每加一个可走结构（缘侧、台阶）就要往 groundHeightAt 手写一段
 *   分支——楼梯建完不会"自动有碰撞"，不是通用解法。
 *
 * 这里的模型照格子游戏的正统做法（Sims / 动森一系）：世界 = 若干个
 * **面**，每个面自带标高和覆盖范围，物体在"哪个面的哪个格"，世界 Y
 * 永远是推导值。楼梯是一块带坡度的面——声明它，就声明了它的碰撞。
 *
 * 命名躲开了 `Surface`：`logic/surfaces.ts` 里那个词已经归"家具台面"
 * （桌上摆杯子）所有，两个概念都叫 surface 迟早互相串门。
 */

export type GroundRect = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export enum GroundKind {
  /** 室内地板（房间的格子地面） */
  Floor = "floor",
  /** 缘侧：室内楼板伸到屋外的一截，与地板恒齐平 */
  Deck = "deck",
  /** 室外大地。一张图有且只有一个，当兜底 */
  Terrain = "terrain",
  /** 架空平台（楼梯顶、瞭望台这类摆出来的可走面） */
  Platform = "platform",
  /** 坡道/楼梯：标高沿一个轴线性变化的面 */
  Ramp = "ramp",
}

/**
 * 坡面：标高从 `from` 处的 `fromElevation` 线性升到 `to` 处的
 * `toElevation`。楼梯不逐级建模——0.55 的一步高（MAX_STEP_UP）意味着
 * 台阶在通行意义上就是斜坡，逐级只是视觉的事，渲染层自己切。
 */
export type GroundSlope = {
  /** 标高沿哪个世界轴变化 */
  axis: "x" | "z";
  from: number;
  to: number;
  fromElevation: number;
  toElevation: number;
};

export type GroundSurface = {
  surfaceId: string;
  kind: GroundKind;

  /**
   * 站在这个面上的东西记在哪个分区。roomIdAt 由此推导——
   * 面知道自己归谁，不用再各处手算矩形。
   */
  roomId: RoomId;

  /** 楼层序号。今天全是 0，二楼 = 多登记一批 floorIndex 1 的面 */
  floorIndex: number;

  /**
   * 覆盖范围（世界坐标，含边界）。`null` = 兜底面，接住其余所有点；
   * 一张图必须恰好有一个兜底（Terrain），否则总有地方"脚下没有答案"。
   */
  rect: GroundRect | null;

  /** 平面标高（世界 Y）。带 slope 时只作兜底值，查询以 slope 为准 */
  elevation: number;

  slope?: GroundSlope;
};

/**
 * 一张图的全部承托面，**按优先级排好序**：查询取第一个命中的。
 * 由 buildGroundMap 从地图数据编译而来，不入存档——面是"配方的
 * 展开"，不是玩家改出来的状态。
 */
export type GroundMap = {
  surfaces: GroundSurface[];
};
