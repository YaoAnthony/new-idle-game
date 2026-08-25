import type { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { box, cylinder, group } from "../primitives.js";

/**
 * 广口水壶——旅行商人卖的第一件永久升级（期 6）。
 *
 * ⚠️ **这件没有设计稿。** 用户给的鱼人那张里，「配件展示」一栏是浮桶、
 * 木箱、渔网、灯笼、桨这些，没有水壶。水壶是个形状无歧义的道具
 * （壶身 + 壶嘴 + 提梁），所以我先按现有的木料 + 铜件语言做了一个，
 * 免得整条"工具等级"的机制卡在一张图上。**图来了换掉这个文件即可**，
 * 物品定义、商人货单、浇水逻辑一个字不用动。
 *
 * 造型上唯一刻意的地方是**壶嘴的莲蓬头做大**：它是"这把能一次浇一片"
 * 的唯一视觉说明。普通壶（今天还不存在）如果要做，就是同一个壶身配一个
 * 细嘴——两把摆一起，玩家不用读说明也知道哪把厉害。
 */
export function buildWateringCan(): Object3D {
  return group("watering-can", [
    // 壶身：一个略收口的木桶
    cylinder(0.085, 0.105, 0.17, 8, {
      position: [0, 0.085, 0],
      color: PALETTE.raftWood,
    }),
    // 两道桶箍
    ...[0.045, 0.135].map((y) =>
      cylinder(0.108, 0.108, 0.018, 8, {
        position: [0, y, 0],
        color: PALETTE.raftLantern,
        castShadow: false,
      }),
    ),
    // 顶盖
    cylinder(0.088, 0.088, 0.016, 8, {
      position: [0, 0.176, 0],
      color: PALETTE.raftWoodDeep,
    }),

    // 壶嘴：斜着往上伸
    cylinder(0.022, 0.03, 0.19, 6, {
      position: [0.115, 0.135, 0],
      rotation: [0, 0, -0.72],
      color: PALETTE.raftLantern,
    }),
    /*
     * **莲蓬头做大**——这是"广口"两个字的全部视觉依据。细嘴的壶一次浇
     * 一格，这把一次九格，两者在数据上差一个 `tool.power`，在画面上
     * 就差这一块。
     */
    cylinder(0.062, 0.042, 0.03, 8, {
      position: [0.185, 0.205, 0],
      rotation: [0, 0, -0.72],
      color: PALETTE.raftLantern,
    }),
    // 花洒面上的孔：几个小方块压出来的暗点
    ...[-1, 0, 1].flatMap((i) =>
      [-1, 1].map((j) =>
        box([0.012, 0.006, 0.012], {
          position: [0.196 + i * 0.016, 0.216 + i * 0.013, j * 0.018],
          rotation: [0, 0, -0.72],
          color: PALETTE.raftWoodDeep,
          castShadow: false,
        }),
      ),
    ),

    // 提梁：跨过壶口的一道弯
    ...[-1, 1].map((s) =>
      box([0.016, 0.11, 0.016], {
        position: [s * 0.055, 0.235, 0],
        rotation: [0, 0, s * 0.32],
        color: PALETTE.raftWoodDeep,
      }),
    ),
    box([0.13, 0.016, 0.016], {
      position: [0, 0.288, 0],
      color: PALETTE.raftWoodDeep,
    }),
  ]);
}
