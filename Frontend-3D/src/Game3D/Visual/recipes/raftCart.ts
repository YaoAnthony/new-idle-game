import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder, group } from "../primitives.js";

/**
 * 浮筏车——小鱼人拖着的那辆摊子（期 6）。**照用户 2026-08-24 的设计稿。**
 *
 * ## 为什么和小鱼人分开写
 *
 * 稿子把它单列成「车体参考」，配件还摆成模块化的一排。它更像**一件会
 * 跟着他走的家当**，不是身体的一部分——分开之后，"他今天只是路过没出摊"
 * 这种演出也做得出来，而且以后换季节换货照样只改这一个文件。
 *
 * ## 结构照稿子的三视图
 *
 * 下面两根**浮桶**（可在水中拖行的由来）→ 上面一块甲板 → 四根立柱撑起
 * 一顶**防水布蓬**（上面一条白鱼）→ 台面上摆货 → 一角挂**灯笼**、
 * 一边靠**桨**、前面一根**拖绳**、侧面一块**小黑板**。
 *
 * ## 摆的货是"看起来很多"，不是真的库存
 *
 * 台面上那些瓶子、橘子、鱼、木箱是**装饰**，和 `travelerStock` 那份真库存
 * 没有关系（真库存在交易面板里）。理由：库存每趟随机三件，几何跟着变
 * 就得每天重建一次网格；而玩家判断"值不值得过去看看"靠的是摊子满不满，
 * 那是恒定的印象，不该跟着今天抽到什么摇摆。
 */

/*
 * 甲板离地多高。第一版 0.34 让甲板悬在浮桶上方，中间空一截——
 * 浮筏的甲板本来就该压在桶上。0.26 刚好搭住。
 */
const DECK_Y = 0.26;
const DECK_W = 1.55;
const DECK_D = 0.92;

/**
 * 整车缩放。**用根节点统一缩，不是把四十个字面量各乘一遍。**
 *
 * 第一版按上面那些尺寸建出来，车高 1.41 米、小鱼人 0.55 米——他只到车的
 * 三分之一，看着不像"他拖着这辆车"，像"他站在一个摊子旁边"。稿子的整体
 * 透视图里他的头大约在台面高度，全车约他的一点八倍。0.7 对上这个比例。
 *
 * 之所以用根节点：那四十个字面量彼此有几何关系（浮桶半径要托住甲板、
 * 立柱要顶住蓬），逐个乘一遍总会漏掉一两个，而漏掉的地方会裂开。
 */
const CART_SCALE = 0.7;

