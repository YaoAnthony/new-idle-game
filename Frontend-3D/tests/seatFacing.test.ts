import { expect, test } from "vitest";
import {
  Facing,
  findPlaceableItem,
  listFurnitureAnchors,
  type PlacedFurniture,
} from "core";

import {
  facingWorldVector,
  furnitureWorldYaw,
} from "../src/Game3D/World/furnitureMath";

/**
 * 坐下来的人**必须和椅子面朝同一边**。
 *
 * 这条不变式看着废话，但它是两套坐标凑出来的：椅面的朝向来自 Core 的
 * 锚点（`FurnitureAnchor.facing` 复合家具朝向，**房本地**），椅子模型的
 * 朝向来自表现层的 yaw（复合了**房屋锚点**）。少复合一层不会报错，
 * 只会让人背对着桌子写作业——2026-08-23 的那个 bug 就是这么来的：
 * 新档的房子 anchor.facing 是 south，于是屋里每一次坐下都反 180°。
 *
 * 所以四种椅子朝向 × 四种房子朝向全钉：只测默认锚点的话，
 * 这个 bug 在测试里是绿的。
 */

/** 模型的正面在本地 +Z（椅背和床头在 -Z），转过 yaw 就是它在世界里朝哪 */
function meshFrontWorld(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function chairAt(facing: Facing): PlacedFurniture {
  return {
    instanceId: "test:chair",
    furnitureId: "furniture_chair",
    placement: {
      kind: "floor",
      roomId: "living",
      gridPosition: { x: 2, y: 6 },
      facing,
    },
    state: {},
  } as PlacedFurniture;
}

const ALL_FACINGS = [Facing.North, Facing.East, Facing.South, Facing.West];

test.each(ALL_FACINGS)("房子朝 %s 时，坐的人和椅子同向", (houseFacing) => {
  const room = {
    floorGrid: { width: 9, height: 12 },
    anchor: { x: -5.5, z: 11, elevation: 0, facing: houseFacing },
  };

  const chair = findPlaceableItem("furniture_chair");
  expect(chair, "furniture_chair 得是可摆放物品").toBeTruthy();

  for (const chairFacing of ALL_FACINGS) {
    const placed = chairAt(chairFacing);
    const [seat] = listFurnitureAnchors(placed, chair!);
    expect(seat, "木椅得有一个坐的锚点").toBeTruthy();

    const [sitX, sitZ] = facingWorldVector(room, seat.facing);
    const front = meshFrontWorld(furnitureWorldYaw(room, chairFacing));

    const label = `房子 ${houseFacing} / 椅子 ${chairFacing}`;
    expect(sitX, label).toBeCloseTo(front.x, 6);
    expect(sitZ, label).toBeCloseTo(front.z, 6);
  }
});
