import type { MapPortal } from "core";

/**
 * base（玩家据点）的出入口。
 *
 * **地理决定动线**（2026-08-10 按世界设定图定死）：据点是伸进河里的
 * 岬角，北东南三面是水，去莉奥拉小镇只能过河——所以出入口就是**两座
 * 桥的桥头**：东桥直通镇口（对岸就是小镇西边的路），南桥落在镇子南边。
 *
 * 触发带贴在墙内的桥头地面上（"走上桥头就出发"）：桥面是布景、不声明
 * 承托面，玩家走不上去；真正的过桥运镜留给以后。
 *
 * **西门不是出入口**：西面那条脖子接的是大陆森林，不通小镇——那片林子
 * 留给以后的森林区域。它仍是据点的正门（对齐玄关轴线），但今天出去
 * 只是散个步。
 */
export const basePortals: MapPortal[] = [
  {
    portalId: "base-east-bridge",
    zone: { minX: 18.5, maxX: 20, minZ: -5.5, maxZ: -2.5 },
    targetMapId: "town",
    // 落在小镇西侧的土路上，面朝广场（东）。必须在 town 西出入口
    // （x≤-16.5）的外面，否则一到就被弹回来
    landing: { x: -15, y: 0, heading: Math.PI / 2 },
    localizationKey: "map.town",
  },
  {
    portalId: "base-south-bridge",
    zone: { minX: -15.5, maxX: -12.5, minZ: 16.5, maxZ: 18 },
    targetMapId: "town",
    // 南桥落在小镇南边，面朝广场（北）。在 town 南出入口（z≥14.5）之外
    landing: { x: 0, y: 13, heading: Math.PI },
    localizationKey: "map.town",
  },
];
