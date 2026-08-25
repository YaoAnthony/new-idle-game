import type { Object3D } from "three";
import { box, cylinder, group } from "../Game3D/Visual/primitives.js";

/**
 * **管理石碑**：走得进去的楼，门口都立一块（2026-08-25 用户提的）。
 *
 * 它是这栋楼的管理入口——升级 / 迁移 / 拆除对着它按 F。为什么要收成
 * 一块碑而不是"站在楼里随便哪儿"，见 `placement.ts` 的
 * `buildingStelePoint`（那里有那个真 bug 的来龙去脉）。
 *
 * ## 一处生成，不让各栋楼各写一遍
 *
 * `buildPlacedBuilding` 看到这一级有 `interior` 就自动挂上，
 * 所以居民房、家具小店、餐厅、玩家自己的木屋一次全有了，
 * 以后加新楼也不用记得补——和"碰撞从模型推导"是同一条思路：
 * **共有的东西住在共有的地方**。
 *
 * ## 造型
 *
 * 一块微微前倾的石板 + 铜牌 + 底座，高 1.15 米——**比人矮一截**。
 * 做矮是有意的：它立在门边，做到齐眉就成了半扇墙，会挡住店面本身。
 * 前倾 8° 让铜牌迎着 32° 俯角的镜头，从游戏视角一眼看得见上面有东西。
 *
 * 颜色不吃各栋楼的配色（餐厅暖石、小店灰泥、居民房木头各不相同）：
 * **管理入口在全领地必须长得一模一样**，玩家学一次就够。
 */
export function buildingStele(): Object3D {
  const stone = "#8f8b80";
  const stoneDeep = "#6f6b62";
  const plaque = "#b98f52";

  return group("building-stele", [
    // 底座：两级，压住碑脚
    box([0.52, 0.1, 0.4], { position: [0, 0.05, 0], color: stoneDeep }),
    box([0.44, 0.09, 0.34], { position: [0, 0.14, 0], color: stone }),

    // 碑身：微微前倾（+z 是正面）
    box([0.34, 0.92, 0.13], {
      position: [0, 0.62, 0.03],
      rotation: [-0.14, 0, 0],
      color: stone,
    }),
    // 碑顶收一个小圆头，方板子读起来像块门牌
    cylinder(0.17, 0.17, 0.12, 10, {
      position: [0, 1.07, 0.09],
      rotation: [Math.PI / 2 - 0.14, 0, 0],
      color: stone,
    }),

    /*
     * 铜牌。**颜色是这块碑唯一的亮点**——石头在草地上不显眼，
     * 一块暖铜色的方牌才是"这里可以操作"的招手。
     */
    box([0.24, 0.4, 0.04], {
      position: [0, 0.72, 0.11],
      rotation: [-0.14, 0, 0],
      color: plaque,
      castShadow: false,
    }),
    // 牌面上刻的两道横纹，只做剪影
    ...[0.79, 0.7].map((y, i) =>
      box([0.15 - i * 0.03, 0.025, 0.02], {
        position: [0, y, 0.135],
        rotation: [-0.14, 0, 0],
        color: stoneDeep,
        castShadow: false,
      }),
    ),
  ]);
}
