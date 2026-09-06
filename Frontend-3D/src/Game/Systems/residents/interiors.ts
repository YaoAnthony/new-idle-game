import { findPlaceableItem, findResidentDefinition, giftSurfaceOf, type WorldSave } from "core";
import { emit } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getResident, getResidents } from "../../State/residentsRuntime";
import { lastLovedFurnitureOf, placeOnPorch } from "./porch";
import { homeInteriorOf } from "./spots";

/**
 * 居民房的室内槽位（居民系统 08）：你送他的东西摆在他屋里。
 *
 * 状态表 `WorldSave.interiors`：建筑实例 id → 各槽摆着什么（按 `giftSlots` 下标）+ 箱子里的。
 * **只有剧情效果 `interior_place` 写它**（送对了爱吃的家具、find 委托做完），和 07 的
 * 门口是同一条规则链：效果执行时判有没有室内，没有就退回门口。
 *
 * 槽按放置面分（地面 / 墙面），东西进和自己放置面一样的槽；同一面的槽满了，**最早的**
 * 那件挪到门口（porch），门口也满了才进箱——门口 2 件 + 屋里 3 件都看得见，箱子是最后
 * 一站。"最早"= 下标最小：同一面的槽按先来后到从低往高填，挤掉最低的、其余往前挪。
 * 不另存时间戳：槽位本身就是队列。
 */
type InteriorEntry = { gifts: Array<string | null>; boxed: string[] };

let interiors: Record<string, InteriorEntry> = {};

export function snapshotInteriors(): WorldSave["interiors"] {
  return Object.keys(interiors).length > 0 ? structuredClone(interiors) : undefined;
}

export function restoreInteriors(saved: WorldSave["interiors"]): void {
  interiors = structuredClone(saved ?? {});
  emit("interiors_changed", { reason: "restore" });
}

export function listInteriors(): Record<string, InteriorEntry> {
  return structuredClone(interiors);
}

export function interiorOf(instanceId: string): InteriorEntry | undefined {
  return interiors[instanceId];
}

function definitionIdOf(residentId: string): string | undefined {
  const agent = getResidents().find((entry) => entry.residentId === residentId);
  const definitionId = agent?.definitionId ?? residentId.replace(/^resident-/, "");
  return findResidentDefinition(definitionId) ? definitionId : undefined;
}

export type InteriorPlaceResult = {
  /** 这件最后落在哪 */
  where: "interior" | "porch";
  instanceId: string;
  /** 被挤到门口的 / 进箱的 */
  movedToPorch?: string;
  boxed?: string;
};

/**
 * 把一件东西摆进他屋里。返回它落在哪；摆不了（没房子 / 不是家具 / 做客中）返回 null。
 * 没有室内的房子退回门口（`placeOnPorch`）——调用方不用分两条路。
 */
export function placeInInterior(residentId: string, itemId?: string): InteriorPlaceResult | null {
  if (isRemoteWorld()) return null;
  const chosen = itemId ?? lastLovedFurnitureOf(residentId);
  const item = chosen ? findPlaceableItem(chosen) : undefined;
  if (!chosen || !item) return null;
  const definitionId = definitionIdOf(residentId);
  if (!definitionId) return null;

  const home = homeInteriorOf(definitionId);
  if (!home) {
    const porch = placeOnPorch(residentId, chosen);
    return porch ? { where: "porch", instanceId: porch.instanceId } : null;
  }

  const { instanceId } = home.placement;
  const slots = home.interior.giftSlots;
  const entry: InteriorEntry = interiors[instanceId] ?? { gifts: [], boxed: [] };
  const gifts = slots.map((_, index) => entry.gifts[index] ?? null);

  // 同一件不摆两次
  if (gifts.includes(chosen)) return { where: "interior", instanceId };

  const surface = giftSurfaceOf(item.placement.surface);
  const mine = slots.map((slot, index) => (slot.surface === surface ? index : -1)).filter((index) => index >= 0);
  if (mine.length === 0) {
    // 这屋子没有这一面的槽（比如没地方挂东西）：直接去门口
    const porch = placeOnPorch(residentId, chosen);
    return porch ? { where: "porch", instanceId: porch.instanceId } : null;
  }

  const result: InteriorPlaceResult = { where: "interior", instanceId };
  const free = mine.find((index) => gifts[index] === null);
  if (free !== undefined) {
    gifts[free] = chosen;
  } else {
    // 满了：最低下标的是最早的，挤出去，其余往前挪，新的放最后
    const evicted = gifts[mine[0]]!;
    for (let i = 0; i < mine.length - 1; i += 1) gifts[mine[i]] = gifts[mine[i + 1]];
    gifts[mine[mine.length - 1]] = chosen;
    const porch = placeOnPorch(residentId, evicted);
    if (porch) {
      result.movedToPorch = evicted;
      if (porch.evicted) {
        entry.boxed.push(porch.evicted);
        result.boxed = porch.evicted;
      }
    } else {
      entry.boxed.push(evicted);
      result.boxed = evicted;
    }
  }

  interiors[instanceId] = { gifts, boxed: entry.boxed };
  emit("interiors_changed", { reason: "place" });

  // 他说一句：挪到门口了 / 收进箱子了（有的话）
  const agent = getResident(residentId);
  if (agent && !agent.puppet) {
    if (result.boxed) agent.say("talk.common.boxed", 4);
    else if (result.movedToPorch) agent.say("talk.common.moved_to_porch", 4);
  }
  return result;
}

export function clearInterior(residentId: string): boolean {
  if (isRemoteWorld()) return false;
  const definitionId = definitionIdOf(residentId);
  const home = definitionId ? homeInteriorOf(definitionId) : undefined;
  if (!home || !interiors[home.placement.instanceId]) return false;
  delete interiors[home.placement.instanceId];
  emit("interiors_changed", { reason: "clear" });
  return true;
}
