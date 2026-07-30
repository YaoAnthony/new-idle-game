import { HeatBand, PlacementSurface } from "core";
import { Object3D, type Camera, type Mesh, type MeshLambertMaterial } from "three";
import { on } from "../../Game/EventBus";
import {
  getSlotHeat,
  listKitchenSlots,
  type KitchenSlotRef,
} from "../../Game/Systems/kitchen";
import { getDefinition, getWorld } from "../../Game/State/worldRuntime";
import { PALETTE, color } from "../Visual/palette.js";
import { blob, box } from "../Visual/primitives.js";
import {
  COOKWARE_CONTENT_ANCHOR,
  COOKWARE_CONTENT_RADIUS,
  ingredientColor,
} from "../Visual/recipes/cookware.js";
import { buildVisual } from "../Visual/VisualRegistry.js";
import { slotWorldPosition } from "./FurnitureView.js";

/**
 * 槽位上的容器：锅本体 + 锅里的内容 + 头顶的火候条。
 *
 * 和 FurnitureView 分开是因为它的重建频率完全不同——家具一天动不了几次，
 * 锅里的东西每次投料都变。这里订阅 kitchen_changed 重建模型，
 * 火候条则每帧直接读状态（进度每帧都在动，走事件会把总线刷爆）。
 */

const BAND_COLOR: Record<HeatBand, string> = {
  [HeatBand.Raw]: PALETTE.heatRaw,
  [HeatBand.Undercooked]: PALETTE.heatUndercooked,
  [HeatBand.Perfect]: PALETTE.heatPerfect,
  [HeatBand.Overcooked]: PALETTE.heatOvercooked,
};

const BAR_WIDTH = 0.62;
const BAR_HEIGHT = 0.075;

type SlotView = {
  root: Object3D;
  bar: Object3D;
  /** 火候条的填充块，每帧只改 scale.x 和颜色，不重建几何体 */
  fill: Mesh;
  material: MeshLambertMaterial;
  /** 上一次画的内容摘要，变了才重建模型 */
  signature: string;
};

export class CookwareView {
  readonly root = new Object3D();

  private readonly views = new Map<string, SlotView>();
  private readonly unsubscribe: () => void;

  constructor(private readonly size: { width: number; depth: number }) {
    this.root.name = "cookware";
    this.unsubscribe = on("kitchen_changed", () => this.sync());
    this.sync();
  }

  private key(ref: KitchenSlotRef): string {
    return `${ref.instanceId}:${ref.slotId}`;
  }

  /**
   * 内容摘要。锅本体、锅里装的东西、有没有匹配到配方——
   * 任何一样变了就要重建模型；只有火候在走时不需要重建。
   */
  private signatureOf(ref: KitchenSlotRef): string {
    const container = ref.content?.container;
    const items = (container?.items ?? [])
      .map((item) => `${item.itemId}x${item.quantity}`)
      .join(",");
    return `${ref.content?.itemId ?? "-"}|${items}`;
  }

  private sync(): void {
    const alive = new Set<string>();

    for (const ref of listKitchenSlots()) {
      if (!ref.content) continue;

      const key = this.key(ref);
      alive.add(key);

      const existing = this.views.get(key);
      if (existing && existing.signature === this.signatureOf(ref)) continue;

      if (existing) {
        existing.root.removeFromParent();
        this.views.delete(key);
      }

      const view = this.spawn(ref);
      if (view) {
        this.views.set(key, view);
        this.root.add(view.root);
      }
    }

    for (const [key, view] of this.views) {
      if (alive.has(key)) continue;
      view.root.removeFromParent();
      this.views.delete(key);
    }
  }

