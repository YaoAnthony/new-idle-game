import { GroundKind, bakeHeightfield, terrainGrid, type GroundSurface } from "core";

/**
 * 据点的**地形与边界，唯一的一份**。
 *
 * 第二版（2026-08-16，用户点破"我们不是周围一圈的湖水"）：上一版把
 * 据点做成了方水塘中间的一个岛——那不是河，是护城河。这版照小镇地形
 * 标高图重做水系：**河从北边进来，沿东侧南流，绕过据点南边往西出去**。
 * 据点因此是"河畔台地"（图上写的就是这个词），北面、西面和大陆森林
 * 连成一块，只有东、南两面临水——两座桥各跨一段，出口还是两个。
 *
 * 高度分四级（对应标高图 河0 / 下层4 / 台地7 的比例，1格=1米）：
 *   台地（院子）YARD_Y → 下层滩台 SHELF_Y → 水面 → 河床 RIVER_BED_Y，
 *   外加北面森林一道缓丘。台地到滩台、滩台到河床都是站不住的陡坎
 *   （MAX_WALKABLE_SLOPE 拦的），桥是唯一的过河方式——这条有泛洪断言。
 *
 * 轮廓写在这里一次，四个消费者都读它：高度场（通行）、地形网格
 * （outdoor.ts 三角化同一个场——**看得见的地第一次就是走得到的地**）、
 * 围墙、桥。
 */

// ---- 标高（世界 Y）------------------------------------------------------

/**
 * 床高：室内地板比院子高多少。日式住宅 40~60cm 取中，且不超过角色
 * 一步能迈的高度（MAX_STEP_UP 0.55），进出门才走得动。
 *
 * **住在这里而不是 index.ts**：地形烤出来的院子标高必须和它是同一个数。
 * 各写一份的话，"把地板整体抬高"就会变成房子升起来、院子留在原地。
 */
export const FLOOR_LEVEL = 0.45;

/** 院子地面（世界 Y）。世界原点定在室内地板上，所以院子是负的 */
export const YARD_Y = -FLOOR_LEVEL;

/** 河床。比院子低 4.5 米——"为什么要有桥"的全部答案 */
export const RIVER_BED_Y = YARD_Y - 4.5;

/** 水面。比河床高一点，低视角看得见对岸的岸壁根 */
export const WATER_LEVEL_Y = YARD_Y - 3.8;

/**
 * 下层滩台：台地和水面之间的一级窄台（标高图上"石桥与下层路径 Y=4"
 * 那一级按比例的对应物）。今天纯布景——上下都是站不住的陡坎，
 * 以后要做"下到河边"的台阶时，从台地接一段坡道下来就能走。
 */
export const SHELF_Y = YARD_Y - 1.95;

/**
 * 岸壁的过渡宽度（米）。1.2 配台地→河床 4.5 的落差 = 约 75°，比
 * "站得住"的 45°（MAX_WALKABLE_SLOPE）陡得多——**悬崖不用声明，
 * 它是地形陡度的推论**。台地→滩台 1.55 的落差同理站不住。
 */
const BANK_FALLOFF = 1.2;

// ---- 河道与岸线 ---------------------------------------------------------

/*
 * 河道走向（都是世界坐标）：北端从 x≈26..42 进来，沿东侧南流，
 * 在 z≈20 一带拐弯向西，从西边 z≈30..43 出去。宽 12~16，弯是手画的
 * ——每个点都抖过，直线河道一眼就是程序画的。
 */

/**
 * 河的**内岸**（据点这一侧），从北到南再到西。这条线同时是：
 * 西岸大陆的东/南边界、岸沫和岸石的挂点。
 */
