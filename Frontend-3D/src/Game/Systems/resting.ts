import {
  BodyPosture,
  findNearestFreeAnchor,
  hasAnchorFor,
  listRoomAnchors,
  worldToRoomCell,
  type AnchorRef,
} from "core";
import {
  getResting,
  isAnchorTaken,
  isResting,
  setResting,
} from "../State/posture";
import { getCurrentMap, getDefinition, getWorld } from "../State/worldRuntime";

/**
 * 坐下 / 躺下 / 起身。
 *
 * **这就是那个"可被调用的动作原语"**——按 F 只是其中一个调用方。
 * 以后行动系统里选"学习"，要让角色坐着学，就调这里的 restAtNearest(Sit, ...)，
 * 而不是自己去摆姿势。
 *
 * 本文件只管"占用哪个锚点"这件事的状态与规则。
 * 把锚点换算成世界坐标、把姿势摆到骨架上，是表现层（Game3D）收到
 * posture_changed 之后做的事——Game/ 不能碰 three。
 */

/** 世界坐标 → 格子坐标（官方换算，RoomAnchor 感知） */
function toCell(x: number, z: number): { x: number; y: number } {
  return worldToRoomCell(getWorld().room, x, z);
}

/** 屋里 + 院子里所有该姿态的锚点（据点③起室外家具也能坐） */
export function listAnchors(posture?: BodyPosture): AnchorRef[] {
  const { room, placedFurniture } = getWorld();
  return listRoomAnchors(room, placedFurniture, getDefinition, posture, [
    getCurrentMap().outdoorRoomId,
  ]);
}

export function findAnchor(
  instanceId: string,
  anchorId: string,
): AnchorRef | undefined {
  return listAnchors().find(
    (ref) => ref.instanceId === instanceId && ref.anchorId === anchorId,
  );
}

export type AnchorSearch = {
  /** 只找这件家具上的锚点 */
  instanceId?: string;
  /**
   * 最远找几格。行动系统要的是"桌子旁边那把椅子"，
   * 不设上限的话会跑到房间另一头去坐。
   */
  maxCells?: number;
};

/** 离某处最近的空锚点。行动系统找"桌子旁的椅子"也走这个 */
export function findFreeAnchorNear(
  posture: BodyPosture,
  from: { x: number; z: number },
  search: AnchorSearch = {},
): AnchorRef | undefined {
  const origin = toCell(from.x, from.z);

  const anchors = listAnchors(posture).filter((ref) => {
    if (search.instanceId && ref.instanceId !== search.instanceId) return false;
    if (search.maxCells === undefined) return true;

    return (
      Math.hypot(ref.cell.x - origin.x, ref.cell.y - origin.y) <=
      search.maxCells
    );
  });

  return findNearestFreeAnchor(anchors, origin, (ref) =>
    isAnchorTaken(ref.instanceId, ref.anchorId),
  );
}

/** 这件家具现在还有空位吗（提示气泡用） */
export function hasFreeAnchor(
  instanceId: string,
  posture: BodyPosture,
): boolean {
  return listAnchors(posture).some(
    (ref) =>
      ref.instanceId === instanceId &&
      !isAnchorTaken(ref.instanceId, ref.anchorId),
  );
}

/** 这件家具支持这个姿态吗 */
export function supportsPosture(
  furnitureId: string,
  posture: BodyPosture,
): boolean {
  return hasAnchorFor(getDefinition(furnitureId), posture);
}

// ---- 占用与释放 ----

/**
 * 坐/躺到指定锚点上。
 * `from` 是坐下前站的位置，起身时退回那里。
 */
export function restOn(
  instanceId: string,
  anchorId: string,
  from: { x: number; z: number },
): boolean {
  if (isResting()) return false;

  const ref = findAnchor(instanceId, anchorId);
  if (!ref) return false;
  if (isAnchorTaken(instanceId, anchorId)) return false;

  setResting({ instanceId, anchorId, returnTo: { x: from.x, z: from.z } });
  return true;
}

/**
 * 找最近的空位坐/躺下。
 *
 * **这就是那个可被调用的动作原语。**按 F 是一个调用方，
 * 行动系统里"选学习 → 坐着学"是另一个调用方——它们走的是同一条路。
 */
export function restAtNearest(
  posture: BodyPosture,
  from: { x: number; z: number },
  search: AnchorSearch = {},
): boolean {
  if (isResting()) return false;

  const ref = findFreeAnchorNear(posture, from, search);
  if (!ref) return false;

  return restOn(ref.instanceId, ref.anchorId, from);
}

/**
 * 离座的原因。所有起身都走这一个函数收口——
 * 按 F、按 WASD、家具被搬走、行动结束、对话开始……
 * 散着写迟早漏掉一条，然后就出现"人站起来了但还是坐姿"这种鬼状态。
 */
export type StandReason =
  | "player"
  | "moved"
  | "furniture_gone"
  | "action"
  | "sleep"
  | "restore";

export function standUp(reason: StandReason): boolean {
  if (!isResting()) return false;

  setResting(null);
  void reason;
  return true;
}

/**
 * 家具变动后校验一次：坐的那件还在不在、锚点还有没有。
 * 家具被右键拿走、被 testroom 清空都会走到这里。
 */
export function reconcileResting(): void {
  const current = getResting();
  if (!current) return;

  if (!findAnchor(current.instanceId, current.anchorId)) {
    standUp("furniture_gone");
  }
}
