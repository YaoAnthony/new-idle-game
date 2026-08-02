import { Object3D } from "three";
import { on } from "../../Game/EventBus";
import { isAirborne, listDroppedItems } from "../../Game/State/droppedItems";
import { buildItemVisual } from "../Visual/VisualRegistry.js";

/**
 * 地上那些扔出来的东西。
 *
 * 和 CookwareView 一样是"增删走事件、位置每帧读"：飞行中的坐标每帧都在变，
 * 走事件总线会把它刷爆；而增删一天也没几次，值得走事件。
 *
 * 模型直接用 `buildItemVisual`——这就是 V0.4 文档里点名的第三个消费方
 * （手上 / 锅里 / 掉落物）。因为模型的原点统一在底面，这里把实体的 y
 * 直接当世界 y 用就行，不用为"扔出来的东西"再补一套偏移。
 */

/** 飞行时自转的角速度（弧度/秒）。让抛物线看起来是"扔"不是"平移" */
const SPIN_SPEED = 3.4;

type DropView = {
  root: Object3D;
  /** 落地之后停在哪个角度，停了就不再转 */
  spin: number;
};

export class DroppedItemView {
  readonly root = new Object3D();

  private readonly views = new Map<string, DropView>();
  private readonly unsubscribe: () => void;

  constructor() {
    this.root.name = "dropped-items";
    this.unsubscribe = on("dropped_items_changed", () => this.sync());
    this.sync();
  }

  /** 增删对齐。只动差集，已经在场上的不重建 */
  private sync(): void {
    const alive = new Set<string>();

    for (const entity of listDroppedItems()) {
      alive.add(entity.id);
      if (this.views.has(entity.id)) continue;

      const visual = buildItemVisual(entity.stack.itemId);
      // 查不到模型也不该让东西凭空消失——buildItemVisual 已经会给占位方块
      // 并在控制台点名，所以这里拿到 null 只可能是"物品 id 本身是坏的"
      if (!visual) continue;

      const root = new Object3D();
      root.name = `drop:${entity.stack.itemId}`;
      root.add(visual);
      root.position.set(entity.x, entity.y, entity.z);

      this.root.add(root);
      this.views.set(entity.id, { root, spin: 0 });
    }

    for (const [id, view] of this.views) {
      if (alive.has(id)) continue;
      view.root.removeFromParent();
      this.views.delete(id);
    }
  }

  /** 每帧跟位置。飞行中还会自转，落地就停住 */
  update(deltaSeconds: number): void {
    for (const entity of listDroppedItems()) {
      const view = this.views.get(entity.id);
      if (!view) continue;

      view.root.position.set(entity.x, entity.y, entity.z);

      // "还在飞吗"由 State 那边定义，这里不重新推一遍——
      // 停在台面上的东西高度不是 0，自己判会转个没完
      if (isAirborne(entity)) {
        view.spin += SPIN_SPEED * deltaSeconds;
        view.root.rotation.set(view.spin * 0.6, view.spin, 0);
      }
    }
  }

  dispose(): void {
    this.unsubscribe();
  }
}
