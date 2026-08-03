import {
  findDoorDefinition,
  findDoors,
  type DoorSave,
  type GridPosition,
} from "core";
import { Door, RoomDoor } from "./doorAgent";
import { getPets } from "./petsRuntime";
import { getWorld, setDoorBlocker } from "./worldRuntime";

/**
 * 门的集合管理（和 petsRuntime 同一套摆法：Agent 类管一扇门怎么动，
 * 这里管全体的初始化 / tick / 存取档 / 查询）。
 *
 * 初始化时机：RoomScene 构造时调 initDoors()——门实例来自房间几何
 * （门洞 + 外墙门开口），几何必须已经就位。读档的话 hydrate 会先把
 * DoorSave 寄存进来，init 时按 refId 认领。
 */

const doors = new Map<string, Door>();

/** hydrate 先到、房间几何后到，锁定状态在这里等着被 init 认领 */
let pendingSaves: DoorSave[] | null = null;

export function restoreDoors(saved: DoorSave[] | undefined): void {
  pendingSaves = saved ?? null;
}

export function initDoors(): void {
  doors.clear();
  const { room } = getWorld();
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;
  const savedByRef = new Map(
    (pendingSaves ?? []).map((save) => [save.refId, save]),
  );

  // ---- 内墙门洞上的门 ----
  for (const doorway of room.interiorDoorways ?? []) {
    if (!doorway.doorId) continue;
    const definition = findDoorDefinition(doorway.doorId);
    if (!definition) {
      // 注册表审计启动时已经报过拼错的 id；这里是老档带着已删门种的情况
      if (import.meta.env.DEV) {
        console.warn(`[door] 门洞 ${doorway.doorwayId} 引用了未知门种 ${doorway.doorId}`);
      }
      continue;
    }

    const cells: GridPosition[] = [];
    for (let i = 0; i < doorway.span; i += 1) {
      cells.push(
        doorway.axis === "x"
          ? { x: doorway.cell.x + i, y: doorway.cell.y }
          : { x: doorway.cell.x, y: doorway.cell.y + i },
      );
    }
    const center = {
      x: doorway.cell.x + (doorway.axis === "x" ? doorway.span / 2 : 0.5) - halfW,
      z: doorway.cell.y + (doorway.axis === "y" ? doorway.span / 2 : 0.5) - halfD,
    };

    const door = new RoomDoor(
      doorway.doorwayId,
      definition,
      cells,
      center,
      savedByRef.get(doorway.doorwayId)?.locked,
    );
    doors.set(door.refId, door);
  }

  // ---- 大门（外墙开口）----
  const frontDefinition = findDoorDefinition("front_door");
  if (frontDefinition) {
    for (const opening of findDoors(room)) {
      /*
       * 大门是纯 Door 基类：能锁、F 开关，没有自动行为。
       * cells 留空——外墙格本来就不可走，不需要它再挡一次；
       * center 只给将来的交互扫描用（西墙开口沿 z 轴排布）。
       */
      const door = new Door(
        opening.openingId,
        frontDefinition,
        [],
        { x: -halfW + 0.5, z: opening.gridPosition.x - halfD + opening.size.width / 2 },
        savedByRef.get(opening.openingId)?.locked,
      );
      doors.set(door.refId, door);
    }
  }

  pendingSaves = null;

  /*
   * 把"关着的门挡路"注册进 isWalkable。回调注册而不是让 worldRuntime
   * 直接 import 这里——那是个循环依赖（这里要 getWorld）。
   */
  setDoorBlocker((gx, gy) => {
    for (const door of doors.values()) {
      if (door.blocksCell(gx, gy)) return true;
    }
    return false;
  });
}

/** 每帧驱动自动开关。生物 = 宠物这类非玩家活物；玩家开门永远走 F */
export function tickDoors(): void {
  if (doors.size === 0) return;
  const creatures = getPets().map((pet) => ({ x: pet.x, z: pet.z }));
  for (const door of doors.values()) door.tick(creatures);
}

export function listDoors(): Door[] {
  return [...doors.values()];
}

export function findDoorAgent(refId: string): Door | undefined {
  return doors.get(refId);
}

/** 玩家附近最近的一扇门（F 交互扫描用）。超出 radius 返回 null */
export function doorNear(x: number, z: number, radius: number): Door | null {
  let best: Door | null = null;
  let bestDistance = radius;
  for (const door of doors.values()) {
    // 大门这类没有格子的门不参与近身交互（V1 出不了屋）
    if (door.cells.length === 0) continue;
    const distance = Math.hypot(door.center.x - x, door.center.z - z);
    if (distance < bestDistance) {
      best = door;
      bestDistance = distance;
    }
  }
  return best;
}

export function snapshotDoors(): DoorSave[] {
  return listDoors().map((door) => ({
    refId: door.refId,
    definitionId: door.definition.id,
    locked: door.locked,
  }));
}
