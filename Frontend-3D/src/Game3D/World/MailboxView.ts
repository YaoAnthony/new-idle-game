import { Object3D } from "three";
import { PALETTE } from "../Visual/palette";
import { box, cylinder, disposeTree } from "../Visual/primitives";

/**
 * 门口的信箱（居民系统 10）：一根杆、一只箱、一面旗——旗子立着 = 有没拆的信。
 * 固定布景不是家具（不占格、不可搬、noCollide）。**占位造型**：参考图到了再换，
 * 接口只有 `setFlag`。
 */
export class MailboxView {
  readonly root = new Object3D();
  private readonly flag: Object3D;

  constructor(x: number, y: number, z: number, facing: number) {
    this.root.name = "mailbox";
    this.root.position.set(x, y, z);
    this.root.rotation.y = facing;
    this.root.userData.noCollide = true;
    const pole = cylinder(0.05, 0.06, 1.0, 6, { color: PALETTE.shopWood, position: [0, 0.5, 0] });
    const body = box([0.46, 0.34, 0.3], { color: "#c8553d", position: [0, 1.15, 0] });
    const lid = box([0.5, 0.06, 0.34], { color: "#8f3a2a", position: [0, 1.35, 0], castShadow: false });
    const slot = box([0.28, 0.03, 0.02], { color: "#3a2a20", position: [0, 1.2, 0.16], castShadow: false });
    this.flag = new Object3D();
    this.flag.position.set(0.26, 1.28, 0);
    const stick = box([0.03, 0.22, 0.03], { color: PALETTE.woodMid, position: [0, -0.06, 0], castShadow: false });
    const cloth = box([0.03, 0.12, 0.16], { color: "#f2c14e", position: [0, 0.0, 0.08], castShadow: false });
    this.flag.add(stick, cloth);
    for (const part of [pole, body, lid, slot, this.flag]) {
      part.traverse((child) => {
        child.userData.noCollide = true;
      });
      this.root.add(part);
    }
    this.setFlag(false);
  }

  /** 旗子：立着 = 有新信；放下 = 都看过了 */
  setFlag(up: boolean): void {
    this.flag.rotation.x = up ? 0 : Math.PI / 2;
  }

  dispose(): void {
    disposeTree(this.root);
  }
}
