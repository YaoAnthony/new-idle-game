import { HeatBand, PlacementSurface } from "core";
import {
  Object3D,
  PointLight,
  type Camera,
  type Mesh,
  type MeshLambertMaterial,
} from "three";
import { on } from "../../Game/EventBus";
import {
  getSlotHeat,
  isSlotCooking,
  listKitchenSlots,
  type KitchenSlotRef,
} from "../../Game/Systems/kitchen";
import { getDefinition, getWorld } from "../../Game/State/worldRuntime";
import { PALETTE, color } from "../Visual/palette.js";
import { box, cylinder } from "../Visual/primitives.js";
import {
  COOKWARE_CONTENT_ANCHOR,
  COOKWARE_CONTENT_RADIUS,
} from "../Visual/recipes/cookware.js";
import {
  buildItemVisual,
  buildPortionVisual,
} from "../Visual/VisualRegistry.js";
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

/** 火苗抖动的快慢。太快像电流，太慢像在呼吸 */
const FLAME_SPEED = 9;
/** 一颗火星从生到灭走完一轮要多久（每秒几轮） */
const SPARK_SPEED = 0.55;
/** 火星飘多高就消失 */
const SPARK_RISE = 0.42;

type SlotView = {
  root: Object3D;
  bar: Object3D;
  /** 火候条的填充块，每帧只改 scale.x 和颜色，不重建几何体 */
  fill: Mesh;
  material: MeshLambertMaterial;
  /** 上一次画的内容摘要，变了才重建模型 */
  signature: string;
  /** 灶火整体。只在这个槽位真的在加热时显示 */
  flame: Object3D;
  /** 火苗本体，每帧抖动 */
  tongues: Mesh[];
  /** 上升的火星。每颗自己走一个 0→1 的循环 */
  sparks: Mesh[];
  light: PointLight;
};

export class CookwareView {
  readonly root = new Object3D();

  private readonly views = new Map<string, SlotView>();
  private readonly unsubscribe: () => void;
  /** 火苗和火星的动画时钟。全局一份，几个灶眼靠各自的相位错开 */
  private elapsed = 0;

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

    const ware = buildItemVisual(ref.content.itemId);
    if (!ware) return null;

    const world = slotWorldPosition(
      placed.placement,
      definition.placement.footprint,
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

    const { flame, tongues, sparks, light } = this.buildFlame();
    root.add(flame);

    return {
      root,
      bar,
      fill,
      material,
      signature: this.signatureOf(ref),
      flame,
      tongues,
      sparks,
      light,
    };
  }