  private spawn(ref: KitchenSlotRef): SlotView | null {
    if (!ref.content) return null;

    const placed = getWorld().placedFurniture.find(
      (item) => item.instanceId === ref.instanceId,
    );
    if (!placed || placed.placement.kind !== PlacementSurface.Floor) return null;

    const definition = getDefinition(placed.furnitureId);
    if (!definition) return null;

    // 容器的 visualId 就是它的物品 id（厨具不是家具，没有 FurnitureDefinition）
    const ware = buildVisual(ref.content.itemId);
    if (!ware) return null;

    const world = slotWorldPosition(
      placed.placement,
      definition.footprint,
      ref.slot.offset,
      this.size,
    );

    const root = new Object3D();
    root.name = `cookware:${this.key(ref)}`;
    root.position.set(world.x, world.y, world.z);
    root.rotation.y = 0;
    root.add(ware);

    for (const mesh of this.buildContents(ref)) root.add(mesh);

    const { bar, fill, material } = this.buildHeatBar(ref);
    root.add(bar);

    return { root, bar, fill, material, signature: this.signatureOf(ref) };
  }

  /** 锅里的内容：一坨一坨的低面数团子，按份数在锅口内错开摆 */
  private buildContents(ref: KitchenSlotRef): Object3D[] {
    const container = ref.content?.container;
    if (!ref.content || !container || container.items.length === 0) return [];

    const anchor = COOKWARE_CONTENT_ANCHOR[ref.content.itemId] ?? 0.2;
    const radius = COOKWARE_CONTENT_RADIUS[ref.content.itemId] ?? 0.25;

    // 展开成每份一颗，这样"两份番茄"看起来真的是两坨
    const portions = container.items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => item.itemId),
    );

    return portions.map((itemId, index) => {
      // 螺旋排布：第一颗在正中，之后绕着中心散开，不会全堆在一点
      const angle = index * 2.4;
      const spread = portions.length === 1 ? 0 : radius * 0.6;
      return blob(0.085, 0, {
        color: ingredientColor(itemId),
        position: [
          Math.cos(angle) * spread,
          anchor + 0.04 + Math.floor(index / 3) * 0.05,
          Math.sin(angle) * spread,
        ],
      });
    });
  }

  /**
   * 火候条：浮在锅上方的一条。四色由 Core 的 HeatBand 决定，
   * 这里只负责把颜色和长度画出来。
   */
  private buildHeatBar(ref: KitchenSlotRef): {
    bar: Object3D;
    fill: Mesh;
    material: MeshLambertMaterial;
  } {
    const anchor = COOKWARE_CONTENT_ANCHOR[ref.content?.itemId ?? ""] ?? 0.2;
    const bar = new Object3D();
    bar.position.set(0, anchor + 0.5, 0);
    bar.visible = false;

    const back = box([BAR_WIDTH + 0.05, BAR_HEIGHT + 0.04, 0.02], {
      color: PALETTE.ironDark,
      castShadow: false,
      receiveShadow: false,
    });

    // 传 Color 对象（而不是字符串）走的是 ownMaterial 分支：
    // 四色是逐锅变化的，共享缓存材质会把别人的锅一起染色
    const fill = box([BAR_WIDTH, BAR_HEIGHT, 0.01], {
      color: color(PALETTE.heatRaw),
      position: [0, 0, 0.02],
      castShadow: false,
      receiveShadow: false,
    });

    // 从左端开始长：把几何体原点挪到左边缘，再靠 scale.x 拉长
    fill.geometry.translate(BAR_WIDTH / 2, 0, 0);
    fill.position.x = -BAR_WIDTH / 2;

    bar.add(back);
    bar.add(fill);
    return { bar, fill, material: fill.material as MeshLambertMaterial };
  }

  /** 每帧：刷新火候条的长度、颜色和朝向（始终正对镜头） */
  update(camera: Camera): void {
    for (const ref of listKitchenSlots()) {
      const view = this.views.get(this.key(ref));
      if (!view) continue;

      const heat = getSlotHeat(ref);
      view.bar.visible = heat !== null;
      if (!heat) continue;

      view.bar.quaternion.copy(camera.quaternion);
      view.fill.scale.x = Math.max(0.001, heat.fill);
      view.material.color.set(BAND_COLOR[heat.band]);
    }
  }

  dispose(): void {
    this.unsubscribe();
  }
}
