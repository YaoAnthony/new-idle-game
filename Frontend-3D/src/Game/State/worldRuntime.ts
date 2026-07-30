import {
  Facing,
  PlacementSurface,
  buildRoomOccupancy,
  checkPlacement,
  findFurnitureDefinition,
  generateRoom,
  roomStyleDefinitions,
  type FurnitureDefinition,
  type GridPosition,
  type HeldStack,
  type PlacedFurniture,
  type PlacementCheck,
  type RoomOccupancy,
  type RoomSave,
  type WallId,
} from "core";
import { emit } from "../EventBus";

/**
 * 世界运行时状态。M2 阶段先驻内存，之后接 Data/Save 落盘——
 * 所有耐久操作都经过这里（唯一入口），联机时同一批操作发给 Server 校验。
 *
 * 占用图是派生数据：每次家具变化后从 placedFurniture 重建，不持久化。
 */

export type WorldRuntime = {
  readonly room: RoomSave;
  readonly placedFurniture: readonly PlacedFurniture[];
  readonly occupancy: RoomOccupancy;
};

let instanceCounter = 0;

/**
 * 当前屋子风格。**RoomSave 里只存生成结果不存风格 id**（"存结果不存配方"，
 * 联机时访客直接用房主的几何），所以风格本身要单独记一份——
 * 环境音要按 `regionId` 选（森林 / 海边），装修系统以后也要读它。
 */
let roomStyle = roomStyleDefinitions[0];

let room = generateRoom({
  roomId: "living",
  style: roomStyle,
});

let placedFurniture: PlacedFurniture[] = [];
let occupancy = rebuild();

function rebuild(): RoomOccupancy {
  return buildRoomOccupancy(room, placedFurniture, findFurnitureDefinition);
}

function nextInstanceId(furnitureId: string): string {
  instanceCounter += 1;
  return `${furnitureId}#${instanceCounter}`;
}

export function getWorld(): WorldRuntime {
  return { room, placedFurniture, occupancy };
}

/** 当前屋子风格（环境音按 regionId 选，装修系统以后也读它） */
export function getRoomStyle(): (typeof roomStyleDefinitions)[number] {
  return roomStyle;
}

export function setRoomStyleId(styleId: string): void {
  const next = roomStyleDefinitions.find((style) => style.id === styleId);
  if (next) roomStyle = next;
}

export function getDefinition(
  furnitureId: string,
): FurnitureDefinition | undefined {
  return findFurnitureDefinition(furnitureId);
}

/** 角色（将来还有宠物）当前压住的格子。放置校验要避开活物，否则会把人封进家具里 */
let actorCells = new Set<string>();

export function setActorFootprint(x: number, z: number, radius: number): void {
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;
  const next = new Set<string>();

  const minGX = Math.floor(x - radius + halfW);
  const maxGX = Math.floor(x + radius + halfW);
  const minGY = Math.floor(z - radius + halfD);
  const maxGY = Math.floor(z + radius + halfD);

  for (let gy = minGY; gy <= maxGY; gy += 1) {
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      next.add(`${gx},${gy}`);
    }
  }

  actorCells = next;
}

/**
 * 放置目标。地面按 (格子, 朝向) 定位；墙面按 (墙, 墙格) 定位——
 * 墙饰的朝向由 wallId 唯一决定，存档里的 facing 固定为 North
 * （见 Game3D/World/RoomBuilder 的"墙面坐标系"注释）。
 */
export type PlacementTarget =
  | { kind: PlacementSurface.Floor; gridPosition: GridPosition; facing: Facing }
  | { kind: PlacementSurface.Wall; wallId: WallId; gridPosition: GridPosition };

/** 放置预览与提交共用同一份校验（Core 的 checkPlacement + 活物避让） */
export function checkPlacementTarget(
  furnitureId: string,
  target: PlacementTarget,
): PlacementCheck {
  const definition = findFurnitureDefinition(furnitureId);

  const check = checkPlacement(
    room,
    target.kind === PlacementSurface.Floor
      ? {
          kind: PlacementSurface.Floor,
          gridPosition: target.gridPosition,
          facing: target.facing,
        }
      : {
          kind: PlacementSurface.Wall,
          wallId: target.wallId,
          gridPosition: target.gridPosition,
          facing: Facing.North,
        },
    definition,
    occupancy,
  );
  if (!check.ok) return check;

  // 会挡路的家具不能压在角色身上（墙饰不占地面，天然不会）
  if (target.kind === PlacementSurface.Floor && definition?.blocksMovement) {
    const cells = footprintCellKeys(
      definition,
      target.gridPosition,
      target.facing,
    );
    for (const key of cells) {
      if (actorCells.has(key)) return { ok: false, reason: "cell_occupied" };
    }
  }

  return check;
}

