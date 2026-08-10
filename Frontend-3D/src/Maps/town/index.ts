import { GroundKind, type GroundSurface, type MapDefinition } from "core";
import { generatePlaza } from "./layout.js";
import { townPortals } from "./portals.js";
import { buildingBlockers } from "../../Buildings/index.js";
import { TERRACE_BACK, TERRACE_FRONT, TOWN_BUILDINGS } from "./buildings.js";

/**
 * 商业街的两级台地和上去的石阶——**声明出来就有碰撞、就能走**
 * （承托面系统的红利）。
 *
 * 小镇原来是一块绝对平的地，现实里的镇子不是这样：商业街抬在挡土墙
 * 上，从广场要上几级石阶。抬起来同时买到三样——立面有层次、街和广场
 * 分了区、寻路有了真正的非平地场景（A* 问的是 canStepUp，会自己找
 * 石阶上去，不用为它写一行）。
 *
 * 石阶**特意错开摆**（前排的在东、后排的在西）：一条笔直捅到底的
 * 中轴楼梯太规整，人走起来也就"直来直去"；错开之后进商业街要拐一下，
 * 动线自然多了。
 */
const TERRACES: GroundSurface[] = [
  /*
   * **坡道必须排在台地前面**：承托面按列表顺序取第一个命中的，
   * 而石阶是切进台地里的一小块——写在台地后面就永远被台地盖住，
   * 那段坡道等于不存在。实测就是这么坏的：后排石阶被后排台地遮掉，
   * 书店成了一个爬不上去的地方（/go 书店 走到小镇就停住）。
   * 一般规律：越具体的面排越前。
   */
  // 广场 → 前排台地的石阶（偏东）
  {
    surfaceId: "town-steps-front",
    kind: GroundKind.Ramp,
    roomId: "town-field",
    floorIndex: 0,
    rect: { minX: 6, maxX: 10, minZ: -9.5, maxZ: -5.5 },
    elevation: TERRACE_FRONT,
    slope: { axis: "z", from: -5.5, to: -9.5, fromElevation: 0, toElevation: TERRACE_FRONT },
  },
  // 前排 → 后排的石阶（偏西，和上一段错开，进街要拐一下）
  {
    surfaceId: "town-steps-back",
    kind: GroundKind.Ramp,
    roomId: "town-field",
    floorIndex: 0,
    rect: { minX: -10, maxX: -6, minZ: -31.5, maxZ: -27.5 },
    elevation: TERRACE_BACK,
    slope: {
      axis: "z",
      from: -27.5,
      to: -31.5,
      fromElevation: TERRACE_FRONT,
      toElevation: TERRACE_BACK,
    },
  },
  // 前排台地（咖啡厅/餐厅/超市那一排脚下）
  {
    surfaceId: "town-terrace-front",
    kind: GroundKind.Platform,
    roomId: "town-field",
    floorIndex: 0,
    rect: { minX: -27, maxX: 27, minZ: -27.5, maxZ: -9.5 },
    elevation: TERRACE_FRONT,
  },
  // 后排台地（书店/神秘商店/便利店）
  {
    surfaceId: "town-terrace-back",
    kind: GroundKind.Platform,
    roomId: "town-field",
    floorIndex: 0,
    rect: { minX: -27, maxX: 27, minZ: -44, maxZ: -27.5 },
    elevation: TERRACE_BACK,
  },
];

/**
 * town —— 莉奥拉小镇。
 *
 * 广场是这张图的房间（openAir，钟楼广场的位置），北边是**商业街**：
 * 两排六家店，照世界设定图和店铺概念图摆。往北的边距特意放大到 34，
 * 就是为了装下这条街——四向边距不均匀正是为这种事加的。
 */
export const townMapDefinition: MapDefinition = {
  mapId: "town",
  localizationKey: "map.town",
  primaryRoomId: "town-plaza",
  outdoorRoomId: "town-field",
  yardMargin: 10,

  /** 北边是商业街（两排店 + 街），所以放得比其他三面深得多 */
  yardMargins: { north: 38, south: 10, east: 20, west: 20 },

  /** 广场地台直接铺在地上，没有床高 */
  floorLevel: 0,
  /** 广场是露天的：不建天花板/屋顶，镜头不按 2 格矮墙锁竖向 */
  openAir: true,

  /** 这张图立着哪些楼。碰撞/店门/出入口/铺装全部从它推导 */
  buildings: TOWN_BUILDINGS,

  /**
   * 六家店的主体是实心的：走不进去，只能从店门（出入口触发带）进。
   * **从摆放表推**——建筑摆哪、碰撞在哪不能是两份数据，转个朝向时
   * 尤其致命（视觉转了碰撞没转 = 撞空气）。
   */
  outdoorBlockers: buildingBlockers(TOWN_BUILDINGS),

  /** 两级台地 + 两段石阶。声明即碰撞，寻路也会自己找上去 */
  groundFixtures: TERRACES,

  /** 广场中央偏西，面朝东（回头就能看到出去的门） */
  spawn: { x: -2, y: 0, heading: Math.PI / 2 },

  portals: townPortals,

  generateRooms: (style) => {
    const plaza = generatePlaza(style);
    return { [plaza.roomId]: plaza };
  },
};
