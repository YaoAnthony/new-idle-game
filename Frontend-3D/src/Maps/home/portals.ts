import type { MapPortal } from "core";

/**
 * home 的出入口。
 *
 * 只有一个：**西边的小路通小镇**。选西边不是随手指的——玄关门廊开在
 * 西墙，门前的飞石本来就往西铺，玩家出门顺着石头走就自然走到镇口，
 * 路线不用任何提示自己会被读出来。院子的可走边界在 x=-24（房子半宽
 * 12 + 活动圈 12），触发带贴着边界取 1.5 格深。
 *
 * z 范围对齐门廊那条动线（门在 z≈-8），不整条西边全开：整条边都能
 * 走出去的话，"小路"就不存在了，出入口要有出入口的样子。
 */
export const homePortals: MapPortal[] = [
  {
    portalId: "home-west-path",
    zone: { minX: -24, maxX: -22.5, minZ: -12, maxZ: -4 },
    targetMapId: "town",
    // 落在小镇东侧场地上，背对来路、面朝广场（西）。
    // 必须在 town 东出入口（x≥16.5）的外面，否则一到就被弹回家
    landing: { x: 15, y: 0, heading: -Math.PI / 2 },
    localizationKey: "map.town",
  },
];
