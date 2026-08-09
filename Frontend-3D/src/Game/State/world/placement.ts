import {
  Facing,
  PlacementSurface,
  checkPlacement,
  checkSurfacePlacement,
  findPlaceableItem,
  footprintCells,
  type GridPosition,
  type PlaceableItem,
  type PlacementCheck,
  type WallId,
} from "core";
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
export type PlacementTarget =
  | { kind: PlacementSurface.Floor; gridPosition: GridPosition; facing: Facing }
  | { kind: PlacementSurface.Wall; wallId: WallId; gridPosition: GridPosition }
  | {
      kind: PlacementSurface.Surface;
      hostInstanceId: string;
      /** 宿主台面网格的半格坐标（宿主本地系） */
      gridPosition: GridPosition;
      facing: Facing;
    };

/** 放置预览与提交共用同一份校验（Core 的 checkPlacement + 活物避让） */
export function checkPlacementTarget(
  furnitureId: string,
  target: PlacementTarget,
): PlacementCheck {
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

  const check = checkPlacement(
    worldState.room,
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
    worldState.occupancy,
  );
  if (!check.ok) return check;

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
