import { describeCell, farmCellWorld, farmGiantWorld, findCropDefinition } from "core";
import { Object3D, type Scene } from "three";

import { findBuilding } from "../../Buildings/index";
import { on } from "../../Game/EventBus";
import { nowUtc } from "../../Game/State/clock";
import { farmBedsHere, readFarmBed, type FarmBedRef } from "../../Game/State/farmBeds";
import type { FarmTarget } from "../../Game/Systems/farming";
import { PALETTE } from "../Visual/palette";
import { box, disposeTree, group } from "../Visual/primitives";
import { buildVisual } from "../Visual/VisualRegistry";
import { hash01 } from "./outdoorTerrain";

/**
 * 田里的苗（种植系统 2026-09-17）。
 *
 * 苗**不在建筑模型里**：建筑模型进碰撞（模型即碰撞），苗进了模型就挡路——
 * 原来隐藏的四组苗照样进 BVH，空田上都有看不见的障碍。这里按格另摆一组，
 * 整组 `noCollide`，碰撞器根本看不到它。
 *
 * 每格的造型由作物注册表的 `stages` 按进度选（`describeCell.stageIndex`）；
 * 巨大果实存在时四格各自的苗隐掉、窗口中心放一个大的。
 *
 * 听三条：`world_changed{buildings|restored}` 整组重建（田拆了、读档），
 * `building_state_changed` / `farm_cell_changed` 只重摆那一块田。
 *
 * 顺带画**格光标**：对准的那一格描一圈，拿什么都能看见脚前是哪格。
 */
export class FarmCropsView {
  readonly root = new Object3D();
  private readonly cursor: Object3D;
  private readonly beds = new Map<string, Object3D>();
  private readonly offListeners: Array<() => void> = [];

  constructor(private readonly scene: Scene) {
    this.root.name = "farm-crops";
    this.root.userData.noCollide = true;
    this.scene.add(this.root);

    this.cursor = buildCursor();
    this.cursor.visible = false;
    this.root.add(this.cursor);

    this.rebuild();
    this.offListeners.push(
      on("world_changed", ({ reason }) => {
        if (reason === "buildings" || reason === "restored") this.rebuild();
      }),
      on("map_changed", () => this.rebuild()),
      on("building_state_changed", ({ instanceId }) => this.refreshBed(instanceId)),
      on("farm_cell_changed", ({ instanceId }) => this.refreshBed(instanceId)),
    );
  }

  private clearBeds(): void {
    for (const [, node] of this.beds) {
      this.root.remove(node);
      disposeTree(node);
    }
    this.beds.clear();
  }

  rebuild(): void {
    this.clearBeds();
    for (const ref of farmBedsHere()) this.addBed(ref);
  }

  private refreshBed(instanceId: string): void {
    const old = this.beds.get(instanceId);
    if (old) {
      this.root.remove(old);
      disposeTree(old);
      this.beds.delete(instanceId);
    }
    const ref = readFarmBed(instanceId);
    if (ref) this.addBed(ref);
  }

  private addBed(ref: FarmBedRef): void {
    const soilTop = findBuilding(ref.placement.buildingId)?.farm?.soilTop ?? 0;
    const y = ref.placement.elevation + soilTop;
    const now = nowUtc();
    const node = group(`crops-${ref.instanceId}`, []);
    node.userData.noCollide = true;

    ref.bed.cells.forEach((_, index) => {
      const view = describeCell(ref.bed, ref.footprint, index, findCropDefinition, now);
      if (view.soil !== "tilled" || !view.plant || view.plant.giant) return;
      const crop = findCropDefinition(view.plant.cropId);
      const stage = crop?.stages[view.plant.stageIndex];
      const visual = stage ? buildVisual(stage.visual) : null;
      if (!visual) return;
      const at = farmCellWorld(ref.placement, ref.footprint, index);
      visual.position.set(at.x, y, at.z);
      // 每格转个不同的角度：六株一模一样朝同一边像贴图不像田
      visual.rotation.y = hash01(index + ref.instanceId.length) * Math.PI * 2;
      markNoCollide(visual);
      node.add(visual);
    });

    if (ref.bed.giant) {
      const crop = findCropDefinition(ref.bed.giant.cropId);
      const visual = crop?.giant ? buildVisual(crop.giant.visual) : null;
      if (visual) {
        const at = farmGiantWorld(ref.placement, ref.footprint, ref.bed.giant);
        visual.position.set(at.x, y, at.z);
        markNoCollide(visual);
        node.add(visual);
      }
    }

    this.root.add(node);
    this.beds.set(ref.instanceId, node);
  }

  /** 对准的那一格描一圈；巨大果实盖着的格描整个 2×2 窗口。null = 收起 */
  setCursor(target: FarmTarget | null): void {
    if (!target) {
      this.cursor.visible = false;
      return;
    }
    const ref = readFarmBed(target.instanceId);
    if (!ref) {
      this.cursor.visible = false;
      return;
    }
    const soilTop = findBuilding(ref.placement.buildingId)?.farm?.soilTop ?? 0;
    const giant = ref.bed.giant;
    const covered = giant
      ? [giant.row * ref.footprint.width + giant.col, giant.row * ref.footprint.width + giant.col + 1, (giant.row + 1) * ref.footprint.width + giant.col, (giant.row + 1) * ref.footprint.width + giant.col + 1]
      : [];
    const at = covered.includes(target.cell) && giant
      ? farmGiantWorld(ref.placement, ref.footprint, giant)
      : farmCellWorld(ref.placement, ref.footprint, target.cell);
    const size = covered.includes(target.cell) ? 2 : 1;
    this.cursor.position.set(at.x, ref.placement.elevation + soilTop + 0.02, at.z);
    this.cursor.scale.set(size, 1, size);
    this.cursor.visible = true;
  }

  dispose(): void {
    for (const off of this.offListeners) off();
    this.clearBeds();
    this.root.remove(this.cursor);
    disposeTree(this.cursor);
    this.scene.remove(this.root);
  }
}

function markNoCollide(node: Object3D): void {
  node.userData.noCollide = true;
  node.traverse((child) => {
    child.userData.noCollide = true;
  });
}

/** 一圈细框（四根横条），原点在格中心、贴在土面上 */
function buildCursor(): Object3D {
  const t = 0.035;
  const s = 0.86;
  const node = group("farm-cursor", [
    box([s, 0.02, t], { position: [0, 0, -s / 2], color: PALETTE.farmCursor, castShadow: false, receiveShadow: false }),
    box([s, 0.02, t], { position: [0, 0, s / 2], color: PALETTE.farmCursor, castShadow: false, receiveShadow: false }),
    box([t, 0.02, s], { position: [-s / 2, 0, 0], color: PALETTE.farmCursor, castShadow: false, receiveShadow: false }),
    box([t, 0.02, s], { position: [s / 2, 0, 0], color: PALETTE.farmCursor, castShadow: false, receiveShadow: false }),
  ]);
  markNoCollide(node);
  return node;
}