export const RIVER_INNER_SHORE: Array<readonly [number, number]> = [
  [26, -60], [27.5, -52], [25.5, -45], [26.5, -38], [24.5, -31],
  [25.5, -24], [24, -17], [25, -10], [26, -4], [27, 2],
  [26.5, 8], [25, 13], [22.5, 18], [19, 22], [14, 25],
  [8, 27], [0, 28.5], [-6, 27], [-10, 22.5], [-14, 21.5], [-18, 22.5], [-22, 27],
  [-32, 29], [-40, 30], [-48, 29.5], [-56, 30], [-64, 29.5], [-70, 30],
];

/** 内岸靠近院墙的一段（岸沫/岸石只撒在这段——远处的岸雾里看不见） */
export const ESTATE_SHORE: Array<readonly [number, number]> =
  RIVER_INNER_SHORE.slice(5, 21);

/** 河的**外岸**（小镇那一侧），同样从北绕到西南 */
export const RIVER_OUTER_SHORE: Array<readonly [number, number]> = [
  [42, -60], [40.5, -52], [42.5, -45], [41, -38], [42, -31],
  [40.5, -24], [41.5, -17], [40, -10], [41, -4], [42, 2],
  [41, 8], [39.5, 14], [37, 20], [33, 26], [27, 31],
  [19, 35], [10, 37.5], [0, 38.5], [-10, 39.5], [-20, 40.5],
  [-30, 41], [-40, 42], [-50, 41.5], [-60, 42], [-70, 42.5],
];

/**
 * 西岸大陆：据点台地 + 北面 + 西面森林，**一整块**。上一版这里是
 * 岬角+脖子+大陆三块拼的（岛的残留），现在据点就长在大陆上。
 */
export const WEST_LAND: Array<readonly [number, number]> = [
  [-170, -160],
  [26, -160],
  ...RIVER_INNER_SHORE,
  [-170, 30],
];

/**
 * 外岸：东岸和南岸是同一块地——L 形河湾的外侧本来就是连续的。
 * 小镇的屋影、对岸林线都站在它上面。
 */
export const OUTER_BANK: Array<readonly [number, number]> = [
  ...RIVER_OUTER_SHORE,
  [-70, 110],
  [150, 110],
  [150, -60],
];

/**
 * 北面森林缓丘：+1.1 米、10 米过渡（坡度 0.11，走得动的缓坡）。
 * 台地不该到墙外就变成一张平纸——"地形做的复杂一些"最便宜的一笔。
 * 东边缘刻意离河道 12 米以上：缓丘的过渡圈要是伸进河道，会把河床
 * 顶出水面（烤的时候按距离衰减，不认"这里是河"）。
 */
const NORTH_RISE: Array<readonly [number, number]> = [
  [-60, -70], [12, -70], [10, -42], [0, -34], [-14, -32], [-34, -34], [-52, -40],
];

// ---- 山 -----------------------------------------------------------------

/**
 * 据点背后的山脉（用户定的：家这一套后面应该是各种大山，不是平的）。
 *
 * **起在北面和西北面**：屋子背后那一片，从缓丘 +1.1 起、隔一段林子
 * 抬到 +25~30。东面不起——那边要看得见小镇的天际线；南面低——
 * 河从那儿出去。三座主峰错开成一道弧，两座矮的填山鞍，再两座远峰在
 * 雾边把天际线接住。
 *
 * 山脚离院墙最近约 30 米（−28,−16 到 −60,−70），中间那段林子是刻意
 * 留的：山贴着墙就起是"背靠山崖"的压迫感，隔一段是"林深处有山"，
 * 这张图要的是后者。要改成前者只用把 z 往 -40 挪。
 *
 * 站不上去是自动的：25 米落差摊在 45 米半径上，中段坡度远超 45°，
 * isStandable 会拦。山脚那圈缓坡能走上去几步——那正是"能进林子"的
 * 感觉，不用画禁行线。
 */
