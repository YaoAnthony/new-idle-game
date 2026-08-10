import type { MapPortal } from "core";

/**
 * base（玩家据点）的出入口。
 *
 * **西大门通小镇**（2026-08-10 从南墙搬来）：老宅玄关开在西墙 z≈-8，
 * 大门必须和它同轴——"正门对正门"的秩序感是概念图特意标注的一条。
 * 动线：进西门 → 穿过田边 → 前庭 → 正对玄关。可走边界西沿在
 * x=-28（房子半宽 12 + 西向边距 16），触发带贴边取 1.5 格深；
 * z 对齐门洞净宽 3 格。
 *
 * **两条路都通小镇**（2026-08-10 按世界图定的地理：西边山地、东边
 * 河流，据点隔河望镇）：西门是沿山谷绕远的**陆路**，落在小镇东侧；
 * 东墙桥头是**过河近路**，落在小镇西侧。两条路各自成对（去哪边回
 * 哪边），世界的方位感靠这个立起来。
 */
export const basePortals: MapPortal[] = [
  {
    portalId: "base-west-gate",
    zone: { minX: -28, maxX: -26.5, minZ: -9.5, maxZ: -6.5 },
    targetMapId: "town",
    // 落在小镇东侧场地上，背对来路、面朝广场（西）。
    // 必须在 town 东出入口（x≥16.5）的外面，否则一到就被弹回来
    landing: { x: 15, y: 0, heading: -Math.PI / 2 },
    localizationKey: "map.town",
  },
  {
    portalId: "base-east-bridge",
    zone: { minX: 18.5, maxX: 20, minZ: -5.5, maxZ: -2.5 },
    targetMapId: "town",
    // 过河近路：落在小镇西侧的土路上，面朝广场（东）。
    // 必须在 town 西出入口（x≤-16.5）的外面
    landing: { x: -15, y: 0, heading: Math.PI / 2 },
    localizationKey: "map.town",
  },
];
