import { GroundKind, bakeHeightfield, terrainGrid, type GroundSurface } from "core";

/**
 * 据点的**地形与边界，唯一的一份**。
 *
 * 立这个文件的直接原因是用户那句"你就一个平面河流，如果你这样设计，
 * 我们为什么要建造桥"。当时的实情比那更糟：水面只比院子低 0.42（一个
 * 路沿），而那点落差**根本不在承托面里**——拦住人的是 yardBounds 那个
 * 隐形矩形，岸壁只是一圈往下拉的裙边贴图，两份数据碰巧对齐。
 *
 * 现在轮廓写在这里一次，三个消费者都读它：
 *  - **高度场**（烤出来的，通行判定问它）
 *  - **地形网格**（outdoor.ts 照同一批轮廓建）
 *  - **围墙与桥**（边界在哪、哪儿有口子）
 *
 * 视觉仍是从轮廓单独建的多边形，不是把高度场三角化——据点的地形是
 * "平台地 + 陡岸壁"，多边形顶面和高度场内部完全重合，划不来为它写
 * 一套网格化。小镇那张五个高度带、处处缓坡的图不行，那是阶段1 的事。
 */

// ---- 标高（世界 Y）------------------------------------------------------

/**
 * 床高：室内地板比院子高多少。日式住宅 40~60cm 取中，且不超过角色
 * 一步能迈的高度（MAX_STEP_UP 0.55），进出门才走得动。
 *
 * **住在这里而不是 index.ts**：地形烤出来的院子标高必须和它是同一个数。
 * 各写一份的话，"把地板整体抬高"就会变成房子升起来、院子留在原地——
 * 而"抬地板只改一个数"是当初做承托面时定下的验收标准。
 */
export const FLOOR_LEVEL = 0.45;

/** 院子地面（世界 Y）。世界原点定在室内地板上，所以院子是负的 */
export const YARD_Y = -FLOOR_LEVEL;

/**
 * 河床。比院子低 4.5 米——**这个数是"为什么要有桥"的全部答案**。
 * 原来是 0.42，那是路沿不是河。
 */
export const RIVER_BED_Y = YARD_Y - 4.5;

/** 水面。比河床高一点，低视角看得见对岸的岸壁根 */
export const WATER_LEVEL_Y = YARD_Y - 3.8;

/**
 * 岸壁的过渡宽度（米）。**1.2 不是审美是物理**：4.5 米落差配 1.2 米
 * 宽 = 坡度 3.75（约 75°），比"下坡上限"63°（MAX_STEP_DOWN 1.0 / 0.5
 * 导航格）陡得多，所以人走不下去也掉不下去——**悬崖不用声明，
 * 它是地形陡度的推论**。
 *
 * 反面样板见 check-terrain：给到 2 米就变成 63° 整，人下得去上不来，
 * 那是个单向陷阱，比平的河还糟。
 */
const BANK_FALLOFF = 1.2;

// ---- 轮廓 ---------------------------------------------------------------

/**
 * 岬角的岸线（世界坐标闭合多边形，从"脖子"北岸起顺着北岸往东绕一圈）。
 * 围墙在 x[-28,20]、z[-16,18]，岸线在墙外留 3~6 格的滩地。
 */
export const PENINSULA: Array<readonly [number, number]> = [
  [-36, -13], [-33, -19], [-24, -22.5], [-12, -24], [2, -23],
  [14, -21], [22.5, -17.5], [26, -9.5], [26.5, 1], [24.5, 10],
  [21, 18], [13, 22.5], [0, 24], [-13, 23], [-24, 20.5],
  [-31, 16], [-35, 6], [-36, -2],
];

/** 脖子：把岬角接到西面的大陆。窄窄一条，"突出来的地方"靠它成立 */
export const NECK: Array<readonly [number, number]> = [
  [-36, -13], [-36, -2], [-58, 1], [-60, -16],
];

/** 西面大陆：一整片森林地，从脖子接出去 */
export const MAINLAND: Array<readonly [number, number]> = [
  [-58, -80], [-58, 80], [-150, 80], [-150, -80],
];

/** 对岸：东（小镇那侧）、北、南三道远岸，围一圈把地平线接住 */
export const FAR_BANK_EAST: Array<readonly [number, number]> = [
  [44, -70], [46, -30], [43, 2], [47, 28], [44, 70], [150, 70], [150, -70],
];
export const FAR_BANK_NORTH: Array<readonly [number, number]> = [
  [-58, -44], [-20, -47], [16, -45], [46, -48], [150, -60], [150, -110], [-58, -110],
];
export const FAR_BANK_SOUTH: Array<readonly [number, number]> = [
  [-58, 46], [-18, 49], [18, 47], [45, 50], [150, 62], [150, 110], [-58, 110],
];

/** 陆地一览。地形网格和高度场都照这张表来，加一块地只改这里 */
export const LAND_PATCHES: Array<{
  id: string;
  outline: Array<readonly [number, number]>;
}> = [
  { id: "peninsula", outline: PENINSULA },
  { id: "neck", outline: NECK },
  { id: "mainland", outline: MAINLAND },
  { id: "far-east", outline: FAR_BANK_EAST },
  { id: "far-north", outline: FAR_BANK_NORTH },
  { id: "far-south", outline: FAR_BANK_SOUTH },
];

// ---- 围墙 ---------------------------------------------------------------

