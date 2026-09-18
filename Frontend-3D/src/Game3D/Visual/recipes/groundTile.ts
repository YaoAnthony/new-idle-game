import type { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, group } from "../primitives.js";

/**
 * 地面物品拿在手上 / 掉在地上的样子（地面系统 2026-09-18）：一小块路面板。
 * 铺下去之后的样子不走这里（GroundsView 按对偶网格现算），这只是"一件东西"。
 */
export function buildGroundTile(top: string, rim: string): Object3D {
  return group("ground-tile", [
    box([0.6, 0.06, 0.6], { position: [0, 0.03, 0], color: rim }),
    box([0.56, 0.02, 0.56], { position: [0, 0.07, 0], color: top, castShadow: false }),
  ]);
}

export const buildSandyRoadTile = (): Object3D => buildGroundTile(PALETTE.groundSandTop, PALETTE.groundSandRim);
