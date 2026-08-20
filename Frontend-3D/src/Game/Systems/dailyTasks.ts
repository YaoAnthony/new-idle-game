import { dailyBoardDefinition, FurnitureCapability, roomCellToWorld } from "core";
import { emit } from "../EventBus";
import {
  claimBoard,
  getGoal,
  isFull,
  peekBoard,
  tickBoard,
} from "../State/dailyBoard";
import { markDone, rerollTask } from "../State/dailyTasks";
import { throwItem } from "../State/droppedItems";
import { getLocalTransform } from "../State/participants";
import { getDefinition, getWorld, roomIdAt } from "../State/worldRuntime";

/**
 * 每日任务的**缝合层**：把个人清单（`State/dailyTasks`）和共享进度
 * （`State/dailyBoard`）接起来，并在满格时吐奖励（V0.11）。
 *
 * 两个 State 互不认识是刻意的——它们归属不同（一个跟人走进 PlayerSave、
 * 一个跟世界走进 WorldSave），联机时会落在两份不同的存档里。
 * "打一个勾要同时改这两处"是**玩法规则**，规则住在 Systems 层。
 */

const definition = dailyBoardDefinition;

/**
 * 打一个勾。这是 UI 唯一该调的入口。
 *
 * 顺序是有讲究的：先改个人（`markDone` 返回"这次真的从未完成变成完成"），
 * 只有真变了才推共享进度——重复点击不该重复加分。
 */
export function completeDailyTask(taskId: string): boolean {
  if (!markDone(taskId)) return false;

  const progress = tickBoard();
  if (progress !== null) {
    // 联机广播由 Net 层订阅这条事件转发（阶段 5）。State 不认识网络
    emit("daily_board_ticked_locally", { progress });
  }

  // 刚好满格 → 当场吐奖励。放在打勾这条路径上而不是另起一个定时检查：
  // 因果要连得上（你点完最后一勾，机器动了）
  if (isFull()) tryClaimReward();
  return true;
}

/** 换掉今天的某一条。规则和额度都在 State 里判，这层只转发 */
export function rerollDailyTask(taskId: string): boolean {
  return rerollTask(taskId);
}

/**
 * 满格发奖。
 *
 * **先置位再吐**（`claimBoard` 内部保证）：两个客户端同时满格时只有
 * 一边拿到 true，另一边不吐——否则会吐两份。
 */
export function tryClaimReward(): boolean {
  if (!claimBoard()) return false;

  const spout = findSpout();
  const shares = rewardShares();

  for (let share = 0; share < shares; share += 1) {
    for (const reward of definition.rewards) {
      if (reward.type !== "item") continue;
      for (let n = 0; n < reward.quantity; n += 1) {
        throwItem({
          roomId: roomIdAt(spout.x, spout.z),
          stack: {
            stackId: `daily:${reward.itemId}`,
            itemId: reward.itemId,
            quantity: 1,
          },
          from: { x: spout.x, z: spout.z },
          // 每份错开角度散出去，免得叠成一摞看不出有几个
          heading: spout.heading + share * 0.9 + n * 0.35,
        });
      }
    }
  }

  emit("daily_board_claimed_locally", {});
  return true;
}

/**
 * 从哪儿吐。
 *
 * 优先找屋里的每日任务机器——玩家刚在它跟前点完最后一勾，
 * 奖励从眼前这台出来才对得上因果。一台都没有的极端情况
 * （打完勾那一瞬间被别人收走了）落到玩家脚下，东西不能凭空消失。
 */
function findSpout(): { x: number; z: number; heading: number } {
  const local = getLocalTransform();
  const { room, placedFurniture } = getWorld();

  const machine = placedFurniture.find((placed) =>
    getDefinition(placed.furnitureId)?.placement.capabilities.includes(
      FurnitureCapability.DailyBoard,
    ),
  );
  if (!machine || machine.placement.kind !== "floor") {
    return { x: local.x, z: local.z, heading: local.heading };
  }

  // 格子中心 → 世界坐标（官方换算，RoomAnchor 感知）
  const { gridPosition } = machine.placement;
  const world = roomCellToWorld(room, gridPosition.x, gridPosition.y);
  return {
    x: world.x,
    z: world.z,
    // 朝玩家那边吐，别塞进墙里
    heading: Math.atan2(local.x - world.x, local.z - world.z),
  };
}

/**
 * 吐几份。**在场每人各一整份**，不是分掉——Habitica 的 party quest
 * 就是这个模型（所有参与者拿到完全相同的奖励）。
 *
 * 人数从联机名册来；单机时名册是空的，就是 1 份。
 * 用动态 import 避免 Systems → Net → State 绕回来的环。
 */
let participantCount: () => number = () => 1;

/** 由 Net 层在会话建立时注入。单机保持默认的 1 */
export function setDailyRewardShareCounter(counter: () => number): void {
  participantCount = counter;
}

function rewardShares(): number {
  return Math.max(1, Math.floor(participantCount()));
}

/** 屋里有没有每日任务机器。HUD 靠它决定渲不渲染 */
export function hasDailyBoardMachine(): boolean {
  return getWorld().placedFurniture.some((placed) =>
    getDefinition(placed.furnitureId)?.placement.capabilities.includes(
      FurnitureCapability.DailyBoard,
    ),
  );
}

/**
 * 给 UI 的一份只读视图。
 *
 * 走 `peekBoard()` 而不是 `getBoard()`：后者惰性归零并发事件，
 * 而这个函数会在 React 的 render 里被调（顶部进度条、面板）。
 * 详见 State/dailyBoard 里 peekBoard 的注释。
 */
export function describeBoard(): {
  progress: number;
  goal: number;
  claimed: boolean;
} {
  const board = peekBoard();
  return { progress: board.progress, goal: getGoal(), claimed: board.claimed };
}