export function buildRaftCart(): Object3D {
  const parts: Object3D[] = [];

  // ---- 两根浮桶：整辆车的地基，也是"能下水"的全部说明 ----
  for (const side of [-1, 1]) {
    parts.push(
      cylinder(0.17, 0.17, DECK_D * 1.28, 8, {
        position: [side * (DECK_W * 0.33), 0.17, 0],
        rotation: [Math.PI / 2, 0, 0],
        color: PALETTE.raftWoodDeep,
      }),
    );
    // 桶箍：两道浅色的绳，低模里"这是捆起来的"就靠它
    for (const z of [-0.22, 0.22]) {
      parts.push(
        cylinder(0.178, 0.178, 0.05, 8, {
          position: [side * (DECK_W * 0.33), 0.17, z],
          rotation: [Math.PI / 2, 0, 0],
          color: PALETTE.raftRope,
          castShadow: false,
        }),
      );
    }
  }

  // ---- 甲板 ----
  parts.push(
    box([DECK_W, 0.07, DECK_D], { position: [0, DECK_Y, 0], color: PALETTE.raftWood }),
  );
  // 甲板下的两根横梁：把甲板和浮桶接起来，不然像浮在空中
  for (const z of [-DECK_D * 0.32, DECK_D * 0.32]) {
    parts.push(
      box([DECK_W * 0.92, 0.06, 0.08], {
        position: [0, DECK_Y - 0.06, z],
        color: PALETTE.raftWoodDeep,
      }),
    );
  }

  // ---- 台面围栏：三面矮挡板，正面敞开好取货 ----
  parts.push(
    box([DECK_W, 0.16, 0.06], {
      position: [0, DECK_Y + 0.11, -DECK_D / 2 + 0.03],
      color: PALETTE.raftWood,
    }),
  );
  for (const side of [-1, 1]) {
    parts.push(
      box([0.06, 0.16, DECK_D], {
        position: [side * (DECK_W / 2 - 0.03), DECK_Y + 0.11, 0],
        color: PALETTE.raftWood,
      }),
    );
  }

  // ---- 四根立柱 + 布蓬 ----
  const postH = 0.72;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(
        box([0.055, postH, 0.055], {
          position: [
            sx * (DECK_W / 2 - 0.07),
            DECK_Y + postH / 2 + 0.035,
            sz * (DECK_D / 2 - 0.07),
          ],
          color: PALETTE.raftWood,
        }),
      );
    }
  }
  const canopyY = DECK_Y + postH + 0.035;
  /*
   * 布蓬是**两片斜坡**，和家具小店的屋顶同一套做法（坡向左右、
   * 绕 Z 转、外低内高——那边把符号写反过一次，这里直接用对的）。
   */
  const canopyRise = 0.26;
  const canopyHalf = DECK_W / 2 + 0.1;
  const slope = Math.hypot(canopyHalf, canopyRise);
  const pitch = Math.atan2(canopyRise, canopyHalf);
  for (const dir of [1, -1]) {
    parts.push(
      box([slope, 0.045, DECK_D + 0.24], {
        position: [(dir * canopyHalf) / 2, canopyY + canopyRise / 2, 0],
        rotation: [0, 0, -dir * pitch],
        color: PALETTE.raftCanvas,
      }),
    );
  }
  // 蓬顶那条脊
  parts.push(
    box([0.06, 0.05, DECK_D + 0.26], {
      position: [0, canopyY + canopyRise + 0.02, 0],
      color: PALETTE.raftWood,
    }),
  );
  // 布蓬上那条白鱼（稿子上正面那个标记）
  parts.push(
    blob(0.075, 0, {
      position: [0.1, canopyY + canopyRise * 0.5, DECK_D / 2 + 0.09],
      scale: [1.5, 0.72, 0.18],
      color: "#f2f0e6",
      castShadow: false,
    }),
  );
  parts.push(
    cylinder(0.0, 0.055, 0.08, 3, {
      position: [-0.03, canopyY + canopyRise * 0.5, DECK_D / 2 + 0.09],
      rotation: [Math.PI / 2, 0, Math.PI / 2],
      scale: [1, 0.18, 1],
      color: "#f2f0e6",
      castShadow: false,
    }),
  );

  // ---- 台面上的货（装饰，不是真库存，见文件头）----
  // 一排瓶子
  for (let i = 0; i < 4; i += 1) {
    parts.push(
      cylinder(0.022, 0.026, 0.11, 6, {
        position: [-DECK_W / 2 + 0.18 + i * 0.07, DECK_Y + 0.09, -0.16],
        color: i % 2 === 0 ? "#6f9c7a" : "#8fb0bd",
      }),
    );
  }
  // 一箱橘子
  parts.push(
    box([0.3, 0.12, 0.24], {
      position: [0.28, DECK_Y + 0.095, -0.06],
      color: PALETTE.raftWoodDeep,
    }),
  );
  for (let i = 0; i < 5; i += 1) {
    parts.push(
      blob(0.032, 0, {
        position: [0.17 + (i % 3) * 0.11, DECK_Y + 0.175, -0.13 + Math.floor(i / 3) * 0.12],
        color: "#e08a4a",
        castShadow: false,
      }),
    );
  }
  // 一筐鱼
  parts.push(
    box([0.26, 0.09, 0.2], {
      position: [-0.34, DECK_Y + 0.08, 0.14],
      color: PALETTE.raftWoodDeep,
    }),
  );
  for (const dx of [-0.06, 0.02, 0.08]) {
    parts.push(
      blob(0.035, 0, {
        position: [-0.34 + dx, DECK_Y + 0.14, 0.14],
        scale: [1.8, 0.6, 0.55],
        color: "#8fb0bd",
        castShadow: false,
      }),
    );
  }

  /*
   * 一角挂的灯笼。装成一个**独立节点**并把引用留住——它要摆动，
   * 而"从 parts 数组倒数第几个"那种找法，往台面上多摆一箱货就错位了。
   */
  const lantern = new Object3D();
  lantern.name = "lantern";
  lantern.position.set(DECK_W / 2 - 0.07, canopyY - 0.02, DECK_D / 2 + 0.06);
  lantern.add(
    box([0.03, 0.03, 0.1], { position: [0, 0, -0.03], color: PALETTE.raftWood }),
  );
  lantern.add(
    box([0.13, 0.03, 0.13], { position: [0, -0.035, 0.03], color: PALETTE.raftWoodDeep }),
  );
  lantern.add(
    box([0.11, 0.13, 0.11], {
      position: [0, -0.11, 0.03],
      color: PALETTE.raftLantern,
      castShadow: false,
    }),
  );
  parts.push(lantern);

  // ---- 侧面靠着的桨 ----
  parts.push(
    cylinder(0.018, 0.018, 0.72, 6, {
      position: [-DECK_W / 2 - 0.06, 0.38, -0.1],
      rotation: [0, 0, 0.22],
      color: PALETTE.raftWood,
    }),
  );
  parts.push(
    blob(0.07, 0, {
      position: [-DECK_W / 2 - 0.15, 0.06, -0.1],
      scale: [0.9, 0.28, 1.5],
      color: PALETTE.raftWoodDeep,
    }),
  );

  /*
   * 车头那根拖绳。**只做短短一截垂下来，不假装连到人身上**。
   *
   * 第一版拉了两段往前伸，结果是两根飘在地上的棍——绳的另一头是小鱼人，
   * 而他是个独立对象、位置每帧在变，几何上根本接不住。做成"挂在车头的
   * 一截绳 + 一个环"就没有这个问题：它自己是完整的，观众自己会脑补。
   */
  parts.push(
    box([0.055, 0.05, 0.24], {
      position: [0, DECK_Y - 0.03, DECK_D / 2 + 0.1],
      rotation: [0.55, 0, 0],
      color: PALETTE.raftRope,
      castShadow: false,
    }),
  );
  // 末端一个小环：绳子有个头，才不像半截断掉的棍
  parts.push(
    cylinder(0.055, 0.055, 0.03, 8, {
      position: [0, DECK_Y - 0.15, DECK_D / 2 + 0.19],
      rotation: [1.3, 0, 0],
      color: PALETTE.raftRope,
      openEnded: true,
      doubleSide: true,
      castShadow: false,
    }),
  );

  // ---- 侧面的小黑板 ----
  parts.push(
    box([0.05, 0.34, 0.28], {
      position: [DECK_W / 2 + 0.05, DECK_Y + 0.2, -0.18],
      rotation: [0, 0, 0.1],
      color: PALETTE.raftWoodDeep,
    }),
  );
  parts.push(
    box([0.02, 0.26, 0.21], {
      position: [DECK_W / 2 + 0.09, DECK_Y + 0.2, -0.18],
      rotation: [0, 0, 0.1],
      color: "#3f5560",
      castShadow: false,
    }),
  );

  const cart = group("raft-cart", parts);
  cart.scale.setScalar(CART_SCALE);

  /*
   * 摊子也接 `animate`：**灯笼要晃**。一辆完全静止的车在会呼吸的生物旁边
   * 会显得像块布景——一个慢慢摆的灯笼就够把它拉回"这是刚停下的车"。
   */
  let elapsed = 0;
  cart.userData.animate = (dt: number): void => {
    elapsed += dt;
    lantern.rotation.z = Math.sin(elapsed * 1.1) * 0.13;
  };

  return cart;
}