const PEAKS = [
  // 主峰往后退了一截（第一版 z=-78 时山脚 z=-55 就 +15 了，林子被吃光）：
  // 现在山脚落在 z≈-62，从北墙 -16 到山脚有 45 米林子
  { peakId: "north-main", x: -30, z: -100, radius: 40, height: 26, ruggedness: 0.28 },
  { peakId: "northwest-main", x: -96, z: -70, radius: 42, height: 28, ruggedness: 0.3 },
  { peakId: "west-main", x: -126, z: -12, radius: 40, height: 24, ruggedness: 0.26 },
  // 山鞍：把三座主峰连成一道，别是三个孤立的馒头
  { peakId: "saddle-nw", x: -66, z: -88, radius: 34, height: 17, ruggedness: 0.22 },
  { peakId: "saddle-w", x: -116, z: -42, radius: 32, height: 16, ruggedness: 0.22 },
  // 远峰：雾边的天际线
  { peakId: "far-north", x: 10, z: -130, radius: 50, height: 30, ruggedness: 0.32 },
  { peakId: "far-west", x: -150, z: 28, radius: 46, height: 26, ruggedness: 0.3 },
];

/** 东墙外的下层滩台（桥从头顶跨过去），略探进河里当石岸 */
const EAST_SHELF: Array<readonly [number, number]> = [
  [22, -20], [25, -19], [26, -4], [26.5, 6], [25, 15], [22, 16],
];

/** 南墙外、南桥两侧的滩台 */
/**
 * 南桥桥头下的滩台。内岸在南桥这一段**收到 z≈21.5**（第一版是 29.5，
 * 桥的前 11 米铺在草地上——站在桥上看，桥板和草地齐平，"桥"从几米外
 * 才开始，用户在桥上一眼看出来）。收进来之后桥出了门洞就跨在峡谷上，
 * 滩台是岸壁上的一级石台，桥墩从它旁边扎下去。
 */
const SOUTH_SHELF: Array<readonly [number, number]> = [
  [-19, 18.5], [-9, 18.5], [-8, 21], [-14, 22.5], [-20, 21],
];

/**
 * 南墙**塌掉的那一段**（沿 x 的范围）：就是滩台顶着墙脚的那一截——
 * 岸滑进了滩台，墙脚下是空的。用户拍板（2026-08-19）不填地形，把它做成
 * 坏掉的样子："未来可能能修，现在肯定修不了"。墙体残段、基础石、碎石
 * 见 outdoor.ts 的 ruinRun；挡人的 WALL_BLOCKERS 不变。
 * 范围和 SOUTH_SHELF 的 x 跨度同源（比它各收 1 米，落在滩台顶上）。
 */
export const SOUTH_RUIN = { minX: -18, maxX: -8 };

// ---- 围墙 ---------------------------------------------------------------

/**
 * 围墙圈住的院子。可走范围放开到河对岸之后墙必须自己站住——
 * 它同时进 outdoorBlockers 真的挡人。墙内 48×34 = 1632 m²，
 * 去掉房子 1152 m²，可自由建设约 866 m²（2026-08-16 量的账）。
 */
/**
 * 北墙从 −16 推到 −22（2026-08-18，用户："森林这一边的庭院区域往外扩
 * 一点，樱花树就可以远一点点"）。原来北院只有 6 米（房子北墙 −10 到
 * 栅栏 −16），樱花树、后庭花坛、晾衣绳全挤在这一条里，樱花树离落地窗
 * 只有 4.2 米——树冠贴着玻璃。12 米之后樱花退到 7 米，冠在窗框里
 * 是"院子里有棵树"，不是"树压在窗上"。墙内 48×40 = 1920 m²。
 */
export const WALL_RECT = { minX: -28, maxX: 20, minZ: -22, maxZ: 18 } as const;

export const WALL_THICKNESS = 0.45;
export const WALL_HEIGHT = 0.9;

/**
 * 两个口子的位置。墙、门柱、桥、出入口全从这两行推。
 *
 * **西门没有了**（2026-08-18，用户定："靠近菜园的这个向外的出口删了"）。
 * 它本来是正门（对齐玄关轴线），但西面是森林不通任何地方，留着就是
 * 一个"看着能走、走出去什么也没有"的口子。据点的出口就是两座桥。
 * 玄关外的石板通道照旧铺到栅栏为止——那是"门廊前的一段路"，
 * 不是"通向外面的路"。
 */
