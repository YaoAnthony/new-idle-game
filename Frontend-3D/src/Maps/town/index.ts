import type { MapDefinition } from "core";
import { generatePlaza } from "./layout.js";
import { townPortals } from "./portals.js";

/**
 * town —— 小镇箱庭（占位版，箱庭①B）。
 *
 * 现在的唯一职责是当**换图流程的另一头**：/goto town 能过去、
 * 走一走、存个盘、/goto home 回来，家里的一切原样。真正的小镇
 * 内容（街道、店铺、外景）是阶段③的活，长在这个文件夹里。
 */
export const townMapDefinition: MapDefinition = {
  mapId: "town",
  localizationKey: "map.town",
  primaryRoomId: "town-plaza",
  outdoorRoomId: "town-field",
  yardMargin: 10,
  /** 广场地台直接铺在地上，没有床高 */
  floorLevel: 0,
  /** 广场是露天的：不建天花板/屋顶，镜头不按 2 格矮墙锁竖向 */
  openAir: true,

  /** 广场中央偏西，面朝东（回头就能看到出去的门） */
  spawn: { x: -2, y: 0, heading: Math.PI / 2 },

  portals: townPortals,

  generateRooms: (style) => {
    const plaza = generatePlaza(style);
    return { [plaza.roomId]: plaza };
  },
};
