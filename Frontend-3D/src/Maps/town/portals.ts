import type { MapPortal } from "core";
import { shopEntrancePortals } from "../shops/index.js";

/**
 * town 的出入口，和据点的两座桥各自成对（走哪座桥来，就从哪条路回）。
 * 据点在小镇西边、隔着河：**西边的路**回东桥桥头，**南边的路**回南桥
 * 桥头。场地可走边界 x ±18、z ±16（广场半宽 8 半深 6 + 活动圈 10）。
 */
export const townPortals: MapPortal[] = [
  {
    portalId: "town-west-path",
    zone: { minX: -28, maxX: -26.5, minZ: -8, maxZ: 8 },
    targetMapId: "base",
    // 落在据点**东桥的桥面上**（对岸这一头），面朝大宅（西）——回家
    // 同样要走一遍桥。必须在 base 东桥触发带（x≥43）的外面，
    // 否则一到就被弹回小镇
    landing: { x: 42, y: -4, heading: -Math.PI / 2 },
    localizationKey: "map.base",
  },
  {
    portalId: "town-south-path",
    zone: { minX: -8, maxX: 8, minZ: 14.5, maxZ: 16 },
    targetMapId: "base",
    // 落在据点南桥的桥面上（对岸这一头），面朝大宅（北）。
    // 在 base 南桥触发带（z≥45）的外面
    landing: { x: -14, y: 44, heading: 0 },
    localizationKey: "map.base",
  },
  // 六家店门口：走到台阶上就进店（另一半在 Maps/shops）
  ...shopEntrancePortals,
];
