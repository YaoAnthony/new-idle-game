import {
  Facing,
  PlacementSurface,
  findPlaceableItem,
  type GridPosition,
  type HeldStack,
  type PlaceableItem,
  type PlacedFurniture,
  type PlacementCheck,
} from "core";
import { emit } from "../../EventBus";
import { nextObjectId } from "../ids";
import { checkPlacementTarget, type PlacementTarget } from "./placement.js";
import { worldState } from "./state.js";

/**
 * 已放置家具的增删 + 槽位内容（灶眼上的锅、砧板上的菜）。
 * 所有耐久操作的唯一入口——联机时同一批操作发给 Server 校验。
 */

/**
 * 家具实例 id 的 kind 段。发号规则和格式见 State/ids——
 * 结果形如 `local:furniture:furniture_chair#3`。
 *
 * 导出是给 v19 迁移用的：那条迁移要把老 id（`furniture_chair#3`，
 * 只有名字没有 kind）补成新格式，两边必须用同一个字面量，
 * 各写一份的话改一处漏一处，续号会从 1 重来直接撞上老家具。
 */
export const FURNITURE_ID_KIND = "furniture";

function nextInstanceId(furnitureId: string): string {
  return nextObjectId(FURNITURE_ID_KIND, furnitureId);
}

/**
 * 已放置家具的定义。**furnitureId 现在就是物品 id**——合并之后
 * 摆在地上的和背包里躺着的是同一条数据，不再需要两边换算。
 */
export function getDefinition(
  furnitureId: string,
): PlaceableItem | undefined {
  return findPlaceableItem(furnitureId);
}

/**
 * 插入一件已经成形的家具实例。**op 通道的共用底座**：
 * 本地放置和重放别人的放置走的都是它，区别只在上层——
 * 本地那层发 world_op，重放那层不发（防回环，见 EventBus 注释）。
 */
function insertPlacedFurniture(placed: PlacedFurniture): void {
  worldState.placedFurniture = [...worldState.placedFurniture, placed];
  emit("world_changed", { reason: "furniture_placed" });
}

export function placeFurnitureAt(
  furnitureId: string,
  target: PlacementTarget,
): PlacementCheck {
  const check = checkPlacementTarget(furnitureId, target);
  if (!check.ok) return check;

  const roomId = worldState.room.roomId;
  const placed: PlacedFurniture = {
    instanceId: nextInstanceId(furnitureId),
    furnitureId,
    placement:
      target.kind === PlacementSurface.Floor
        ? {
            kind: PlacementSurface.Floor,
            roomId,
            gridPosition: target.gridPosition,
            facing: target.facing,
          }
        : target.kind === PlacementSurface.Surface
          ? {
              kind: PlacementSurface.Surface,
              roomId,
              hostInstanceId: target.hostInstanceId,
              gridPosition: target.gridPosition,
              facing: target.facing,
            }
          : {
            kind: PlacementSurface.Wall,
            roomId,
            wallId: target.wallId,
            gridPosition: target.gridPosition,
            facing: Facing.North,
          },
    state: {},
  };

  insertPlacedFurniture(placed);
  emit("world_op", { op: { kind: "furniture_placed", placed } });
  emit("story_signal", { kind: "furniture_placed", subject: furnitureId });
  return check;
}

/**
 * 重放房里其他人摆的家具。不做占用校验——对方那边已经校过，
 * 极端竞争下摆出重叠由房主的整片刷新收敛（契约里记了这条取舍）。
 */
export function replayPlaceFurniture(placed: PlacedFurniture): void {
  if (
    worldState.placedFurniture.some(
      (item) => item.instanceId === placed.instanceId,
    )
  ) {
    return;
  }
  if (!findPlaceableItem(placed.furnitureId)) return;
  insertPlacedFurniture(placed);
}

/** 地面放置的简写（开局摆设、调试命令用） */
export function placeFurniture(
  furnitureId: string,
  gridPosition: GridPosition,
  facing: Facing,
): PlacementCheck {
  return placeFurnitureAt(furnitureId, {
    kind: PlacementSurface.Floor,
    gridPosition,
    facing,
  });
}

/**
 * 清空房间里所有家具（测试房间用）。
 * 不把家具换回物品——这是调试操作，不是玩法里的"收拾东西"。
 */
export function clearAllFurniture(): void {
  if (worldState.placedFurniture.length === 0) return;

  worldState.placedFurniture = [];
  emit("world_changed", { reason: "cleared" });
}

function deletePlacedFurniture(instanceId: string): boolean {
  const before = worldState.placedFurniture.length;
  const next = worldState.placedFurniture.filter(
    (item) => item.instanceId !== instanceId,
  );

  if (next.length === before) return false;

  worldState.placedFurniture = next;
  emit("world_changed", { reason: "furniture_removed" });
  return true;
}

