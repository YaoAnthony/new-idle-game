import { isHouseStowed } from "core";
import { emit } from "../EventBus";
import { guardWorldMutation } from "../Multiplayer/worldLock";
import { getLocalTransform } from "../State/participants";
import {
  getCurrentMap,
  getWorld,
  isIndoors,
  setRoomStowed,
} from "../State/worldRuntime";

/**
 * 收起 / 放下据点的房子。
 *
 * **房子不是家具**（用户 2026-08-20 定的调子）：家具右键就能收进兜里，
 * 房子不行——它是一栋建筑，收放该是一件有前置条件、有人手、有过程的事。
 * 这个文件是那件事的第一层：**规矩**。谁来触发（将来的工人 NPC、
 * 委托面板、动画过场）是另一层，今天只有调试指令接在上面。
 *
 * 今天只有一条规矩，但它是真规矩：**人得先出去**。收房子丢的不是
 * 数据（屋里的东西原样留在存档里，见 RoomSave.stowed），是"你正站在
 * 里面"这件事——从自己脚底下把房子抽走，怎么演都不对。
 *
 * 刻意**没有**的规矩，各自有理由：
 * - 不要求屋里清空。收房子不是拿家具：桌椅连同摆位一起跟着房子走，
 *   放回来原样归位。要求先搬空等于逼玩家做一遍纯粹的无用功。
 * - 不管宠物。它们会自己走出来（收起来之后整块地都是院子），
 *   把猫锁在不存在的房子里这种事，寻路那边不会发生。
 */

export type HouseActionResult =
  | { ok: true }
  | { ok: false; reason: "busy" | "no_house" | "already" | "player_inside" };

/** 据点的房子 = 当前图的主房间。露天图（小镇广场）没有房子可收 */
function houseRoomId(): string | null {
  const map = getCurrentMap();
  if (map.openAir) return null;
  return map.primaryRoomId;
}

export function isHouseStandingHere(): boolean {
  return houseRoomId() !== null && !isHouseStowed(getWorld().room);
}

/**
 * 收起房子。成功后发 `map_changed`——场景要整个重建：门、镜头边界、
 * 承托面、外景全在 RoomScene 的构造函数里按当时的几何初始化，
 * 改完几何还复用旧场景等于让它们全体攥着"房子还在"的闭包。
 */
export function stowHouse(): HouseActionResult {
  if (guardWorldMutation()) return { ok: false, reason: "busy" };

  const roomId = houseRoomId();
  if (!roomId) return { ok: false, reason: "no_house" };
  if (isHouseStowed(getWorld().room)) return { ok: false, reason: "already" };

  const at = getLocalTransform();
  if (isIndoors(at.x, at.z)) return { ok: false, reason: "player_inside" };

  if (!setRoomStowed(roomId, true)) return { ok: false, reason: "already" };
  emit("map_changed", {
    mapId: getCurrentMap().mapId,
    localizationKey: getCurrentMap().localizationKey,
  });
  return { ok: true };
}

/** 放回去。位置由 RoomSave.anchor 记着——收起来的房子没忘记自己在哪 */
export function placeHouse(): HouseActionResult {
  if (guardWorldMutation()) return { ok: false, reason: "busy" };

  const roomId = houseRoomId();
  if (!roomId) return { ok: false, reason: "no_house" };
  if (!isHouseStowed(getWorld().room)) return { ok: false, reason: "already" };

  if (!setRoomStowed(roomId, false)) return { ok: false, reason: "already" };
  emit("map_changed", {
    mapId: getCurrentMap().mapId,
    localizationKey: getCurrentMap().localizationKey,
  });
  return { ok: true };
}
