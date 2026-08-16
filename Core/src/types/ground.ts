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

/**
 * 高度场：一张规则网格的标高表，格点之间双线性插值。
 *
 * 这是标高的**第三种答法**（前两种：常数、单轴线性坡）。加它的直接
 * 原因是那条河：水面原来只比院子低 0.42，而"落差"根本没进承托面——
 * 拦住人的是一个隐形矩形，桥只是架在路沿上的装饰。真要挖出河谷，
 * 岸壁就得是地形本身。
 *
 * 为什么是网格不是更多矩形平台：小镇地形图里每一块台地都是肾形的，
 * 矩形拼不出那些边界；而"缓坡""微起伏"这类词，矩形连近似都做不了。
 *
 * **陡度即障碍**：MAX_STEP_UP 0.55 配 0.5 的导航格 = 最大可走坡度约
 * 47°。所以岸壁只要比这陡，寻路和迈步就都过不去——悬崖不用声明，
 * 它是地形形状的推论。这正是"碰撞必须自动推导"那条规矩要的东西。
 *
 * 采样间距建议 1.0~1.5：0.5 的话一张 130×120 的图要 12 万面，
 * 这种画风没有 LOD 撑不住；而 1.5 的格子在 47° 上限下仍能表达
 * 2.2 米的单格落差，够陡了。
 */
export type GroundHeightfield = {
  /** heights[0] 对应的世界坐标 */
  originX: number;
  originZ: number;
  /** 格距（世界单位 = 米） */
  spacing: number;
  columns: number;
  rows: number;
  /** 行主序，长度 = columns * rows。索引 = row * columns + column */
  heights: number[];
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

  /**
   * 平面标高（世界 Y）。带 slope 或 heightfield 时只作兜底值，
   * 查询以那两个为准（同时给了以 heightfield 优先——它更具体）。
   */
  elevation: number;

  slope?: GroundSlope;

  /** 起伏地形。给了之后这个面的标高逐点采样，见 GroundHeightfield */
  heightfield?: GroundHeightfield;
};

/**
 * 一块地：闭合轮廓 + 目标标高 + 岸壁过渡宽度。地形的**作者视角**。
 *
 * 不手写高度网格是因为没人写得动，也没人读得懂——写"岬角这块地
 * 高 0，岸壁 1.5 米宽过渡到河床"是人话，一张 60×50 的数组不是。
 * 网格由 bakeHeightfield 从这些形状烤出来，地形网格和碰撞都读那一份。
 */
export type TerrainShape = {
  shapeId: string;
  /** 闭合多边形（世界坐标，首尾不用重复）。绕向随意 */
  outline: Array<readonly [number, number]>;
  elevation: number;
  /**
   * 边缘往外过渡多宽（米）。**0 = 断崖**，2 = 两米内落到底。
   * 岸壁要陡就给小值：低于约 0.9 米宽、落差 1 米以上就已经超过
   * 47° 的可走上限，自动成为障碍。
   */
  falloff: number;
};

/**
 * 一座山：峰心 + 半径 + 高度。从峰心按 smoothstep 曲线往外落到 0，
 * 多峰**取最大值**叠成山脉，再叠一层低幅噪声碎掉光滑的山肩。
 *
 * 为什么不用 TerrainShape 堆同心轮廓：山不是"平顶 + 边缘"，是从山脚
 * 到山顶每一米都不同的连续形状。硬用轮廓叠，八层出来还是梯田。
 *
 * 高度是**相对**下面已经烤好的地面的增量（山长在地上，地是几就从几
 * 起），所以山可以叠在缓丘上。峰之间取 max 而不是相加：两座山挨着时
 * 山鞍应该是"较高那座的坡"，相加会在交界处鼓出一个不存在的第三峰。
 */
export type TerrainPeak = {
  peakId: string;
  x: number;
  z: number;
  /** 影响半径（米）：山脚到峰心的水平距离 */
  radius: number;
  /** 峰顶比山脚高多少（米） */
  height: number;
  /**
   * 山肩的碎度 0~1。0 = 光滑馒头，0.3 = 有棱有肩，再高就是乱石堆。
   * 噪声是按坐标哈希的低频起伏，不入存档，同一座山每次烤出来一样。
   */
  ruggedness?: number;
};

/**
 * 一张图的地形配方。形状**按顺序叠加，后面的盖前面的**——
 * 和承托面列表"第一个命中的赢"相反，这里是绘画的顺序（后画的在上），
 * 因为作者想的是"先铺一片大地，再在上面挖河、垫台地"。
 */
export type TerrainRecipe = {
  originX: number;
  originZ: number;
  spacing: number;
  columns: number;
  rows: number;
  /** 兜底标高：所有形状都没盖到的地方。据点这里是河床 */
  base: number;
  shapes: TerrainShape[];
  /**
   * 山。**在 shapes 之后叠加**（山长在地上），所以先有台地/河谷/缓丘，
   * 再在上面起山。不填 = 没有山，老配方一字不改。
   */
  peaks?: TerrainPeak[];
};

/**
 * 一张图的全部承托面，**按优先级排好序**：查询取第一个命中的。
 * 由 buildGroundMap 从地图数据编译而来，不入存档——面是"配方的
 * 展开"，不是玩家改出来的状态。
 */
export type GroundMap = {
  surfaces: GroundSurface[];
};
