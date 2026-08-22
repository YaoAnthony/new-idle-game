import type { TerritoryDefinition } from "core";
import { TERRITORY_RECT } from "./layout.js";

/**
 * 据点的格盘：**4 列 × 3 行 = 60 宽 × 45 深，每格 15×15**（决策 T5）。
 * 列 A–D 从西到东、行 1–3 从北到南，`"C3"` 是下排从西数第三格。
 *
 * ```
 *      A(−40..−25)  B(−25..−10)  C(−10..5)   D(5..20)
 *  1   A1           B1           C1          D1          (z −27..−12)
 *  2   A2           B2           C2          D2 · 东桥头  (z −12..3)
 *  3   A3           B3 · 南桥头   C3 · 开局   D3          (z 3..18)
 * ```
 *
 * **开局在 C3**：到东桥要开两次（C3 → C2 → D2，或 C3 → D3 → D2），
 * 正合"扩充两次才看得到桥"；到南桥一步（C3 → B3）。想让南桥也要两步，
 * 把开局格挪到 D3——那是这张表上唯一的旋钮，记在这里。
 *
 * 地标落点是实算的：老房子中心 (0,0) 在 C2；东桥头 (20,−4) 在 D2 的
 * 东边线上；南桥头 (−14,18) 在 B3 的南边线上；新出生点 (−2,10) 在 C3。
 */

const COLS = ["A", "B", "C", "D"] as const;
const CELL = 15;

function plotRect(col: number, row: number) {
  return {
    minX: TERRITORY_RECT.minX + CELL * col,
    maxX: TERRITORY_RECT.minX + CELL * (col + 1),
    minZ: TERRITORY_RECT.minZ + CELL * row,
    maxZ: TERRITORY_RECT.minZ + CELL * (row + 1),
  };
}

/**
 * 锁定时看得见的地标（决策 T7：**锁定格杂草丛生，但有特别建筑勾引玩家**）。
 *
 * 只给三个够了，其余格只有杂草——每格都放东西的话"那儿有点特别"就不
 * 特别了。三个各有各的勾：D2 让人看见通往小镇的路在那边；A2 是西边最远的
 * 一格，给一个"那儿有点东西"的理由；B1 暗示这块地有故事。
 */
const LOCKED_VISUALS: Record<string, { landmarkId: string; at: { x: number; z: number } }> = {
  // 旧桥头灯柱：看得见通往小镇的路在那边
  D2: { landmarkId: "landmark_bridge_lamp", at: { x: 15, z: -4 } },
  // 废井：西边最远，给一个"那儿有点东西"的理由
  A2: { landmarkId: "landmark_old_well", at: { x: -32, z: -5 } },
  // 半塌的石碑：北面后庭，暗示这块地有故事
  B1: { landmarkId: "landmark_broken_stele", at: { x: -18, z: -20 } },
};

export const baseTerritory: TerritoryDefinition = {
  plots: COLS.flatMap((col, c) =>
    [0, 1, 2].map((r) => {
      const plotId = `${col}${r + 1}`;
      return {
        plotId,
        localizationKey: `territory.plot.${plotId}`,
        rect: plotRect(c, r),
        initial: plotId === "C3" ? true : undefined,
        lockedVisual: LOCKED_VISUALS[plotId],
      };
    }),
  ),
};
