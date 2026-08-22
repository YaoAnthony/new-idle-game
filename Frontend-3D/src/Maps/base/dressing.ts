import { Object3D } from "three";
import { jitterShade } from "../../Game3D/Visual/palette.js";
import { blob, cylinder, group, sphere } from "../../Game3D/Visual/primitives.js";
import { hash01 } from "../../Game3D/World/outdoorTerrain.js";
import { COTTAGE_SIZE } from "./layout.js";

/**
 * 女巫小屋的墙脚布景（2026-08-22）：门两侧各一丛蘑菇、墙脚几簇野花。
 *
 * 走 `houseDressingOf` 那张表：布景**长在房上**，坐标是房本地系，房子
 * 挪锚点它跟着走——期 1 删掉老房子的门前广场时把这条机制留着，就是
 * 给这个用的。
 *
 * 坐标按 COTTAGE_SIZE 推，不写死 ±4.5/6：户型是数据，墙脚在哪由它答。
 * 全是纯装饰，不进占用图、不挡路（蘑菇半径 0.2，踩过去也合理）。
 */
export function buildCottageDressing(floorLevel: number): Object3D {
  const halfW = COTTAGE_SIZE.width / 2;
  const halfD = COTTAGE_SIZE.height / 2;
  // 房子 root 的 y=0 是室内地板；院子地面在 −floorLevel
  const ground = -floorLevel;
  const parts: Object3D[] = [];

  const mushroom = (x: number, z: number, seed: number): Object3D => {
    const s = 0.7 + hash01(seed) * 0.6;
    const capColor = hash01(seed + 1) > 0.5 ? "#b8432e" : "#c9a06a";
    return group(`mushroom-${seed}`, [
      cylinder(0.05 * s, 0.07 * s, 0.28 * s, 6, {
        color: "#e8dcc8",
        position: [x, ground + 0.14 * s, z],
      }),
      sphere(0.16 * s, 8, 5, {
        color: jitterShade(capColor, seed, 2, 0.08),
        position: [x, ground + 0.28 * s, z],
      }),
    ]);
  };

  // 门在南墙西段（gridPosition x=1，宽 2 → 本地 x −3.5..−1.5）；蘑菇落在门两侧
  const doorCenterX = -halfW + 2;
  const doorZ = halfD + 0.7;
  for (const [dx, seed] of [[-1.6, 11], [-1.2, 12], [1.5, 13], [1.9, 14], [1.3, 15]] as const) {
    parts.push(mushroom(doorCenterX + dx, doorZ + hash01(seed) * 0.5, seed));
  }

  // 野花：沿东墙和西墙脚各几簇，一团叶子 + 两三个花点
  const flowerbed = (x: number, z: number, seed: number): Object3D => {
    const items: Object3D[] = [
      blob(0.22, 0, { color: "#5f8a3c", position: [x, ground + 0.12, z] }),
    ];
    for (let i = 0; i < 3; i += 1) {
      const a = hash01(seed * 7 + i) * Math.PI * 2;
      items.push(
        sphere(0.06, 5, 4, {
          color: ["#e9c46a", "#f4a2c0", "#f0f0f0"][i % 3],
          position: [x + Math.cos(a) * 0.16, ground + 0.3, z + Math.sin(a) * 0.16],
          castShadow: false,
        }),
      );
    }
    return group(`flowers-${seed}`, items);
  };
  const skirt = 0.55;
  for (const [z, seed] of [[-halfD + 2, 21], [-halfD + 5.5, 22], [halfD - 2.5, 23]] as const) {
    parts.push(flowerbed(halfW + skirt, z, seed));
    parts.push(flowerbed(-halfW - skirt, z + 1, seed + 10));
  }

  return group("cottage-dressing", parts);
}
