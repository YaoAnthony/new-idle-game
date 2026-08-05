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
 * "手上端着的东西"的完整造型（含锅里的内容），缩放已按手持比例调好。
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
  root.scale.setScalar(HELD_SCALE);
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
