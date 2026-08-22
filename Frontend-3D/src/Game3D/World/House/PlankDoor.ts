import { Object3D } from "three";
import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box, group } from "../../Visual/primitives.js";
import type { WindowAnchor } from "./HouseBuilder.js";

/**
 * 女巫小屋的木板门 + 小雨棚（2026-08-22）。
 *
 * ## 为什么不用 DoorView
 *
 * DoorView 是引き戸——两扇滑进墙里，是和风那栋的语言。参考图上的门是
 * **五块竖板钉两条横档的平开门**，合页在左、往外开。之前和风版弃用
 * 平开门的理由是"门板扫到门廊柱子"，女巫小屋没有门廊（只有一片
 * 1.4 宽的小雨棚挂在墙上，柱子是零），这个顾虑不存在。
 *
 * ## 接口
 *
 * 和 DoorView 一样：`root` / `setOpen` / `update`。RoomScene 只按这三样
 * 驱动门板，`doorsRuntime` 一行不改——开门的**规则**在逻辑层，这里只管
 * 它长什么样、怎么转。
 *
 * ## 坐标
 *
 * root 放在门洞中心、`lookAt` 屋内方向，所以局部 +Z 指屋里、−Z 指屋外。
 * 合页挂在局部 −X（从屋外看是左边），门板绕它转；往外开 = 绕 Y 负转。
 */

const PLANKS = 5;
const LEAF_THICKNESS = 0.08;
/** 开到多少度就停（弧度）。开太大门板会贴到外墙皮上，100° 正好斜着让路 */
const OPEN_ANGLE = -Math.PI * 0.56;

export class PlankDoor {
  readonly root: Object3D;

  private readonly hinge: Object3D;
  private open = false;
  private swing = 0;

  constructor(anchor: WindowAnchor) {
    this.root = new Object3D();
    this.root.name = `door-${anchor.openingId}`;
    this.root.position.set(...anchor.center);

    const [nx, , nz] = anchor.inward;
    this.root.lookAt(anchor.center[0] + nx, anchor.center[1], anchor.center[2] + nz);

    const w = anchor.width;
    const h = anchor.height * 0.98;
    const leafW = w - 0.08;
    const leafH = h - 0.06;

    // ---- 门框：左右立梃 + 上槛。门槛不要（视觉上会绊脚）----
    this.root.add(
      box([w + 0.12, 0.1, LEAF_THICKNESS * 2], { color: PALETTE.woodDark, position: [0, h / 2 + 0.02, 0] }),
      box([0.1, h, LEAF_THICKNESS * 2], { color: PALETTE.woodDark, position: [-w / 2 - 0.02, 0, 0] }),
      box([0.1, h, LEAF_THICKNESS * 2], { color: PALETTE.woodDark, position: [w / 2 + 0.02, 0, 0] }),
    );

    // ---- 门板：合页节点在左沿，门板整体向 +X 伸出 ----
    this.hinge = new Object3D();
    this.hinge.name = "hinge";
    this.hinge.position.set(-leafW / 2, 0, 0);
    const leaf: Object3D[] = [];
    const plankW = leafW / PLANKS;
    for (let i = 0; i < PLANKS; i += 1) {
      leaf.push(
        box([plankW - 0.015, leafH, LEAF_THICKNESS], {
          color: jitterShade(PALETTE.woodMid, i, 3, 0.07),
          position: [plankW * (i + 0.5), 0, 0],
        }),
      );
    }
    // 两条横档（屋外那面）+ 一道斜撑，木板门的骨架
    for (const dy of [leafH * 0.3, -leafH * 0.3]) {
      leaf.push(
        box([leafW - 0.06, 0.14, 0.04], {
          color: PALETTE.woodDark,
          position: [leafW / 2, dy, -LEAF_THICKNESS / 2 - 0.02],
        }),
      );
    }
    leaf.push(
      box([leafH * 0.6 * 1.15, 0.1, 0.035], {
        color: PALETTE.woodDark,
        position: [leafW / 2, 0, -LEAF_THICKNESS / 2 - 0.02],
        rotation: [0, 0, Math.atan2(leafH * 0.6, leafW - 0.06)],
      }),
    );
    // 铁件：两片合页带 + 一个门环，深铁色把"门"从"墙"里点出来
    for (const dy of [leafH * 0.3, -leafH * 0.3]) {
      leaf.push(
        box([leafW * 0.4, 0.06, 0.02], {
          color: "#3a3633",
          position: [leafW * 0.2 + 0.02, dy, -LEAF_THICKNESS / 2 - 0.05],
          castShadow: false,
        }),
      );
    }
    leaf.push(
      box([0.12, 0.12, 0.05], {
        color: "#3a3633",
        position: [leafW - 0.2, -0.05, -LEAF_THICKNESS / 2 - 0.04],
        castShadow: false,
      }),
    );
    this.hinge.add(group("leaf", leaf));
    this.root.add(this.hinge);

    // ---- 小雨棚：门上方一片斜木瓦 + 两根斜撑。挂在墙外（局部 −Z）----
    const awningW = w + 0.6;
    const awningD = 0.9;
    const awningY = h / 2 + 0.55;
    const awning = new Object3D();
    awning.name = "awning";
    const tilt = 0.5;
    awning.add(
      box([awningW, 0.08, awningD], {
        color: "#6b5b48",
        position: [0, awningY, -awningD / 2 - 0.02],
        rotation: [-tilt, 0, 0],
      }),
    );
    // 木瓦条：三排，压在棚面上
    for (let r = 0; r < 3; r += 1) {
      const d = (r + 0.5) * (awningD / 3);
      awning.add(
        box([awningW + 0.02, 0.05, awningD / 3 + 0.04], {
          color: jitterShade("#7a6a55", r, 9, 0.06),
          position: [0, awningY + 0.05 + Math.sin(tilt) * (awningD / 2 - d), -0.02 - Math.cos(tilt) * d],
          rotation: [-tilt, 0, 0],
        }),
      );
    }
    for (const side of [-1, 1]) {
      awning.add(
        box([0.08, 0.08, awningD * 0.95], {
          color: PALETTE.woodDark,
          position: [side * (awningW / 2 - 0.1), awningY - awningD * 0.3, -awningD * 0.38],
          rotation: [-Math.PI / 4, 0, 0],
        }),
      );
    }
    this.root.add(awning);
  }

  setOpen(open: boolean): void {
    this.open = open;
  }

  update(deltaSeconds: number): void {
    const target = this.open ? 1 : 0;
    const smoothing = 1 - Math.exp(-6 * deltaSeconds);
    this.swing += (target - this.swing) * smoothing;
    this.hinge.rotation.y = OPEN_ANGLE * this.swing;
  }
}
