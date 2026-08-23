import type { TerritoryDefinition } from "core";

/**
 * 据点的地块表（2026-08-22 重写）。
 *
 * ## 为什么不再是 4×3 的棋盘
 *
 * 上一版是 `plotRect(col, row)` 用 `CELL = 15` 算出来的均匀网格，
 * 12 块一模一样的 15×15。两个问题：
 *
 * 1. **开局那块太小**。15×15 = 225 格，9×12 的小屋占掉 108 格，剩下的
 *    是一圈 3 格宽的边——出门三步就撞上领地线。
 * 2. **均匀网格是从算法来的，不是从这块地来的**。现实里一块地怎么分，
 *    分界是河、是林子、是路，不是等分线。这也是动森（分区靠河和崖）
 *    和星露谷（农场是一整块，边界是地形）的做法：**地块的形状本身
 *    就是叙事**，等分的格子只会读成"UI 网格"。
 *
 * 现在是一张**手写表**：每块自己的矩形，大小形状都不一样，20×23 的
 * 家院旁边挨着 8×45 的东岸长条。以后往上加/切分不需要迁就任何公式。
 *
 * ```
 *  x:  −40 ─────────── −15 ──── 0 ──── 5 ──── 12 ──── 20
 * z−27 ┌──────────────┬───────────────┬───────┬───────┐
 *      │ northwest    │  north_yard   │north_ │       │
 *      │  25×17       │   15×22       │grove  │ east_ │
 * z−10 ├──────────────┤               │ 12×22 │bridge │
 *      │ west_meadow  │               │       │ 8×45  │
 *      │  25×15       ├───────────────┴───┬───┤ ←桥头 │
 * z −5 │              │   ★ home 20×23    │eas│       │
 * z  5 ├──────────────┤     开局这块      │t_g│       │
 *      │ south_bank   │                   │rov│       │
 *      │  25×13       │                   │e  │       │
 * z 18 └──────────────┴───────────────────┴───┴───────┘
 * ```
 *
 * ## 两条硬约束（auditTerritory 会拦）
 *
 * - **合起来正好铺满** x −40..20 / z −27..18，不重叠不留洞。上面八块
 *   的面积之和 = 2700 = 60×45，改任何一块都要重新配平。
 * - **恰好一块 initial**，且出生点落在它里面。
 *
 * ## 到东桥仍然要扩两次（期 1 的 T5）
 *
 * 桥头灯柱在 (15, −4)，属于 `east_bridge`。它和 `home` **不共边**——
 * 中间隔着 7 宽的 `east_grove` 或北面的 `north_grove`。东边那条竖带
 * 特意切成 7 + 8 两条而不是一条 15，就是为了保住这个步数：地块可以
 * 有大有小，但"扩两次才看得到桥"是玩法节奏，不能被形状改掉。
 */

/*
 * 表里的边界数字（−40 / 20 / −27 / 18）和院子网格的 `TERRITORY_RECT`
 * 是同一圈。两处写着同一个数**是有意的**：表要能一眼读出形状，把边界
 * 换成 `TERRITORY_RECT.minX` 之类会让上面那张图对不上号。防走散靠
 * 审计而不是靠共享常量——`auditTerritory` 收 `expectedHull`，两边一
 * 分家开机就报，见 main.tsx。
 */

type Row = {
  plotId: string;
  rect: { minX: number; maxX: number; minZ: number; maxZ: number };
  initial?: boolean;
  lockedVisual?: { landmarkId: string; at: { x: number; z: number } };
  /**
   * 这块地是什么地貌 → `/icons/terrain/<terrain>.png`（商店卡片上那张图）。
   *
   * 写地貌名不写整条路径，和上面 `localizationKey` 由 plotId 拼出来是同一个
   * 路数——这张表是**内容表**，读的人关心的是"这块是林子还是滩地"，
   * 不是文件放在哪个目录。
   *
   * 现在 `terrain/` 下只有 `forest.png` 一张，所以八块暂时都写 forest。
   * 草地、滩地的图画好之后，改的是这一列上的一个词。
   */
  terrain?: string;
};

/**
 * 锁定时看得见的地标（决策 T7：**锁定格杂草丛生，但有特别建筑勾引玩家**）。
 * 只给三块地标，其余只有杂草——每块都放东西的话"那儿有点特别"就不特别了。
 */
const ROWS: Row[] = [
  /*
   * 家院。20 宽 × 23 深 = 460 格，小屋（9×12 = 108）占 23%——留出来的
   * 院子是房子的三倍多，才叫"能走来走去"。深度往北要：南边 z=18 是
   * 河岸线，扩不动；房子因此贴南缘站、门朝北，正对着以后要扩的方向。
   */
  {
    plotId: "home",
    rect: { minX: -15, maxX: 5, minZ: -5, maxZ: 18 },
    initial: true,
    terrain: "forest",
  },

  // 西边草地。废井在这块：西边最远的地标，给一个"那儿有点东西"的理由
  {
    plotId: "west_meadow",
    rect: { minX: -40, maxX: -15, minZ: -10, maxZ: 5 },
    terrain: "forest",
    lockedVisual: { landmarkId: "landmark_old_well", at: { x: -32, z: -5 } },
  },
  // 西南滩地，贴着南边的河岸线
  {
    plotId: "south_bank",
    rect: { minX: -40, maxX: -15, minZ: 5, maxZ: 18 },
    terrain: "forest",
  },
  // 西北林子。半塌的石碑在这块，暗示这块地有故事
  {
    plotId: "northwest_wood",
    rect: { minX: -40, maxX: -15, minZ: -27, maxZ: -10 },
    terrain: "forest",
    lockedVisual: { landmarkId: "landmark_broken_stele", at: { x: -18, z: -20 } },
  },

  // 北面老宅地：上一版那栋 24×20 的和风老房子就立在这一片（中心 (0,0)）
  {
    plotId: "north_yard",
    rect: { minX: -15, maxX: 0, minZ: -27, maxZ: -5 },
    terrain: "forest",
  },
  // 北面小树林
  {
    plotId: "north_grove",
    rect: { minX: 0, maxX: 12, minZ: -27, maxZ: -5 },
    terrain: "forest",
  },
  // 东边树丛：家院和桥头之间的缓冲，7 宽的一条
  {
    plotId: "east_grove",
    rect: { minX: 5, maxX: 12, minZ: -5, maxZ: 18 },
    terrain: "forest",
  },
  // 东岸：旧桥头灯柱在这里，看得见通往小镇的路在那边
  {
    plotId: "east_bridge",
    rect: { minX: 12, maxX: 20, minZ: -27, maxZ: 18 },
    terrain: "forest",
    lockedVisual: { landmarkId: "landmark_bridge_lamp", at: { x: 15, z: -4 } },
  },
];

export const baseTerritory: TerritoryDefinition = {
  plots: ROWS.map((row) => ({
    plotId: row.plotId,
    localizationKey: `territory.plot.${row.plotId}`,
    rect: row.rect,
    icon: row.terrain ? `/icons/terrain/${row.terrain}.png` : undefined,
    initial: row.initial,
    lockedVisual: row.lockedVisual,
  })),
};
