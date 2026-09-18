import { isCellWet, type FarmBed } from "core";
import type { Object3D } from "three";

/**
 * 田的土面三态（种植系统 2026-09-17）：实土 / 耕地 / 湿耕地。
 *
 * 模型里每格三层造型都建好了（`farmPlot.ts` 的 `cell-<i>-packed / -tilled / -wet`），
 * 这里按 `state.farm` 只亮其中一层。"湿"是算出来的（`wetUntilUtc` 对现在），
 * 所以要把 `nowUtc` 递进来——节拍器一到干的那一拍会发 `farm_cell_changed`，
 * BuildingsView 再调一次这里，土面就变回干的。
 */
export function applyFarmSoil(node: Object3D, bed: FarmBed, nowUtc: string): void {
  bed.cells.forEach((cell, index) => {
    const wet = cell.soil === "tilled" && isCellWet(cell, nowUtc);
    const packed = node.getObjectByName(`cell-${index}-packed`);
    const tilled = node.getObjectByName(`cell-${index}-tilled`);
    const wetLayer = node.getObjectByName(`cell-${index}-wet`);
    if (packed) packed.visible = cell.soil === "packed";
    if (tilled) tilled.visible = cell.soil === "tilled" && !wet;
    if (wetLayer) wetLayer.visible = wet;
  });
}