export const GATE_EAST_Z = -4;
export const GATE_SOUTH_X = -14;
/** 门洞净半宽。柱子立在 ±GATE_HALF，墙从 ±(GATE_HALF+0.35) 起 */
export const GATE_HALF = 1.9;

/**
 * 围墙的实心占地。**从上面那几个常量推，不手写**。
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
    // 西面木栅栏：整条，没有口子（西门 2026-08-18 退役）
    { minX: minX - t, maxX: minX, minZ, maxZ, height: h },
  ];
})();

// ---- 桥 -----------------------------------------------------------------

/** 桥面净宽（和 buildBridge 画的桥板同宽） */
export const BRIDGE_WIDTH = 2.2;

/**
 * 跨河桥。**桥面是声明的承托面**，拆掉这行两岸当场断开（headless 泛洪验的）。
 *
 * **只剩东桥**（2026-08-22 用户定）。南桥原来在南墙门洞外跨南段河湾、
 * 落在镇子南边——删掉它有一个顺带的好处：**去小镇现在只有东桥一条路**，
 * 而东桥桥头在 D2 的边线上，要开两块地才走得到。南桥桥头在 B3 的边上，
 * 开一块就够——留着它，期 1 的 T5「扩充两次才看得到桥」其实是可以
 * 一步绕过去的。
 *
 * 这个数组仍然是数组不是单个常量：外景建造、承托面、出入口触发带三处
 * 都从它推，将来再加桥是加一条数据不是改三处代码。
 */
export const BRIDGES = [
  { id: "east", axis: "x" as const, at: GATE_EAST_Z, from: WALL_RECT.maxX, to: 45 },
];

/** 桥面的承托面。声明即可走 */
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
    // 桥的外观由 buildBridge 画（桥板/护栏/桥墩），这里只声明通行。
    // 不标 none 的话默认视觉会在桥板上再铺一块零厚度的石台，共面闪烁
    visual: "none",
  };
});

// ---- 高度场 -------------------------------------------------------------

/**
 * 烤出来的高度场。范围盖住主场景（两岸 + 河 + 北丘），格距 1 米。
 * 形状按顺序叠加，后画的赢：两块大陆 → 北丘 → 两块滩台。
 * 约 1.5 万格 × 5 个形状，启动烤一次，几十毫秒。
 */
export const baseHeightfield = bakeHeightfield({
  // 范围往北往西推到 -170/-160，把山脉整个装进来。**格距只能是 1.0**：
  // 试过 1.5（地形网格能少一半），岸壁 1.2 米宽在 1.5 格上采样就软了，
  // headless "往河里走会被岸壁拦住" 当场红。三角形的账另外算：
  // 网格化器跳过全在水下的格（见 heightfieldMesh），那部分谁也看不见
  ...terrainGrid({ minX: -170, maxX: 55, minZ: -160, maxZ: 55 }, 1),
  base: RIVER_BED_Y,
  shapes: [
    { shapeId: "west-land", outline: WEST_LAND as [number, number][], elevation: YARD_Y, falloff: BANK_FALLOFF },
    { shapeId: "outer-bank", outline: OUTER_BANK as [number, number][], elevation: YARD_Y, falloff: BANK_FALLOFF },
    { shapeId: "north-rise", outline: NORTH_RISE as [number, number][], elevation: YARD_Y + 1.1, falloff: 10 },
    { shapeId: "east-shelf", outline: EAST_SHELF as [number, number][], elevation: SHELF_Y, falloff: 1 },
    { shapeId: "south-shelf", outline: SOUTH_SHELF as [number, number][], elevation: SHELF_Y, falloff: 1 },
  ],
  peaks: PEAKS,
});
