import {
  findDoorDefinition,
  findDoors,
  type DoorDefinition,
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

/**
 * 按注册表字段选类：有自动开半径的门就是 RoomDoor，没有的是纯基类。
 * 类的选择也由数据驱动——这里不出现任何具体门的 id。
 */
function makeDoor(
  refId: string,
  definition: DoorDefinition,
  cells: readonly GridPosition[],
  center: { x: number; z: number },
  savedLocked?: boolean,
  initiallyLocked?: boolean,
): Door {
  const DoorClass = definition.behavior?.autoOpenRadius ? RoomDoor : Door;
  /*
   * 锁定的优先级：存档 > 这一扇的设定 > 这一种门的默认。
   * 存档最优先是关键——玩家拿钥匙开过的锁，读档不该自己合上。
   */
  const locked = savedLocked ?? initiallyLocked ?? definition.defaultLocked;
  return new DoorClass(refId, definition, cells, center, locked);
}

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

    const door = makeDoor(
      doorway.doorwayId,
      definition,
      cells,
      center,
      savedByRef.get(doorway.doorwayId)?.locked,
      doorway.initiallyLocked,
    );
    doors.set(door.refId, door);
  }

  // ---- 大门（外墙开口）----
  const frontDefinition = findDoorDefinition("front_door");
  if (frontDefinition) {
    for (const opening of findDoors(room)) {
      /*
       * cells 留空——外墙格本来就不可走，不需要它再挡一次；
       * center 给自动开关和交互扫描用（西墙开口沿 z 轴排布）。
       * 大门在注册表里也带自动开半径（收得很小），所以 makeDoor
       * 会给它 RoomDoor：派遣出门的开门仪式就是这一条行为。
       */
      const door = makeDoor(
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

export function snapshotDoors(): DoorSave[] {
  return listDoors().map((door) => ({
    refId: door.refId,
    definitionId: door.definition.id,
    locked: door.locked,
  }));
}