function footprintCellKeys(
  definition: FurnitureDefinition,
  gridPosition: GridPosition,
  facing: Facing,
): string[] {
  const rotated = facing === Facing.East || facing === Facing.West;
  const w = rotated ? definition.footprint.height : definition.footprint.width;
  const h = rotated ? definition.footprint.width : definition.footprint.height;

  const keys: string[] = [];
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      keys.push(`${gridPosition.x + dx},${gridPosition.y + dy}`);
    }
  }
  return keys;
}

export function placeFurnitureAt(
  furnitureId: string,
  target: PlacementTarget,
): PlacementCheck {
  const check = checkPlacementTarget(furnitureId, target);
  if (!check.ok) return check;

  placedFurniture = [
    ...placedFurniture,
    {
      instanceId: nextInstanceId(furnitureId),
      furnitureId,
      placement:
        target.kind === PlacementSurface.Floor
          ? {
              kind: PlacementSurface.Floor,
              roomId: room.roomId,
              gridPosition: target.gridPosition,
              facing: target.facing,
            }
          : {
              kind: PlacementSurface.Wall,
              roomId: room.roomId,
              wallId: target.wallId,
              gridPosition: target.gridPosition,
              facing: Facing.North,
            },
      state: {},
    },
  ];

  occupancy = rebuild();
  emit("world_changed", { reason: "furniture_placed" });
  emit("story_signal", { kind: "furniture_placed", subject: furnitureId });
  return check;
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
  if (placedFurniture.length === 0) return;

  placedFurniture = [];
  occupancy = rebuild();
  emit("world_changed", { reason: "cleared" });
}

export function removeFurniture(instanceId: string): boolean {
  const before = placedFurniture.length;
  placedFurniture = placedFurniture.filter(
    (item) => item.instanceId !== instanceId,
  );

  if (placedFurniture.length === before) return false;

  occupancy = rebuild();
  emit("world_changed", { reason: "furniture_removed" });
  return true;
}

/**
 * 开局摆设：刚搬进来的第一天。
 *
 * 摆放刻意不对齐——纸箱分三堆错落地扔在地上，朝向各不相同，
 * 房东留下的旧书架和旧储物箱歪靠着墙。整齐是玩家自己布置出来的，
 * 开局只需要"还没收拾完"的样子。
 *
 * 房间 16×12：北墙 x=3~4 小窗、x=9~13 贴地落地窗，西墙 x=0（y=5~6 是门），
 * 角色出生在房间正中 (8, 6) 附近，所以中央必须留空。
 * **落地窗前那五格永远不摆开局家具**——那是整个庭院构图的画框，
 * 新档第一眼不能被自家灶台挡住（玩家自己想堵是他的自由）。
 */
export function seedInitialFurniture(): void {
  if (placedFurniture.length > 0) return;

  const initial: Array<{
    furnitureId: string;
    gridPosition: GridPosition;
    facing: Facing;
  }> = [
    // 房子自带的灶台，挪到北墙西端——原来的 x12 正好怼在落地窗前。
    // 这个角落也是将来 2LDK 布局里开放厨房的位置
    { furnitureId: "stove", gridPosition: { x: 1, y: 0 }, facing: Facing.North },

    // 房东留下的旧家具：书架卡在两扇窗中间，储物箱塞在东墙边
    { furnitureId: "bookshelf", gridPosition: { x: 6, y: 0 }, facing: Facing.North },
    { furnitureId: "storage_chest", gridPosition: { x: 14, y: 4 }, facing: Facing.West },

    // 第一堆：西南角，刚搬进门先卸在这儿的
    { furnitureId: "cardboard_stack", gridPosition: { x: 2, y: 8 }, facing: Facing.North },
    { furnitureId: "cardboard_box", gridPosition: { x: 3, y: 9 }, facing: Facing.East },
    { furnitureId: "cardboard_box", gridPosition: { x: 1, y: 10 }, facing: Facing.South },

    // 第二堆：南边靠中间，搬到一半没力气了
    { furnitureId: "cardboard_stack", gridPosition: { x: 9, y: 9 }, facing: Facing.West },
    { furnitureId: "cardboard_box", gridPosition: { x: 10, y: 8 }, facing: Facing.South },

    // 第三堆：东南角孤零零一个
    { furnitureId: "cardboard_box", gridPosition: { x: 13, y: 7 }, facing: Facing.East },
  ];

  for (const item of initial) {
    placeFurniture(item.furnitureId, item.gridPosition, item.facing);
  }
}

