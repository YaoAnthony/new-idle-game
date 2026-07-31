import {
  Facing,
  PlacementSurface,
  buildRoomOccupancy,
  checkPlacement,
  findFurnitureDefinition,
  footprintCells,
  generateHouse,
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

let room = generateHouse({
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
 * （见 Game3D/World/House/HouseBuilder 的"墙面坐标系"注释）。
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

/**
 * 家具压住哪几格。**直接调 Core 的 footprintCells**，不要在这里
 * 自己展开矩形——原来抄了一份，L 形橱柜加占地遮罩之后这份就和
 * Core 的判定走散了（Core 认为凹口是空地、这里认为被占）。
 */
function footprintCellKeys(
  definition: FurnitureDefinition,
  gridPosition: GridPosition,
  facing: Facing,
): string[] {
  return footprintCells(
    gridPosition,
    definition.footprint,
    facing,
    definition.footprintMask,
  ).map((cell) => `${cell.x},${cell.y}`);
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
 * 2LDK 24×20：北墙 x5~6 厨房小窗、x17~21 贴地落地窗（客厅），
 * 西墙 z1~2 门（进玄关），z=12 内墙带三个门洞。
 * **落地窗前那五格永远不摆开局家具**——那是整个庭院构图的画框，
 * 新档第一眼不能被自家灶台挡住（玩家自己想堵是他的自由）。
 */
export function seedInitialFurniture(): void {
  if (placedFurniture.length > 0) return;

  /**
   * 2026-07-30 定稿：开局**只有两个纸箱**，就摆在玄关门口。
   *
   * 以前铺满了灶台、书架、储物箱和三堆纸箱——那是"别人住过的屋子"。
   * 现在的第一眼是**空房子加两个箱子**：所有东西都在箱子里，
   * 玩家亲手拆开、亲手摆出来，家才是自己布置的。
   * 装什么见 Core 的 Data/loot（工具一箱、家什一箱）。
   */
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

  placedFurniture = boxes.map((box) => ({
    instanceId: nextInstanceId(box.furnitureId),
    furnitureId: box.furnitureId,
    placement: {
      kind: PlacementSurface.Floor as const,
      roomId: room.roomId,
      gridPosition: box.gridPosition,
      facing: box.facing,
    },
    state: { lootTableId: box.lootTableId },
  }));

  occupancy = rebuild();
  emit("world_changed", { reason: "seeded" });
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
