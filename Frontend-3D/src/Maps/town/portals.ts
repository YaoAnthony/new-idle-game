import type { MapPortal } from "core";

/**
 * town 的出入口：**东边的路回据点**（从据点过来时人就是从东边进来的，
 * 原路返回）。场地可走边界 x=18（广场半宽 8 + 活动圈 10）。
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
];