// ---- 存档 ----
//
// 房间几何**存结果不存配方**：联机时访客直接用房主存档里的几何，
// 双方内容版本不同也不会各自生成出不一样的房间（见 V0.2 文档"房间信息怎么存"）。
// 占用图是派生数据，不进存档，读档后由 placedFurniture 重建。

export function snapshotWorld(): {
  room: RoomSave;
  placedFurniture: PlacedFurniture[];
} {
  return { room, placedFurniture: placedFurniture.map((item) => ({ ...item })) };
}

export function restoreWorld(saved: {
  room?: RoomSave;
  placedFurniture: PlacedFurniture[];
}): void {
  if (saved.room) room = saved.room;

  // 丢弃引用了未知家具定义的记录（内容更新后删过某件家具时不至于崩）
  placedFurniture = saved.placedFurniture.filter((item) =>
    findFurnitureDefinition(item.furnitureId),
  );

  // instanceId 形如 "chair#7"，续号要从存档里的最大值往后接，避免撞号
  instanceCounter = placedFurniture.reduce((max, item) => {
    const suffix = Number(item.instanceId.split("#")[1]);
    return Number.isInteger(suffix) && suffix > max ? suffix : max;
  }, 0);

  occupancy = rebuild();
  emit("world_changed", { reason: "restored" });
}

// ---- 家具槽位内容（灶眼上的锅、砧板上的菜） ----
//
// 存在 PlacedFurnitureState.slotContents 里（Core 早就定义好了），
// 所以放在灶台上的锅连着锅里煮到几分一起进存档，不需要另开一张表。

export function getSlotContent(
  instanceId: string,
  slotId: string,
): HeldStack | null {
  const stack = placedFurniture.find((item) => item.instanceId === instanceId)
    ?.state.slotContents?.[slotId];
  if (!stack) return null;

  return {
    itemId: stack.itemId,
    quality: stack.state?.quality,
    container: stack.state?.container,
  };
}

/** 写入槽位。null = 清空。返回是否真的写进去了 */
export function setSlotContent(
  instanceId: string,
  slotId: string,
  content: HeldStack | null,
): boolean {
  const placed = placedFurniture.find((item) => item.instanceId === instanceId);
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

/**
 * 累加加热秒数。**故意不发事件**——它每帧都在动，
 * 发事件会把整条总线刷爆。进度条由渲染层每帧直接读状态。
 */
export function advanceSlotHeat(
  instanceId: string,
  slotId: string,
  seconds: number,
): void {
  const container = placedFurniture.find(
    (item) => item.instanceId === instanceId,
  )?.state.slotContents?.[slotId]?.state?.container;
  if (!container) return;

  container.heatSeconds += seconds;
}

/** 连续坐标下的通行检测：角色/宠物的圆形碰撞体压到的格子都不能是阻挡格 */
export function isWalkable(x: number, z: number, radius: number): boolean {
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;

  if (
    x - radius < -halfW ||
    x + radius > halfW ||
    z - radius < -halfD ||
    z + radius > halfD
  ) {
    return false;
  }

  const minGX = Math.floor(x - radius + halfW);
  const maxGX = Math.floor(x + radius + halfW);
  const minGY = Math.floor(z - radius + halfD);
  const maxGY = Math.floor(z + radius + halfD);

  for (let gy = minGY; gy <= maxGY; gy += 1) {
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      if (occupancy.blocked.has(`${gx},${gy}`)) return false;
    }
  }

  return true;
}
