import {
  findDoorDefinition,
  findDoors,
  yardBoundsOf,
  type DoorDefinition,
  type DoorSave,
  type GridPosition,
} from "core";
import { emit } from "../EventBus";
import { doorsAssumedOpen } from "./world/walkable";
import { Door, RoomDoor } from "./doorAgent";
import { getPets } from "./petsRuntime";
import {
  getCurrentMap,
  getWorld,
  setDoorBlocker,
  setOutdoorPass,
} from "./worldRuntime";

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
  /** 大门的穿行通道（世界 z 范围）。西墙开口沿 z 轴排布 */
  let frontDoorRef: string | null = null;
  let passMinZ = 0;
  let passMaxZ = 0;
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
      frontDoorRef = door.refId;
      passMinZ = opening.gridPosition.x - halfD;
      passMaxZ = passMinZ + opening.size.width;
    }
  }

  pendingSaves = null;
  // 基线跟着门一起重建，否则换房间后第一帧会拿旧门的状态比对
  lastOpen.clear();
  for (const door of doors.values()) lastOpen.set(door.refId, door.open);

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

  /*
   * 室外通行判定（isWalkable 的边界分支走这里）。三层，由外到内：
   * 1. 院子有边——可走边界从地图定义推（yardBoundsOf，四向边距可以
   *    不均匀），草地视觉更大没关系，
   *    能看到的远处和能走到的范围不是一回事。
   * 2. 碰撞圆不压着房子 → 院子里自由走。
   * 3. 压着房子 = 正在穿墙，只有一种合法情况：大门开着、
   *    且整个人都在门洞的 z 跨度里、且压的是西墙那条边。
   *    z 校验挡住"贴着南北墙外侧蹭"，x 校验挡住"从东墙穿进来"。
   */
  setOutdoorPass((x, z, radius) => {
    const map = getCurrentMap();
    const bounds = yardBoundsOf(map, getWorld().room.floorGrid);
    if (
      x - radius < bounds.minX ||
      x + radius > bounds.maxX ||
      z - radius < bounds.minZ ||
      z + radius > bounds.maxZ
    ) {
      return false;
    }

    /*
     * 室外的实心占地（小镇的店铺这类）。碰撞圆压到就不许过——
     * 布景建筑能穿墙走过去的话，"这是一栋房子"的说服力当场归零。
     */
    for (const blocker of map.outdoorBlockers ?? []) {
      if (
        x + radius > blocker.minX &&
        x - radius < blocker.maxX &&
        z + radius > blocker.minZ &&
        z - radius < blocker.maxZ
      ) {
        return false;
      }
    }

    const overlapsHouse =
      x + radius > -halfW &&
      x - radius < halfW &&
      z + radius > -halfD &&
      z - radius < halfD;
    if (!overlapsHouse) return true;

    /*
     * 到这儿说明正在穿越"房间"的边界。房子只有开着大门才过得去；
     * **露天场地（小镇广场这类）不一样**——它墙上的那个口子是个豁口，
     * 不是一扇要按 F 开的门。硬套房子的规矩会把广场变成一个封死的
     * 院子：玩家 /goto town 落在广场正中，四面矮墙，走不出去。
     * （实测踩到过，是这次做寻路时导航网格只连出 660 格才发现的。）
     */
    if (map.openAir) {
      return (
        z - radius >= passMinZ &&
        z + radius <= passMaxZ &&
        x - radius < -halfW + 0.01
      );
    }

    const frontDoor = frontDoorRef ? doors.get(frontDoorRef) : undefined;
    // 导航采样时当门开着（走到跟前自动跑腿会开）——见 walkable 的 withDoorsOpen
    const passable = frontDoor?.open || (doorsAssumedOpen() && !frontDoor?.locked);
    if (!passable) return false;
    if (z - radius < passMinZ || z + radius > passMaxZ) return false;
    return x - radius < -halfW + 0.01;
  });
}

/**
 * 上一帧每扇门的开合状态。用来在**一个地方**检测跳变——
 * 门可能被玩家按 F 开、被宠物自动开、以后还可能被剧情开，
 * 各处自己发事件迟早会漏掉一条路径。比对状态则不管谁改的都抓得到。
 */
const lastOpen = new Map<string, boolean>();

/** 每帧驱动自动开关。生物 = 宠物这类非玩家活物；玩家开门永远走 F */
export function tickDoors(): void {
  if (doors.size === 0) return;
  const creatures = getPets().map((pet) => ({ x: pet.x, z: pet.z }));
  for (const door of doors.values()) {
    door.tick(creatures);

    const previous = lastOpen.get(door.refId);
    if (previous !== door.open) {
      lastOpen.set(door.refId, door.open);
      // 首帧（previous 是 undefined）不发：那是初始化不是"门动了"
      if (previous !== undefined) {
        emit("door_toggled", {
          refId: door.refId,
          open: door.open,
          x: door.center.x,
          z: door.center.z,
        });
      }
    }
  }
}

export function listDoors(): Door[] {
  return [...doors.values()];
}

export function findDoorAgent(refId: string): Door | undefined {
  return doors.get(refId);
}

export function snapshotDoors(): DoorSave[] {
  /*
   * 门实例还没建（读档之后、RoomScene 的 initDoors 之前）时，快照
   * 原样退回寄存的那份——否则这个窗口里存一次盘，全部锁状态清零。
   * 认领过（doors 非空）之后寄存已经消费掉，走正常路径。
   */
  if (doors.size === 0 && pendingSaves) return pendingSaves;

  return listDoors().map((door) => ({
    refId: door.refId,
    definitionId: door.definition.id,
    locked: door.locked,
  }));
}