export function removeFurniture(instanceId: string): boolean {
  if (!deletePlacedFurniture(instanceId)) return false;
  // 拆箱、收家具都从这里走——联机时别人立刻看到它消失，不等刷新
  emit("world_op", { op: { kind: "furniture_removed", instanceId } });
  return true;
}

/** 重放房里其他人收走的家具。不存在就当已经收走了（op 可能晚到） */
export function replayRemoveFurniture(instanceId: string): void {
  deletePlacedFurniture(instanceId);
}

/**
 * 开局摆设：刚搬进来的第一天。
 *
 * 2026-07-30 定稿：开局**只有两个纸箱**，就摆在玄关门口。
 *
 * 以前铺满了灶台、书架、储物箱和三堆纸箱——那是"别人住过的屋子"。
 * 现在的第一眼是**空房子加两个箱子**：所有东西都在箱子里，
 * 玩家亲手拆开、亲手摆出来，家才是自己布置的。
 * 装什么见 Core 的 Data/loot（工具一箱、家什一箱）。
 *
 * **落地窗前那五格（北墙 x17~21）永远不摆开局家具**——那是整个庭院
 * 构图的画框，新档第一眼不能被自家灶台挡住（玩家自己想堵是他的自由）。
 */
export function seedInitialFurniture(): void {
  if (worldState.placedFurniture.length > 0) return;

  const boxes: Array<{
    furnitureId: string;
    gridPosition: GridPosition;
    facing: Facing;
    lootTableId: string;
  }> = [
    {
      furnitureId: "cardboard_stack",
      gridPosition: { x: 2, y: 3 },
      facing: Facing.East,
      lootTableId: "moving_tools",
    },
    {
      furnitureId: "cardboard_box",
      gridPosition: { x: 4, y: 4 },
      facing: Facing.South,
      lootTableId: "moving_furniture",
    },
  ];

  worldState.placedFurniture = boxes.map((box) => ({
    instanceId: nextInstanceId(box.furnitureId),
    furnitureId: box.furnitureId,
    placement: {
      kind: PlacementSurface.Floor as const,
      roomId: worldState.room.roomId,
      gridPosition: box.gridPosition,
      facing: box.facing,
    },
    state: { lootTableId: box.lootTableId },
  }));

  emit("world_changed", { reason: "seeded" });
}

// ---- 家具槽位内容（灶眼上的锅、砧板上的菜） ----
//
// 存在 PlacedFurnitureState.slotContents 里（Core 早就定义好了），
// 所以放在灶台上的锅连着锅里煮到几分一起进存档，不需要另开一张表。

export function getSlotContent(
  instanceId: string,
  slotId: string,
): HeldStack | null {
  const stack = worldState.placedFurniture.find(
    (item) => item.instanceId === instanceId,
  )?.state.slotContents?.[slotId];
  if (!stack) return null;

  return {
    itemId: stack.itemId,
    quality: stack.state?.quality,
    container: stack.state?.container,
  };
}

/** 写入槽位。null = 清空。返回是否真的写进去了 */
function writeSlotContent(
  instanceId: string,
  slotId: string,
  content: HeldStack | null,
): boolean {
  const placed = worldState.placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  if (!placed) return false;

  const slotContents = { ...(placed.state.slotContents ?? {}) };

  if (content === null) {
    delete slotContents[slotId];
  } else {
    slotContents[slotId] = {
      // 槽位是唯一的，stackId 直接用位置编码，读档后不会撞号
      stackId: `${instanceId}:${slotId}`,
      itemId: content.itemId,
      quantity: 1,
      state: { quality: content.quality, container: content.container },
    };
  }

  placed.state = { ...placed.state, slotContents };
  emit("kitchen_changed", { instanceId, slotId });
  return true;
}

export function setSlotContent(
  instanceId: string,
  slotId: string,
  content: HeldStack | null,
): boolean {
  if (!writeSlotContent(instanceId, slotId, content)) return false;
  // 投料/拿起/起锅/倒掉在数据上都是一次置位，一种 op 全兜住
  emit("world_op", {
    op: { kind: "kitchen_slot_set", instanceId, slotId, content },
  });
  return true;
}

/** 重放房里其他人的厨房操作 */
export function replaySlotContent(
  instanceId: string,
  slotId: string,
  content: HeldStack | null,
): void {
  writeSlotContent(instanceId, slotId, content);
}

/**
 * 累加加热秒数。**故意不发事件**——它每帧都在动，
 * 发事件会把整条总线刷爆。进度条由渲染层每帧直接读状态。
 */
export function advanceSlotHeat(
  instanceId: string,
  slotId: string,
  seconds: number,
): void {
  const container = worldState.placedFurniture.find(
    (item) => item.instanceId === instanceId,
  )?.state.slotContents?.[slotId]?.state?.container;
  if (!container) return;

  container.heatSeconds += seconds;
}
