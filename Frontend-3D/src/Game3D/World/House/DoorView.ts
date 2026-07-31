import { Object3D } from "three";
import { PALETTE } from "../../Visual/palette.js";
import { box, cylinder, group } from "../../Visual/primitives.js";
import type { WindowAnchor } from "./HouseBuilder.js";

/**
 * 门。没有门板时，门洞会直接透出场景背景色，看起来像墙破了个方洞。
 *
 * 门板嵌在洞口里，比洞口略小一圈露出门框。支持开合动画——
 * 宠物派遣出门时推开门走出去（V0.2 的"仪式感"）。
 */
export class DoorView {
  readonly root: Object3D;

  private readonly panel: Object3D;
  private open = false;
  private angle = 0;

  constructor(anchor: WindowAnchor) {
    this.root = new Object3D();
    this.root.name = `door-${anchor.openingId}`;
    this.root.position.set(...anchor.center);

    const [nx, , nz] = anchor.inward;
    this.root.lookAt(
      anchor.center[0] + nx,
      anchor.center[1],
      anchor.center[2] + nz,
    );

    const w = anchor.width * 0.92;
    const h = anchor.height * 0.96;

    // 合页在左侧：门板挂在一个偏移的枢轴上，转动枢轴就是开门
    const pivot = new Object3D();
    pivot.position.x = -w / 2;

    const plank = box([w, h, 0.09], {
      color: PALETTE.woodMid,
      position: [w / 2, 0, 0],
    });

    const railTop = box([w * 0.86, 0.12, 0.11], {
      color: PALETTE.woodDark,
      position: [w / 2, h * 0.3, 0],
    });
    const railBottom = box([w * 0.86, 0.12, 0.11], {
      color: PALETTE.woodDark,
      position: [w / 2, -h * 0.3, 0],
    });

    const knob = cylinder(0.05, 0.05, 0.1, 8, {
      color: PALETTE.brass ?? "#c9a35c",
      position: [w * 0.84, -0.05, 0.08],
      rotation: [Math.PI / 2, 0, 0],
    });

    this.panel = group("door-panel", [plank, railTop, railBottom, knob]);
    pivot.add(this.panel);
    this.root.add(pivot);
    this.panel.parent!.name = "door-pivot";
  }

  setOpen(open: boolean): void {
    this.open = open;
  }

  update(deltaSeconds: number): void {
    const target = this.open ? -Math.PI * 0.62 : 0;
    const smoothing = 1 - Math.exp(-6 * deltaSeconds);
    this.angle += (target - this.angle) * smoothing;

    const pivot = this.panel.parent;
    if (pivot) pivot.rotation.y = this.angle;
  }
}
