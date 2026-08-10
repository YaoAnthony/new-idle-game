import {
  GroundKind,
  surfaceElevationAt,
  type GroundSurface,
  type MapDefinition,
} from "core";
import { Object3D } from "three";
import { PALETTE } from "../Visual/palette.js";
import { box } from "../Visual/primitives.js";

/**
 * 声明的可走固定件（MapDefinition.groundFixtures）的**视觉**一侧。
 *
 * 通行那一侧不在这里——声明在 buildGroundMap 里直接编译成承托面，
 * 这里只负责把同一份声明画出来。尺寸、标高全从声明取，一个数都不
 * 自己定：看得见的板和走得上的面要是各写一份，迟早错开半格。
 *
 * 坡道画成分级石阶：0.55 的一步高意味着台阶在**通行**意义上就是
 * 斜坡（查询按线性插值答高度），逐级只是视觉——每级的顶取它进深
 * 中点处的坡面高度，脚和台面的偏差不超过半级，比"一块斜板"更像
 * 楼梯，又不用真的逐级做碰撞。
 */

/** 视觉上一级台阶的目标高度。真实级高会为整除微调，只小不大 */
const STEP_RISE = 0.2;

function buildPlatform(fixture: GroundSurface, yardLevel: number): Object3D {
  const rect = fixture.rect!;
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const height = fixture.elevation - yardLevel;

  const body = box([width, height, depth], {
    color: PALETTE.foundation,
    position: [
      (rect.minX + rect.maxX) / 2,
      yardLevel + height / 2,
      (rect.minZ + rect.maxZ) / 2,
    ],
  });
  body.receiveShadow = true;
  return body;
}

function buildStairs(fixture: GroundSurface, yardLevel: number): Object3D {
  const rect = fixture.rect!;
  const slope = fixture.slope!;
  const node = new Object3D();

  const rise = Math.abs(slope.toElevation - slope.fromElevation);
  const steps = Math.max(1, Math.ceil(rise / STEP_RISE));
  const runStart = slope.from;
  const runEnd = slope.to;

  for (let i = 0; i < steps; i += 1) {
    // 这一级占坡道进深的 [i/steps, (i+1)/steps]，顶取进深中点的坡面高
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const nearCoord = runStart + (runEnd - runStart) * t0;
    const farCoord = runStart + (runEnd - runStart) * t1;
    const midCoord = (nearCoord + farCoord) / 2;

    const alongX = slope.axis === "x";
    const sampleX = alongX ? midCoord : (rect.minX + rect.maxX) / 2;
    const sampleZ = alongX ? (rect.minZ + rect.maxZ) / 2 : midCoord;
    const top = surfaceElevationAt(fixture, sampleX, sampleZ);

    const stepDepth = Math.abs(farCoord - nearCoord);
    const stepWidth = alongX ? rect.maxZ - rect.minZ : rect.maxX - rect.minX;
    const height = top - yardLevel;

    const size: [number, number, number] = alongX
      ? [stepDepth, height, stepWidth]
      : [stepWidth, height, stepDepth];
    const step = box(size, {
      color: PALETTE.foundation,
      position: [
        alongX ? midCoord : sampleX,
        yardLevel + height / 2,
        alongX ? sampleZ : midCoord,
      ],
    });
    step.receiveShadow = true;
    node.add(step);
  }

  return node;
}

export function buildGroundFixtures(map: MapDefinition): Object3D {
  const root = new Object3D();
  root.name = "ground-fixtures";
  const yardLevel = -map.floorLevel;

  for (const fixture of map.groundFixtures ?? []) {
    if (!fixture.rect) continue;
    if (fixture.kind === GroundKind.Ramp && fixture.slope) {
      root.add(buildStairs(fixture, yardLevel));
    } else {
      root.add(buildPlatform(fixture, yardLevel));
    }
  }

  return root;
}
