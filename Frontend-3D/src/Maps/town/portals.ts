import type { MapPortal } from "core";

/**
 * town 的出入口：**东边的路回家**（从家过来时人就是从东边进来的，
 * 原路返回）。场地可走边界 x=18（广场半宽 8 + 活动圈 10）。
 */
export const townPortals: MapPortal[] = [
  {
    portalId: "town-east-path",
    zone: { minX: 16.5, maxX: 18, minZ: -8, maxZ: 8 },
    targetMapId: "home",
    // 落在家的西院小路上，面朝房子（东）。在 home 西出入口
    // （x≤-22.5）的外面
    landing: { x: -21, y: -8, heading: Math.PI / 2 },
    localizationKey: "map.home",
  },
];
