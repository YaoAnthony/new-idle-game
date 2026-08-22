import {
  Facing,
  PlacementSurface,
  checkPlacement,
  checkSurfacePlacement,
  findPlaceableItem,
  footprintCells,
  isHouseStowed,
  roomCellToWorld,
  type GridPosition,
  type PlaceableItem,
  type PlacementCheck,
  type RoomSave,
  type WallId,
} from "core";
import { isInsideTerritory } from "../territory.js";
import { actorCellsHas, cellHitsCreature } from "./obstacles.js";
import { worldState } from "./state.js";

/**
 * 放置校验。**预览虚影和放置提交跑同一份代码**（老纪律），
 * 真正落子的写入在 furniture.ts。
 */

/**
 * 放置目标。地面按 (格子, 朝向) 定位；墙面按 (墙, 墙格) 定位——
 * 墙饰的朝向由 wallId 唯一决定，存档里的 facing 固定为 North
 * （见 Game3D/World/House/HouseBuilder 的"墙面坐标系"注释）。
 */
/**
 * 落点。**`roomId` 说的是"摆进哪一间"**（期 1：院子也是一间）。
 *
 * 可选是为了不动老调用方：不填时走 `defaultPlacementRoom()`，
 * 那条规则见它自己的注释。虚影那条链（PlacementController）会显式填，
 * 因为它知道鼠标指着哪一间。
 */
export type PlacementTarget = (
  | { kind: PlacementSurface.Floor; gridPosition: GridPosition; facing: Facing }
  | { kind: PlacementSurface.Wall; wallId: WallId; gridPosition: GridPosition }
  | {
      kind: PlacementSurface.Surface;
      hostInstanceId: string;
      /** 宿主台面网格的半格坐标（宿主本地系） */
      gridPosition: GridPosition;
      facing: Facing;
    }
) & { roomId?: string };

/**
 * 不指定房间时摆进哪一间。
 *
 * **主屋在场就摆主屋，主屋收起来了就摆院子。** 期 1 起房子默认收起
 * （T9），照旧无脑写 `worldState.room.roomId` 的话，开局摆的每一件东西
 * 都会进一个不在场的房间——看不见、走不到、也拿不回来，而调用方
 * 只会看到一个 `{ ok: true }`。
 *
 * 这不是"猜玩家想摆哪"，虚影那条链会显式指定房间；这条只管兜底，
 * 让"没说清楚"落在一个**在场**的房间上。
 */
export function defaultPlacementRoom(): string {
  const primary = worldState.room;
  if (!isHouseStowed(primary)) return primary.roomId;
  const outdoor = worldState.rooms[worldState.map.outdoorRoomId];
  return outdoor?.roomId ?? primary.roomId;
}

/** 落点所属房间的几何。查不到退回主房间 */
export function placementRoomOf(target: PlacementTarget): RoomSave {
  const roomId = target.roomId ?? defaultPlacementRoom();
  return worldState.rooms[roomId] ?? worldState.room;
}

/**
 * 放置结果。**比 Core 的 `PlacementCheck` 多一项 `outside_territory`。**
 *
 * 没有把它加进 Core 的 `PlacementRejection`：领地是**地图层**的概念
 * （哪张图有领地、开了哪几格），而 `checkPlacement` 是一间屋子内部的
 * 格子规则，不该知道外面的世界有没有被买下来。加进去的话，小镇广场
 * 和店铺内部也得为一个它们永远用不到的理由多带一个分支。
 */
export type LocalPlacementCheck =
  | PlacementCheck
  | { ok: false; reason: "outside_territory" };

/** 放置预览与提交共用同一份校验（Core 的 checkPlacement + 活物避让 + 领地） */
export function checkPlacementTarget(
  furnitureId: string,
  target: PlacementTarget,
): LocalPlacementCheck {
  const definition = findPlaceableItem(furnitureId);

  /**
   * 台面走自己的规则模块（Core 的 logic/surfaces）。台面件不占地面、
   * 不挡路、不压活物，所以下面那段"别放在角色身上"的检查也与它无关。
   * 失败原因映射进 PlacementCheck 已有的词表——调用方（虚影变红）
   * 只关心 ok 不 ok，细分原因给日志和未来的提示留着。
   */
  if (target.kind === PlacementSurface.Surface) {
    const surfaceCheck = checkSurfacePlacement(
      target,
      definition,
      worldState.placedFurniture,
      findPlaceableItem,
    );
    // `=== false` 收窄：本项目 tsconfig 没开 strict，真值收窄在
    // 判别式联合上不生效（session.ts 的 unwrapReply 记过这个坑）
    if (surfaceCheck.ok === false) {
      return {
        ok: false,
        reason:
          surfaceCheck.reason === "out_of_bounds" ||
          surfaceCheck.reason === "cell_occupied"
            ? surfaceCheck.reason
            : "wrong_surface",
      };
    }
    return { ok: true };
  }

  const room = placementRoomOf(target);
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
    // **那一间自己的占用图**：院子里的家具不该被屋里的占用挡住，反之亦然
    worldState.occupancyOf(room.roomId),
  );
  if (!check.ok) return check;

  /*
   * **领地校验只管院子**，屋里不问。
   *
   * 屋子本身必须整个落在领地内（那是房子选址那条链的事，见
   * `housePlacementCheck`），所以屋里的每一格天然也在领地内——在这儿
   * 再问一次是白花钱，而且会让"在自己屋里摆东西"依赖一个和它无关的系统。
   *
   * 占地矩形转成世界坐标再问：领地是世界坐标上的矩形，家具的
   * gridPosition 是房本地格。
   */
  if (
    target.kind === PlacementSurface.Floor &&
    definition &&
    room.roomId === worldState.map.outdoorRoomId
  ) {
    const cells = footprintCells(
      target.gridPosition,
      definition.placement.footprint,
      target.facing,
      definition.placement.footprintMask,
    );
    for (const cell of cells) {
      const world = roomCellToWorld(room, cell.x, cell.y);
      if (!isInsideTerritory(world.x, world.z)) {
        return { ok: false, reason: "outside_territory" };
      }
    }
  }

  // 会挡路的家具不能压在角色身上（墙饰不占地面，天然不会）
  if (
    target.kind === PlacementSurface.Floor &&
    definition?.placement.blocksMovement
  ) {
    const cells = footprintCellKeys(
      definition,
      target.gridPosition,
      target.facing,
    );
    for (const key of cells) {
      if (actorCellsHas(key)) return { ok: false, reason: "cell_occupied" };
      // 大猫压着的格子也不能放：把柜子放进睡着的活物身体里，
      // 醒来那一刻两个碰撞体就互相卡死了
      if (cellHitsCreature(key)) return { ok: false, reason: "cell_occupied" };
    }
  }

  return check;
}

/**
 * 家具压住哪几格。**直接调 Core 的 footprintCells**，不要在这里
 * 自己展开矩形——原来抄了一份，L 形橱柜加占地遮罩之后这份就和
 * Core 的判定走散了（Core 认为凹口是空地、这里认为被占）。
 */
export function footprintCellKeys(
  definition: PlaceableItem,
  gridPosition: GridPosition,
  facing: Facing,
): string[] {
  return footprintCells(
    gridPosition,
    definition.placement.footprint,
    facing,
    definition.placement.footprintMask,
  ).map((cell) => `${cell.x},${cell.y}`);
}
