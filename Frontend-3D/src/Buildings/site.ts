import { MeshLambertMaterial, Object3D, type Mesh } from "three";
import { buildingRectWorld, type BuildingPlacement } from "core";

import { PALETTE, jitterShade } from "../Game3D/Visual/palette";
import { box, group } from "../Game3D/Visual/primitives";
import { findBuildingLevel } from "./index";

/**
 * 工地的样子：**一圈施工围栏 + 半透明的成品**。
 *
 * 两样各干各的活：
 * - 半透明的成品说"这里将来会是什么"，玩家下单时看见的就是它；
 * - 围栏说"这块地被占了、正在动工"，而且它是**实心的**——半透明的东西
 *   在远处几乎看不见，光靠虚影的话领地上一块地被占了这件事读不出来。
 *
 * 围栏照占地矩形围一圈：桩子按格立、两道横杆连起来。桩子踩地形高度
 * （领地有起伏，一排等高的桩子在坡上会半截埋进土里）。
 */

/** 半透明成品的不透明度。太低就看不见，太高看着像建好了 */
const GHOST_OPACITY = 0.32;

/**
 * 把一棵已经建好的模型整个改成半透明。
 *
 * 材质要**克隆**：共享材质改一下，场上所有同型号的建筑一起变透明。
 * 这和 `BuildingPlacementController` 的虚影是同一个坑，那边也是克隆。
 */
function makeGhost(node: Object3D): Object3D {
  node.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as MeshLambertMaterial;
    mesh.material = new MeshLambertMaterial({
      color: source.color?.clone(),
      vertexColors: source.vertexColors,
      flatShading: source.flatShading,
      transparent: true,
      opacity: GHOST_OPACITY,
      depthWrite: false,
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });
  return node;
}

/**
 * 一圈施工围栏。`groundAt` 是采地形高度的回调——桩子各踩各的地。
 *
 * 坐标是**世界系**（和 `buildPlacedBuilding` 建出来的节点一样挂在场景下），
 * 所以直接用 `buildingRectWorld` 的矩形，不用再过一次朝向。
 */
export function buildSiteFence(
  placement: BuildingPlacement,
  groundAt: (x: number, z: number) => number,
): Object3D {
  const level = findBuildingLevel(
    placement.buildingId,
    placement.construction?.targetLevelId ?? placement.levelId,
  );
  if (!level) return new Object3D();

  const rect = buildingRectWorld(placement, level.footprint);
  const margin = 0.35;
  const minX = rect.minX - margin;
  const maxX = rect.maxX + margin;
  const minZ = rect.minZ - margin;
  const maxZ = rect.maxZ + margin;

  const parts: Object3D[] = [];
  const postH = 0.9;
  const baseY = groundAt(placement.x, placement.z);

  /** 一条边：沿它每 ~1.2 米立一根桩，再拉两道横杆 */
  const edge = (
    from: [number, number],
    to: [number, number],
    seed: number,
  ): void => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const length = Math.hypot(dx, dz);
    const count = Math.max(2, Math.round(length / 1.2));

    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const x = from[0] + dx * t;
      const z = from[1] + dz * t;
      parts.push(
        box([0.1, postH, 0.1], {
          color: jitterShade(PALETTE.woodDark, seed + i, 3, 0.08),
          // 桩子各踩各的地：坡上一排等高的桩会半截埋进土里
          position: [x, groundAt(x, z) - baseY + postH / 2, z],
        }),
      );
    }

    // 两道横杆。沿边方向拉一根长条，厚度取边的法向
    const alongX = Math.abs(dx) > Math.abs(dz);
    for (const h of [postH * 0.42, postH * 0.82]) {
      parts.push(
        box([alongX ? length : 0.07, 0.08, alongX ? 0.07 : length], {
          color: PALETTE.deckPlank,
          position: [(from[0] + to[0]) / 2, h, (from[1] + to[1]) / 2],
          castShadow: false,
        }),
      );
    }
  };

  edge([minX, minZ], [maxX, minZ], 1);
  edge([minX, maxZ], [maxX, maxZ], 2);
  edge([minX, minZ], [minX, maxZ], 3);
  edge([maxX, minZ], [maxX, maxZ], 4);

  const fence = group("site-fence", parts);
  fence.position.set(0, baseY, 0);
  return fence;
}

export { makeGhost };