/**
 * 围墙圈住的院子。**以前这是 yardBounds 的副产品**（"看得见的墙 =
 * 走得到的边"），现在必须自己是一份数据：可走范围要放开到河岸和桥上，
 * 墙就不能再等于可走边界了，它得自己站住——所以它同时进 outdoorBlockers。
 */
export const WALL_RECT = { minX: -28, maxX: 20, minZ: -16, maxZ: 18 } as const;

export const WALL_THICKNESS = 0.45;
export const WALL_HEIGHT = 0.9;

/** 三个口子的位置。墙、门柱、桥、出入口全从这三行推 */
export const GATE_WEST_Z = -8;
export const GATE_EAST_Z = -4;
export const GATE_SOUTH_X = -14;
/** 门洞净半宽。柱子立在 ±GATE_HALF，墙从 ±(GATE_HALF+0.35) 起 */
export const GATE_HALF = 1.9;

/**
 * 围墙的实心占地。**从上面那几个常量推，不手写**——墙挪一格、门洞
 * 挪一格，挡人的地方跟着挪，不会出现"看得见的墙走得过去"。
 *
 * 带 height：0.9 的矮墙不该挡镜头（默认按 12 米算，那是给店铺定的）。
 */
export const WALL_BLOCKERS: Array<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}> = (() => {
  const t = WALL_THICKNESS;
  const { minX, maxX, minZ, maxZ } = WALL_RECT;
  const near = (gate: number) => gate - GATE_HALF - 0.35;
  const far = (gate: number) => gate + GATE_HALF + 0.35;
  const h = WALL_HEIGHT;
  return [
    // 北墙：整条，没有口子
    { minX, maxX, minZ: minZ - t, maxZ: minZ, height: h },
    // 东墙：桥头门洞分两段
    { minX: maxX, maxX: maxX + t, minZ, maxZ: near(GATE_EAST_Z), height: h },
    { minX: maxX, maxX: maxX + t, minZ: far(GATE_EAST_Z), maxZ, height: h },
    // 南墙：桥头门洞分两段
    { minX, maxX: near(GATE_SOUTH_X), minZ: maxZ, maxZ: maxZ + t, height: h },
    { minX: far(GATE_SOUTH_X), maxX, minZ: maxZ, maxZ: maxZ + t, height: h },
    // 西面木栅栏：正门门洞分两段
    { minX: minX - t, maxX: minX, minZ, maxZ: near(GATE_WEST_Z), height: h },
    { minX: minX - t, maxX: minX, minZ: far(GATE_WEST_Z), maxZ, height: h },
  ];
})();

// ---- 桥 -----------------------------------------------------------------

/** 桥面净宽（和 buildBridge 画的桥板同宽） */
export const BRIDGE_WIDTH = 2.2;

/**
 * 两座跨河桥的跨度。**桥面是声明的承托面**（GroundKind.Platform），
 * 于是"桥能走"不需要任何配套代码——这是承托面系统的兑现。
 *
 * 上一版桥面是纯布景，出入口触发带贴在**墙内**的桥头地面上，
 * "走上桥头就出发"。那时候这么做没毛病（河才 0.42 深，走上去也没意义）；
 * 河真挖下去之后就说不过去了：桥是唯一的通路，那就得真的走过去。
 */
export const BRIDGES = [
  { id: "east", axis: "x" as const, at: GATE_EAST_Z, from: WALL_RECT.maxX, to: 45 },
  { id: "south", axis: "z" as const, at: GATE_SOUTH_X, from: WALL_RECT.maxZ, to: 47 },
];

/** 桥面的承托面。声明即可走，拆掉这一行两岸立刻断开（headless 就是这么验的） */
export const BRIDGE_SURFACES: GroundSurface[] = BRIDGES.map((bridge) => {
  const half = BRIDGE_WIDTH / 2;
  const rect =
    bridge.axis === "x"
      ? { minX: bridge.from, maxX: bridge.to, minZ: bridge.at - half, maxZ: bridge.at + half }
      : { minX: bridge.at - half, maxX: bridge.at + half, minZ: bridge.from, maxZ: bridge.to };
  return {
    surfaceId: `bridge-${bridge.id}`,
    kind: GroundKind.Platform,
    roomId: "yard",
    floorIndex: 0,
    rect,
    // 和两岸齐平：桥面比岸高一截的话，走上桥要"迈"，那不叫桥
    elevation: YARD_Y,
  };
});

// ---- 高度场 -------------------------------------------------------------

/**
 * 烤出来的高度场。范围只盖**人到得了的那一片**（岬角 + 脖子一截 +
 * 两座桥 + 桥对岸的落脚点），再远的布景陆地不用进——场外采样会夹到
 * 边缘格，而那圈边缘正好就是对岸的地面，答案是对的。
 *
 * 1.0 的格距在 4.5 米落差下能表达 77° 的岸壁，够陡；再密就是白烧。
 * 这一片约 1.1 万格 × 6 个形状，启动时烤一次，几十毫秒。
 */
export const baseHeightfield = bakeHeightfield({
  ...terrainGrid({ minX: -64, maxX: 48, minZ: -50, maxZ: 52 }, 1),
  base: RIVER_BED_Y,
  shapes: LAND_PATCHES.map((patch) => ({
    shapeId: patch.id,
    outline: patch.outline,
    elevation: YARD_Y,
    falloff: BANK_FALLOFF,
  })),
});
