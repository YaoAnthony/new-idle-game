import { Color, Mesh, MeshLambertMaterial, Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/**
 * 浴室：日式浴缸（2026-08-19）。
 *
 * 4×3 的木色方缸：房间那一侧（本地 −Z）是一条 0.7 米深、0.42 高的踏步
 * 高台，后面是 0.8 高的缸体；缸体里挖出 3.4×1.8 的浴池（池底离地 0.15），
 * 靠墙那侧池内有一道坐台（0.35 高）——泡澡的锚点就在坐台上，人面朝房间。
 *
 * 水是一块名为 `bath-water` 的节点：原点在池底、高度 = 满水位（0.57）。
 * BathAnimator 每帧按水位改它的 scale.y，0 就藏起来。材质是独享的半透明
 * 蓝（图元工厂的共享缓存不能改透明度，先 clone）。
 *
 * 尺寸从哪来：踏步 0.42 ≈ 一级台阶 + 坐高；缸沿 0.8 是日式深泡缸的常见
 * 高度（比西式浴缸高，坐进去水到肩）。坐台 0.35 和 Core 里锚点的 y 是
 * 同一个数——改要一起改。
 */

const PLINTH_HEIGHT = 0.42;
const RIM_HEIGHT = 0.8;
const BASIN_FLOOR = 0.15;
const WATER_TOP = 0.72;
export const OFURO_SEAT_HEIGHT = 0.35;

export function buildOfuro(): Object3D {
  const parts: Object3D[] = [];
  const W = 3.9; // x
  const stepDepth = 0.7;
  const tubDepth = 2.9 - stepDepth;
  const tubCenterZ = -1.45 + stepDepth + tubDepth / 2; // 踏步之后到 +1.45
  const stepCenterZ = -1.45 + stepDepth / 2;

  // 踏步高台（房间侧）
  parts.push(
    box([W, PLINTH_HEIGHT, stepDepth], {
      color: PALETTE.woodMid,
      position: [0, PLINTH_HEIGHT / 2, stepCenterZ],
    }),
  );
  parts.push(
    box([W + 0.02, 0.05, stepDepth + 0.02], {
      color: PALETTE.woodLight,
      position: [0, PLINTH_HEIGHT - 0.025, stepCenterZ],
      castShadow: false,
    }),
  );

  // 缸体：四面壁 + 池底（中间挖空成浴池）
  const basinW = 3.4;
  const basinD = 1.8;
  const wallX = (W - basinW) / 2; // 0.25
  const wallZ = (tubDepth - basinD) / 2; // 0.2
  const tubFrontZ = tubCenterZ - tubDepth / 2;
  const tubBackZ = tubCenterZ + tubDepth / 2;
  // 左右壁
  for (const side of [-1, 1]) {
    parts.push(
      box([wallX, RIM_HEIGHT, tubDepth], {
        color: PALETTE.woodLight,
        position: [side * (W / 2 - wallX / 2), RIM_HEIGHT / 2, tubCenterZ],
      }),
    );
  }
  // 前后壁
  parts.push(
    box([basinW, RIM_HEIGHT, wallZ], {
      color: PALETTE.woodLight,
      position: [0, RIM_HEIGHT / 2, tubFrontZ + wallZ / 2],
    }),
  );
  parts.push(
    box([basinW, RIM_HEIGHT, wallZ], {
      color: PALETTE.woodLight,
      position: [0, RIM_HEIGHT / 2, tubBackZ - wallZ / 2],
    }),
  );
  // 池底（深木色，连同池内壁的一圈深色衬板）
  const basinCenterZ = tubCenterZ;
  parts.push(
    box([basinW, BASIN_FLOOR, basinD], {
      color: PALETTE.woodDark,
      position: [0, BASIN_FLOOR / 2, basinCenterZ],
    }),
  );
  for (const side of [-1, 1]) {
    parts.push(
      box([0.03, RIM_HEIGHT - BASIN_FLOOR, basinD], {
        color: PALETTE.woodDark,
        position: [side * (basinW / 2 - 0.015), BASIN_FLOOR + (RIM_HEIGHT - BASIN_FLOOR) / 2, basinCenterZ],
        castShadow: false,
      }),
    );
  }
  for (const side of [-1, 1]) {
    parts.push(
      box([basinW, RIM_HEIGHT - BASIN_FLOOR, 0.03], {
        color: PALETTE.woodDark,
        position: [0, BASIN_FLOOR + (RIM_HEIGHT - BASIN_FLOOR) / 2, basinCenterZ + side * (basinD / 2 - 0.015)],
        castShadow: false,
      }),
    );
  }
  // 池内坐台（靠墙侧）
  const seatDepth = 0.45;
  parts.push(
    box([basinW - 0.06, OFURO_SEAT_HEIGHT - BASIN_FLOOR, seatDepth], {
      color: PALETTE.woodMid,
      position: [0, BASIN_FLOOR + (OFURO_SEAT_HEIGHT - BASIN_FLOOR) / 2, basinCenterZ + basinD / 2 - seatDepth / 2 - 0.03],
    }),
  );

  // 缸沿压条：四条窄边（不能整块盖——会把池口盖住）
  for (const side of [-1, 1]) {
    parts.push(
      box([wallX + 0.02, 0.05, tubDepth + 0.02], {
        color: PALETTE.woodMid,
        position: [side * (W / 2 - wallX / 2), RIM_HEIGHT - 0.025, tubCenterZ],
        castShadow: false,
      }),
    );
    parts.push(
      box([basinW, 0.05, wallZ + 0.02], {
        color: PALETTE.woodMid,
        position: [0, RIM_HEIGHT - 0.025, side < 0 ? tubFrontZ + wallZ / 2 : tubBackZ - wallZ / 2],
        castShadow: false,
      }),
    );
  }

  // 出水口：靠墙侧缸沿正中一段黄铜弯管
  parts.push(
    cylinder(0.025, 0.025, 0.3, 8, {
      color: PALETTE.brass,
      position: [0.6, RIM_HEIGHT + 0.15, tubBackZ - wallZ / 2],
    }),
  );
  parts.push(
    cylinder(0.025, 0.025, 0.22, 8, {
      color: PALETTE.brass,
      position: [0.6, RIM_HEIGHT + 0.3, tubBackZ - wallZ / 2 - 0.1],
      rotation: [Math.PI / 2, 0, 0],
    }),
  );

  // 水：原点在池底的节点，满水 0.57 高；BathAnimator 按水位缩 scale.y
  const waterHeight = WATER_TOP - BASIN_FLOOR;
  const waterMesh = box([basinW - 0.08, waterHeight, basinD - 0.08], {
    color: PALETTE.waterBlue,
    position: [0, waterHeight / 2, 0],
    castShadow: false,
    receiveShadow: false,
  });
  const owned = (waterMesh.material as MeshLambertMaterial).clone();
  owned.transparent = true;
  owned.opacity = 0.72;
  owned.color = new Color(PALETTE.waterBlue);
  owned.emissive = new Color(PALETTE.waterBlue);
  owned.emissiveIntensity = 0.12;
  (waterMesh as Mesh).material = owned;
  waterMesh.userData.noOutline = true;
  const water = new Object3D();
  water.name = "bath-water";
  water.position.set(0, BASIN_FLOOR, basinCenterZ);
  water.add(waterMesh);
  water.visible = false;
  parts.push(water);

  return group("ofuro", parts);
}
