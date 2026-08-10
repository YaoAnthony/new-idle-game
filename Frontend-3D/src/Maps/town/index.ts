import type { MapDefinition } from "core";
import { generatePlaza } from "./layout.js";
import { townPortals } from "./portals.js";
import { SHOP_SPECS, shopFootprint } from "./shops.js";

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

  /**
   * 六家店的主体是实心的：走不进去，只能从店门（出入口触发带）进。
   * 从同一张规格表推导——建筑摆哪、碰撞在哪，不能是两份数据。
   */
  outdoorBlockers: SHOP_SPECS.map(shopFootprint),

  /** 广场中央偏西，面朝东（回头就能看到出去的门） */
  spawn: { x: -2, y: 0, heading: Math.PI / 2 },

  portals: townPortals,

  generateRooms: (style) => {
    const plaza = generatePlaza(style);
    return { [plaza.roomId]: plaza };
  },
};
