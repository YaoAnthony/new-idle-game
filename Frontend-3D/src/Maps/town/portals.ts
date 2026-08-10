import type { MapPortal } from "core";

/**
 * town 的两个出入口，和据点的两条路各自成对（去哪边回哪边）：
 * **东边的路**是陆路，回据点西大门；**西边的路**是过河近路，
 * 回据点东墙桥头。场地可走边界 ±18（广场半宽 8 + 活动圈 10）。
 */
export const townPortals: MapPortal[] = [
  {
    portalId: "town-east-path",
    zone: { minX: 16.5, maxX: 18, minZ: -8, maxZ: 8 },
    targetMapId: "base",
    // 落在据点西大门内侧，面朝大宅（东）。必须在 base 西门触发带
    // （x≤-26.5）的外面，否则一到就被弹回小镇
    landing: { x: -25, y: -8, heading: Math.PI / 2 },
    localizationKey: "map.base",
  },
  {
    portalId: "town-west-path",
    zone: { minX: -18, maxX: -16.5, minZ: -8, maxZ: 8 },
    targetMapId: "base",
    // 落在据点东墙桥头内侧，面朝大宅（西）。必须在 base 桥头触发带
    // （x≥18.5）的外面
    landing: { x: 17, y: -4, heading: -Math.PI / 2 },
    localizationKey: "map.base",
  },
];
