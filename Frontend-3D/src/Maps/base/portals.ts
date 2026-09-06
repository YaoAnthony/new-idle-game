import type { MapPortal } from "core";
import { BRIDGES, BRIDGE_WIDTH } from "./terrain.js";

/**
 * base（玩家据点）的出入口。
 *
 * **地理决定动线**：据点是伸进河里的岬角，北东南三面是水，去莉奥拉
 * 小镇只能过河——所以出入口就是桥。**今天只有东桥一座**（南桥 2026-08-22
 * 删了，见 terrain.ts 的 BRIDGES）。
 *
 * **触发带从桥头搬到了桥尾**（2026-08-12）。上一版贴在墙内的桥头地面上
 * （"走上桥头就出发"），桥面是纯布景走不上去。那在河只有 0.42 深的
 * 时候无所谓——反正桥也没什么可走的。河真挖到 4.5 米深、桥面成了声明
 * 的承托面之后，这么做就说不过去了：桥是唯一的通路，那就得真的走过去，
 * 走到对岸才换图。
 *
 * 落点仍在桥尾之外一截，避免"一到就被弹回来"。
 *
 * **西门不是出入口**：西面那条脖子接的是大陆森林，不通小镇——那片林子
 * 留给以后的森林区域。它仍是据点的正门（对齐玄关轴线）。
 */

/** 触发带贴在桥的最后 2 格上。桥有多宽这里就有多宽，从摆放推 */
function bridgeExit(
  bridgeId: string,
  landing: { x: number; y: number; heading: number },
): MapPortal {
  const bridge = BRIDGES.find((item) => item.id === bridgeId)!;
  const half = BRIDGE_WIDTH / 2;
  const near = bridge.to - 2;
  const zone =
    bridge.axis === "x"
      ? { minX: near, maxX: bridge.to, minZ: bridge.at - half, maxZ: bridge.at + half }
      : { minX: bridge.at - half, maxX: bridge.at + half, minZ: near, maxZ: bridge.to };
  return {
    portalId: `base-${bridgeId}-bridge`,
    zone,
    targetMapId: "town",
    landing,
    localizationKey: "map.town",
    // 13：小镇由阿茜第二幕的委托解锁（老档在 v46 迁移里补过）
    requiresFeature: "town_travel",
    lockedLocalizationKey: "toast.town_locked",
  };
}

export const basePortals: MapPortal[] = [
  // 东桥落在小镇西侧的土路上，面朝广场（东）。必须在 town 西出入口
  // （x≤-26.5）的外面，否则一到就被弹回来
  bridgeExit("east", { x: -25, y: 0, heading: Math.PI / 2 }),
  /*
   * 南桥删了（2026-08-22），它的触发带也跟着走。
   *
   * `bridgeExit` 里那句 `BRIDGES.find(...)!` 是不容错的——留着这一行
   * 会拿到 undefined 然后在解构 `bridge.to` 时当场炸，而且是在地图定义
   * 求值阶段炸，整个游戏起不来。桥和它的出入口必须一起删。
   */
];
