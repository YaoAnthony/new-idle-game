import { findItemDefinition } from "core";
import { Object3D } from "three";
import { on } from "../../Game/EventBus";
import { getHeld } from "../../Game/State/heldItem";
import {
  COOKWARE_CONTENT_ANCHOR,
  COOKWARE_CONTENT_RADIUS,
} from "../Visual/recipes/cookware.js";
import {
  buildItemVisual,
  buildPortionVisual,
} from "../Visual/VisualRegistry.js";

/**
 * 手上端着的东西的 3D 表现。
 *
 * 在这之前手持物**只有右下角一张 2D 卡片**：从背包或者灶眼把锅拿到手上，
 * 世界里那口锅就没了，看起来像"锅被吃掉了"。状态一直是对的
 * （held 在、存档也存），缺的纯粹是表现。
 *
 * 和 CookwareView 分开：那边画的是**槽位上**的锅，位置由家具槽位决定、
 * 重建时机是 kitchen_changed；这边挂在角色骨架上、跟着 held_changed 走。
 * 硬合成一个类的话，两套完全不同的定位和生命周期会缠在一起。
 */

/**
 * 端在手上时整体缩一点，**对所有东西一视同仁**。
 *
 * 试过去掉它（让食材自己定尺寸），结果炒锅在手上有 114 厘米宽——
 * 比角色的脑袋还大一倍。锅碗本来就是按"架在灶眼上"的比例建的，
 * 那个尺寸捧在一个头身比 1:2 的小人身前必然过大，
 * 而这个缩放正是为它们存在的。食材偏小的问题在食材那边解决（FOOD_SCALE）。
 */
const HELD_SCALE = 0.72;

/**
 * 举过头顶拿的东西（`ItemDefinition.carry === "overhead"`，现在只有伞）挂在哪、多大。
 * 这一类不吃上面那个捧在身前的缩放。
 *
 * **写成相对 heldAnchor 的偏移**：本地手持和联机别人看到的都挂在 heldAnchor 上，
 * 两边就不用各认一个挂点。heldAnchor 在 body 上 (0, 0.16, 0.34)（body 原点在胯部）。
 *
 * 伞的造型原点在伞柄，伞面中心在柄上 0.86、半径 0.42（按 1 米高的居民定的）；
 * 角色头顶离胯 1.08。柄放到身体右侧 0.2、离胯 0.38（相对 heldAnchor 就是
 * 0.22 高、往回收 0.28），放大 1.15，伞面下沿才在头顶之上；朝头那边歪 0.14 弧度，
 * 伞面罩在头顶正上方而不是右肩上。
 */
export const OVERHEAD_CARRY = {
  x: 0.2,
  y: 0.22,
  z: -0.28,
  tilt: 0.14,
  scale: 1.15,
};

/**
 * "手上端着的东西"的完整造型（含锅里的内容），缩放和挂法已按手持调好。
 * 本地的 HeldItemView 和联机的 RemotePlayersView 共用——两边各画一份的话，
 * 迟早出现"自己看是一锅汤、别人看是空锅"。找不到造型返回 null。
 */
export function buildHeldVisual(
  itemId: string,
  containerItems?: ReadonlyArray<{ itemId: string; quantity: number }>,
): Object3D | null {
  const visual = buildItemVisual(itemId);
  if (!visual) return null;

  const root = new Object3D();
  root.name = `held:${itemId}`;
  if (findItemDefinition(itemId)?.carry === "overhead") {
    root.position.set(OVERHEAD_CARRY.x, OVERHEAD_CARRY.y, OVERHEAD_CARRY.z);
    root.rotation.z = OVERHEAD_CARRY.tilt;
    root.scale.setScalar(OVERHEAD_CARRY.scale);
  } else {
    root.scale.setScalar(HELD_SCALE);
  }
  root.add(visual);

  for (const mesh of buildHeldContents(itemId, containerItems)) {
    root.add(mesh);
  }
  return root;
}

/**
 * 锅里的内容。和 CookwareView 的画法一致（螺旋散开的低面数团子），
 * 但不复用它的私有方法——那边每颗团子的锚点来自槽位坐标系，
 * 这边在角色骨架上，共用只会让两边的坐标假设互相牵制。
 */
function buildHeldContents(
  itemId: string,
  items: ReadonlyArray<{ itemId: string; quantity: number }> | undefined,
): Object3D[] {
  if (!items || items.length === 0) return [];

  const anchor = COOKWARE_CONTENT_ANCHOR[itemId] ?? 0.2;
  const radius = COOKWARE_CONTENT_RADIUS[itemId] ?? 0.25;

  const portions = items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => item.itemId),
  );

  return portions.flatMap((portionId, index) => {
    const portion = buildPortionVisual(portionId);
    if (!portion) return [];

    const angle = index * 2.4;
    const spread = portions.length === 1 ? 0 : radius * 0.6;

    portion.position.set(
      Math.cos(angle) * spread,
      anchor + Math.floor(index / 3) * 0.05,
      Math.sin(angle) * spread,
    );
    portion.rotation.y = angle;
    return [portion];
  });
}

export class HeldItemView {
  private current: Object3D | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly anchor: Object3D) {
    this.unsubscribe = on("held_changed", () => this.sync());
    this.sync();
  }

  private sync(): void {
    if (this.current) {
      this.current.removeFromParent();
      this.current = null;
    }

    const held = getHeld();
    if (!held) return;

    // 走物品统一入口：拿的是家具、厨具还是一颗番茄，这里都不用知道。
    // 锅里装着的东西也一起画，否则"端着一锅菜"看起来是端着一口空锅
    const root = buildHeldVisual(held.itemId, held.container?.items);
    if (!root) return;

    this.anchor.add(root);
    this.current = root;
  }


  dispose(): void {
    this.unsubscribe();
    this.current?.removeFromParent();
    this.current = null;
  }
}
