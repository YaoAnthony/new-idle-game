import { getWorld } from "../State/worldRuntime";
import {
  consumeSelectedOne,
  getSelectedStack,
  addItem,
  placeInFirstFreeSlot,
} from "../State/inventory";
import {
  isPickable,
  listDroppedItems,
  removeDroppedItem,
  throwItem,
} from "../State/droppedItems";

/**
 * 扔出去 / 捡回来。
 *
 * 放在 Systems 而不是 State：它要同时动背包和地上那堆东西，是一条**动作**，
 * 不是某一份状态。State 里那两个文件各自只管自己那摊。
 */

/**
 * 走多近算捡到。
 *
 * 比角色的碰撞半径大一点——踩上去才捡得到的话，玩家会觉得"明明站在上面了
 * 怎么没捡起来"，而多出来的这一点在画面上完全看不出来。
 */
const PICKUP_RADIUS = 0.6;

/**
 * 把手上那一份扔出去。**一次只扔一个**，不是整叠（Minecraft 的约定）——
 * 拿着 5 个番茄按一下 Q 不该把一整格清空，扔错了还得一个个捡回来。
 *
 * 整个 stack 的状态跟着走：扔一口煮着汤的锅出去，落地还是那口带汤的锅。
 * 汤不会洒——要洒就得另做一套"液体损失"的规则，为一个玩家很少做的动作
 * 加一套规则不值当（定案）。
 */
export function throwHeldItem(from: {
  x: number;
  z: number;
  heading: number;
}): boolean {
  const stack = getSelectedStack();
  if (!stack) return false;

  // 先把要扔的那一份抄下来再扣——扣完 getSelectedStack 就变了
  const thrown = {
    stackId: `drop:${stack.itemId}`,
    itemId: stack.itemId,
    quantity: 1,
    state:
      stack.quality || stack.expiresAtUtc || stack.container
        ? {
            quality: stack.quality,
            expiresAtUtc: stack.expiresAtUtc,
            container: stack.container,
          }
        : undefined,
  };

  consumeSelectedOne();

  throwItem({
    roomId: getWorld().room.roomId,
    stack: thrown,
    from: { x: from.x, z: from.z },
    heading: from.heading,
  });
  return true;
}

/** 把地上那一份收回背包。带容器的走整格塞入，其余的正常合堆 */
export function pickUpDroppedItem(id: string): boolean {
  const entity = removeDroppedItem(id);
  if (!entity) return false;

  const state = entity.stack.state;

  if (state?.container) {
    // 锅里煮着的东西不能丢：addItem 带不了容器，得整格塞进去。
    // 塞不下就原样放回地上，宁可让玩家先腾个格子，也不能把一锅汤吞掉
    const placed = placeInFirstFreeSlot({
      itemId: entity.stack.itemId,
      count: entity.stack.quantity,
      quality: state.quality,
      expiresAtUtc: state.expiresAtUtc,
      container: state.container,
    });
    if (!placed) {
      throwItem({
        roomId: entity.roomId,
        stack: entity.stack,
        from: { x: entity.x, z: entity.z },
        heading: 0,
      });
      return false;
    }
    return true;
  }

  addItem(entity.stack.itemId, entity.stack.quantity, state?.quality);
  return true;
}

/**
 * 每帧：走到东西上面就捡起来（星露谷 / MC 式，不用按键）。
 *
 * 刚扔出去的那一份有一段保护期（见 droppedItems 的 PICKUP_LOCK_SECONDS），
 * 否则按 Q 会原地打转——东西刚出手就落进拾取范围，立刻又回到背包。
 */
export function tickItemPickup(player: { x: number; z: number }): void {
  for (const entity of [...listDroppedItems()]) {
    if (!isPickable(entity)) continue;

    const distance = Math.hypot(entity.x - player.x, entity.z - player.z);
    if (distance > PICKUP_RADIUS) continue;

    pickUpDroppedItem(entity.id);
  }
}
