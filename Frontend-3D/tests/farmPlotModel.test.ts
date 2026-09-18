import { expect, test } from "vitest";
import { Mesh, Object3D } from "three";

import { findBuilding, findBuildingLevel } from "../src/Buildings/index";
import { FARM_SOIL_TOP } from "../src/Buildings/farmPlot";
import { buildMeshCollider } from "../src/Game/State/world/meshCollision";
import { buildVisual } from "../src/Game3D/Visual/VisualRegistry";
import { applyFarmSoil } from "../src/Game3D/World/farmSoil";
import { newFarmBed, sowCell, tillCell, waterCell, findCropDefinition } from "core";

/**
 * 种植系统 · 期 2 · 田的模型（headless：不开渲染器，纯几何）。
 *
 * 钉三件事：每格三层土面都在（视图靠名字切）；**格心站得上、不挡人**——
 * 老骨架把四组苗塞进模型，隐藏的苗照样进 BVH，空田上都有看不见的障碍，
 * 这条就是那个 bug 的回归；作物每段造型都登记了。
 */

const FOOT = { min: 0.55, max: 1.9 };
/** 六格的本地中心（3×2：x −1/0/1，z ∓0.5） */
const CELL_CENTERS = [
  [-1, -0.5],
  [0, -0.5],
  [1, -0.5],
  [-1, 0.5],
  [0, 0.5],
  [1, 0.5],
] as const;

function farmModel(): Object3D {
  const level = findBuildingLevel("farm_plot", "l1");
  expect(level).toBeTruthy();
  return level!.build();
}

test("farmPlotModel_每格三层土面都在_默认只亮实土", () => {
  const node = farmModel();
  for (let i = 0; i < 6; i += 1) {
    const packed = node.getObjectByName(`cell-${i}-packed`);
    const tilled = node.getObjectByName(`cell-${i}-tilled`);
    const wet = node.getObjectByName(`cell-${i}-wet`);
    expect(packed?.visible, `cell-${i}-packed`).toBe(true);
    expect(tilled?.visible, `cell-${i}-tilled`).toBe(false);
    expect(wet?.visible, `cell-${i}-wet`).toBe(false);
  }
  expect(findBuilding("farm_plot")?.farm?.soilTop).toBe(FARM_SOIL_TOP);
});

test("farmPlotModel_applyFarmSoil_按格切层_湿是算出来的", () => {
  const node = farmModel();
  const now = "2026-09-17T00:00:00.000Z";
  let bed = tillCell(newFarmBed(6), 1);
  bed = sowCell(tillCell(bed, 2), 2, "tomato", now);
  bed = waterCell(bed, 2, findCropDefinition("tomato")!, now);

  applyFarmSoil(node, bed, now);
  expect(node.getObjectByName("cell-0-packed")?.visible).toBe(true);
  expect(node.getObjectByName("cell-1-tilled")?.visible).toBe(true);
  expect(node.getObjectByName("cell-1-wet")?.visible).toBe(false);
  expect(node.getObjectByName("cell-2-wet")?.visible).toBe(true);
  expect(node.getObjectByName("cell-2-tilled")?.visible).toBe(false);

  // 两小时后水干了：同一份 bed，换个 now，湿层灭、干层亮
  applyFarmSoil(node, bed, "2026-09-17T02:00:00.000Z");
  expect(node.getObjectByName("cell-2-wet")?.visible).toBe(false);
  expect(node.getObjectByName("cell-2-tilled")?.visible).toBe(true);
});

test("farmPlotModel_六个格心从地面走上去不被挡_站上去的高度是土面", () => {
  const collider = buildMeshCollider(farmModel());
  for (const [x, z] of CELL_CENTERS) {
    expect(collider.capsuleBlocked(x, z, 0.32, FOOT.min, FOOT.max), `格心 (${x}, ${z}) 从地面走上去`).toBe(false);
    const hit = collider.groundHitBelow(x, z, FARM_SOIL_TOP + 0.4);
    expect(hit, `格心 (${x}, ${z}) 脚下有面`).not.toBeNull();
    expect(hit!).toBeGreaterThan(0.4);
    expect(hit!).toBeLessThan(0.6);
  }
  // 站在田上（脚 0.55）往田里走也不被挡：格心之间的路是通的
  expect(collider.capsuleBlocked(0.5, 0, 0.32, 0.55 + 0.55, 0.55 + 1.9)).toBe(false);
});

test("farmPlotModel_装饰不进碰撞_桩子进", () => {
  const node = farmModel();
  const noCollide: string[] = [];
  const collide: string[] = [];
  node.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    (child.userData.noCollide ? noCollide : collide).push(child.parent?.name ?? "");
  });
  expect(noCollide.filter((name) => name === "farm-mushroom").length).toBeGreaterThan(0);
  expect(noCollide.filter((name) => name === "farm-crystals").length).toBeGreaterThan(0);
  // 桩本体（木桩、横臂）要挡人；旗、灯不挡
  expect(collide.filter((name) => name === "farm-sign").length).toBeGreaterThanOrEqual(2);
  expect(noCollide.filter((name) => name === "farm-sign").length).toBeGreaterThanOrEqual(5);
});

test("farmPlotModel_作物每段和农具都有造型", () => {
  for (const id of ["crop_sown", "crop_tomato_sprout", "crop_tomato_bush", "crop_tomato_ripe", "crop_tomato_giant", "wooden_hoe", "watering_can", "watering_can_wide"]) {
    expect(buildVisual(id), id).not.toBeNull();
  }
  const tomato = findCropDefinition("tomato")!;
  for (const stage of tomato.stages) expect(buildVisual(stage.visual), stage.visual).not.toBeNull();
  expect(buildVisual(tomato.giant!.visual)).not.toBeNull();
});
