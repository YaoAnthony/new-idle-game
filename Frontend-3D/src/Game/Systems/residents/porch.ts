import { findItemDefinition, findResidentDefinition, type WorldSave } from "core";
import { findBuildingLevel } from "../../../Buildings/index";
import { emit } from "../../EventBus";
import { isRemoteWorld } from "../../Multiplayer/worldLock";
import { getResidents } from "../../State/residentsRuntime";
import { homeOf } from "./spots";

/**
 * 门口展示位与门牌（居民系统 07）。
 *
 * 你送他的、他求你做的家具摆在他门口；家人档那天门上挂一块写你名字的牌。
 * 状态表 `WorldSave.porch`：建筑实例 id → 几件（队列，满了替换最早的）+ 门牌。
 * **只有剧情效果 porch_place / porch_nameplate 写它**（送礼、委托做完的规则接）；
 * 不占格、不参与碰撞、玩家搬不走（它不是 placedFurniture）。进存档也进刷新切片。
 * 门牌上的名字不存：渲染时读玩家名。
 */
type PorchEntry = { items: Array<string | null>; namePlate?: boolean };

let porch: Record<string, PorchEntry> = {};

/** 送礼那一拍记的：这位最近一次收到的、爱吃档的家具。porch_place 不带 itemId 时用 */
const lastLovedFurniture = new Map<string, string>();

export function snapshotPorch(): WorldSave["porch"] {
  return Object.keys(porch).length > 0 ? structuredClone(porch) : undefined;
}

export function restorePorch(saved: WorldSave["porch"]): void {
  porch = structuredClone(saved ?? {});
  emit("porch_changed", { reason: "restore" });
}

export function listPorch(): Record<string, PorchEntry> {
  return structuredClone(porch);
}

export function porchOf(instanceId: string): PorchEntry | undefined {
  return porch[instanceId];
}

/** 这栋有几个展示位（建筑定义上的） */
export function porchSlotCount(instanceId: string, buildingId: string, levelId: string): number {
  void instanceId;
  return findBuildingLevel(buildingId, levelId)?.porchSlots?.length ?? 0;
}

export function noteLovedGift(residentId: string, itemId: string): void {
  if (findItemDefinition(itemId)?.placement) lastLovedFurniture.set(residentId, itemId);
}

/** 送礼那一拍记的那件（interior_place 不带 itemId 时也用它，08） */
export function lastLovedFurnitureOf(residentId: string): string | undefined {
  return lastLovedFurniture.get(residentId);
}

function houseInstanceOf(residentId: string): { instanceId: string; buildingId: string; levelId: string } | undefined {
  const agent = getResidents().find((entry) => entry.residentId === residentId);
  const definitionId = agent?.definitionId ?? residentId.replace(/^resident-/, "");
  if (!findResidentDefinition(definitionId)) return undefined;
  const home = homeOf(definitionId);
  return home ? { instanceId: home.instanceId, buildingId: home.buildingId, levelId: home.levelId } : undefined;
}

/**
 * 摆一件到他门口。满了替换最早的——被挤掉的那件一起返回（08 起挤掉的进他屋里的箱子）。
 * 返回摆到了哪栋；摆不了（没房子 / 没展示位 / 做客中）返回 null。
 */
export function placeOnPorch(residentId: string, itemId?: string): { instanceId: string; evicted?: string } | null {
  if (isRemoteWorld()) return null;
  const chosen = itemId ?? lastLovedFurniture.get(residentId);
  if (!chosen || !findItemDefinition(chosen)) return null;
  const house = houseInstanceOf(residentId);
  if (!house) return null;
  const slots = porchSlotCount(house.instanceId, house.buildingId, house.levelId);
  if (slots <= 0) return null;
  const entry = porch[house.instanceId] ?? { items: [] };
  const items = entry.items.filter((item): item is string => item !== null);
  // 同一件不摆两次；满了替换最早的
  const queue = [...items.filter((item) => item !== chosen), chosen];
  const next = queue.slice(-slots);
  const evicted = queue.length > slots ? queue[0] : undefined;
  porch[house.instanceId] = { ...entry, items: next };
  emit("porch_changed", { reason: "place" });
  return evicted ? { instanceId: house.instanceId, evicted } : { instanceId: house.instanceId };
}

export function clearPorch(residentId: string): boolean {
  if (isRemoteWorld()) return false;
  const house = houseInstanceOf(residentId);
  if (!house || !porch[house.instanceId]) return false;
  porch[house.instanceId] = { ...porch[house.instanceId], items: [] };
  emit("porch_changed", { reason: "clear" });
  return true;
}

export function setNamePlate(residentId: string, on: boolean): boolean {
  if (isRemoteWorld()) return false;
  const house = houseInstanceOf(residentId);
  if (!house) return false;
  const entry = porch[house.instanceId] ?? { items: [] };
  porch[house.instanceId] = { ...entry, namePlate: on || undefined };
  emit("porch_changed", { reason: "nameplate" });
  return true;
}
