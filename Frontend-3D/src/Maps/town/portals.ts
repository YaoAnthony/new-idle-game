import type { MapPortal } from "core";
import { shopEntrancePortals } from "../shops/index.js";

/**
 * town 的出入口，和据点的桥成对（走哪座桥来，就从哪条路回）。
 * 据点在小镇西边、隔着河：**西边的路**回东桥桥头。南边那条路随南桥
 * 一起删了（2026-08-22）。场地可走边界 x ±18、z ±16（广场半宽 8
 * 半深 6 + 活动圈 10）。
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
  /*
   * 南边那条路删了（2026-08-22，随据点的南桥一起）。
   *
   * **出入口是成对的**：走哪座桥来就从哪条路回。桥没了这条路还留着的话，
   * 从镇子南边走出去会落在 (−14, 44)——那地方删了桥之后就是河中央，
   * 人当场掉进水里，而且回不来。
   */
  // 六家店门口：走到台阶上就进店（另一半在 Maps/shops）
  ...shopEntrancePortals,
];
