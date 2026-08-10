import type { MapPortal } from "core";

/**
 * base（玩家据点）的出入口。
 *
 * **南大门通小镇**：进出据点只有正门这一条路（设计稿 §2 的动线：
 * 南门 → 穿过田边 → 前庭 → 宅）。可走边界南沿在 z=26（房子半深 10 +
 * 南向边距 16），触发带贴边取 1.5 格深；x 对齐门洞净宽 3 格——
 * 整条南边都能走出去的话"大门"就不存在了，出入口要有出入口的样子。
 *
 * 东墙的桥头**故意不设出入口**：桥是封头布景，通往未来的新地区。
 * 到那天：拆桥头栅栏、给桥面声明承托面、在这里加一条 portal——
 * 三条数据的事（设计稿 §8）。
 */
export const basePortals: MapPortal[] = [
  {
    portalId: "base-south-gate",
    zone: { minX: -1.5, maxX: 1.5, minZ: 24.5, maxZ: 26 },
    targetMapId: "town",
    // 落在小镇东侧场地上，背对来路、面朝广场（西）。
    // 必须在 town 东出入口（x≥16.5）的外面，否则一到就被弹回来
    landing: { x: 15, y: 0, heading: -Math.PI / 2 },
    localizationKey: "map.town",
  },
];