  /**
   * 灶火。锅底下一圈火苗 + 往上飘的火星 + 一盏暖光。
   *
   * 建在**槽位**上而不是锅上：火是灶眼给的，锅端走了火也该还在
   * （虽然现在没锅就不建这个视图，但语义上别搞反）。
   *
   * 火苗不用粒子系统：这里最多同时烧三个灶眼，几个小锥体每帧改
   * scale 和 position 就够了，上一套粒子系统的代价远大于收益。
   */
  private buildFlame(): {
    flame: Object3D;
    tongues: Mesh[];
    sparks: Mesh[];
    light: PointLight;
  } {
    const flame = new Object3D();
    flame.name = "burner-flame";
    flame.visible = false;
    // 锅底略往下：火苗从锅沿外侧舔上来，正好露出来一截
    flame.position.y = -0.02;

    // 一圈火苗。内圈偏黄、外圈偏橙，两层叠出层次
    const tongues = [0, 1, 2, 3, 4, 5].map((index) => {
      const angle = (index / 6) * Math.PI * 2;
      const outer = index % 2 === 0;
      const radius = outer ? 0.2 : 0.13;

      const tongue = cylinder(0.001, outer ? 0.055 : 0.042, outer ? 0.17 : 0.13, 5, {
        color: color(outer ? PALETTE.emberOrange : PALETTE.heatPerfect),
        position: [
          Math.cos(angle) * radius,
          (outer ? 0.17 : 0.13) / 2,
          Math.sin(angle) * radius,
        ],
        castShadow: false,
        receiveShadow: false,
      });
      const material = tongue.material as MeshLambertMaterial;
      material.emissive.set(outer ? PALETTE.emberOrange : PALETTE.heatPerfect);
      material.emissiveIntensity = 1;
      material.transparent = true;
      material.opacity = 0.88;
      flame.add(tongue);
      return tongue;
    });

    // 火星：小方块，从火里往上飘，到顶就回到起点
    const sparks = [0, 1, 2, 3, 4].map((index) => {
      const spark = box([0.025, 0.025, 0.025], {
        color: color(PALETTE.emberOrange),
        castShadow: false,
        receiveShadow: false,
      });
      const material = spark.material as MeshLambertMaterial;
      material.emissive.set(PALETTE.emberOrange);
      material.transparent = true;
      spark.userData.phase = index / 5;
      spark.userData.angle = index * 1.9;
      flame.add(spark);
      return spark;
    });

    // 一盏小暖光：夜里灶台该把周围照亮一圈，光才是"真的在烧"
    const light = new PointLight(PALETTE.emberOrange, 0, 2.4, 2);
    light.position.y = 0.18;
    flame.add(light);

    return { flame, tongues, sparks, light };
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

    return portions.flatMap((itemId, index) => {
      // 和手上端着的那份走同一个入口，锅里和手上不会长得不一样
      const portion = buildPortionVisual(itemId);
      if (!portion) return [];

      // 螺旋排布：第一颗在正中，之后绕着中心散开，不会全堆在一点
      const angle = index * 2.4;
      const spread = portions.length === 1 ? 0 : radius * 0.6;

      portion.position.set(
        Math.cos(angle) * spread,
        anchor + Math.floor(index / 3) * 0.05,
        Math.sin(angle) * spread,
      );
      // 同一份食材每次朝向不同，几颗堆在一起才不像复制粘贴
      portion.rotation.y = angle;
      return [portion];
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

  /** 每帧：刷新火候条和灶火。火候条始终正对镜头 */
  update(camera: Camera, deltaSeconds: number): void {
    this.elapsed += deltaSeconds;

    for (const ref of listKitchenSlots()) {
      const view = this.views.get(this.key(ref));
      if (!view) continue;

      // 火跟的是"这个灶眼在不在加热"，和火候条是两回事：
      // 端到普通台面上的锅仍然有火候条（进度停着），但不该有火
      this.updateFlame(view, isSlotCooking(ref));

      const heat = getSlotHeat(ref);
      view.bar.visible = heat !== null;
      if (!heat) continue;

      view.bar.quaternion.copy(camera.quaternion);
      view.fill.scale.x = Math.max(0.001, heat.fill);
      view.material.color.set(BAND_COLOR[heat.band]);
    }
  }

  private updateFlame(view: SlotView, burning: boolean): void {
    view.flame.visible = burning;
    if (!burning) {
      view.light.intensity = 0;
      return;
    }

    const t = this.elapsed;

    // 火苗抖动：每根自己一个相位，否则六根一起缩放像在呼吸
    view.tongues.forEach((tongue, index) => {
      const wobble = Math.sin(t * FLAME_SPEED + index * 1.7);
      tongue.scale.y = 1 + wobble * 0.28;
      tongue.scale.x = tongue.scale.z = 1 + wobble * -0.1;
    });

    // 火星：0→1 往上走，越高越淡，到顶回到底部重新来
    view.sparks.forEach((spark) => {
      const phase = ((t * SPARK_SPEED + spark.userData.phase) % 1 + 1) % 1;
      const angle = spark.userData.angle + phase * 1.2;
      const radius = 0.06 + phase * 0.09;

      spark.position.set(
        Math.cos(angle) * radius,
        0.1 + phase * SPARK_RISE,
        Math.sin(angle) * radius,
      );
      const material = spark.material as MeshLambertMaterial;
      material.opacity = 1 - phase;
      spark.scale.setScalar(1 - phase * 0.55);
    });

    // 光跟着火苗一起忽明忽暗，幅度小一点，不然整屋灯在闪
    view.light.intensity = 0.9 + Math.sin(t * FLAME_SPEED * 0.7) * 0.25;
  }

  dispose(): void {
    this.unsubscribe();
  }
}
