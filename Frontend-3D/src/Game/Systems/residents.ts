import { CreatureRole } from "core";
import { on } from "../EventBus";
import { findPlacement } from "../State/buildings";
import { getPet, getPets } from "../State/petsRuntime";
import { signal } from "./story";

/**
 * 居民（期 4）：房子建成 → 他搬进去。
 *
 * "搬进去"落到运行时是两件事：
 *
 * 1. **驻地重定向**：`PetAgent.rehome` 把乱走的圆心挪到他家门口。
 *    他会自己溜达过去（不瞬移），home 进存档，读档不漂移——
 *    石傀儡那期定的规矩：驻地不能拿"读档时站的位置"顶，否则每存读
 *    一次就朝溜达到的地方挪一次，几回就漂没了。
 * 2. **发 `resident_moved_in` 信号**（subject = 物种 definitionId）。
 *    "满三位开家具小店"（期 5）数的就是它——不数 `pet_spawned`，
 *    那个会把水獭和石傀儡一起算进去。
 *
 * ## 房和人的对应从哪来
 *
 * 一张点名表（HOUSE_OF）。**不从命名约定推**（`slime_house` → 掐掉
 * `_house` 就是物种？）——约定推导在两边各自改名时静默失效，而这张表
 * 三行，错了 content 测试当场点名。
 */
const HOUSE_OF: Record<string, string> = {
  slime_house: "slime_neighbor",
  fox_house: "fox_neighbor",
  spirit_house: "spirit_neighbor",
};

/** 谁的房子？测试和期 5 的客源名单都问它 */
export function residentOfHouse(buildingId: string): string | undefined {
  return HOUSE_OF[buildingId];
}

/** 已经搬进来的居民（在场 + 是居民档）。期 5 小店的客源名单 */
export function listResidents(): string[] {
  return getPets()
    .filter((pet) => pet.role === CreatureRole.Resident)
    .map((pet) => pet.petId);
}

/**
 * 搬入。找不到人（房子建好时他不在场——理论上不会：到来规则先 spawn）
 * 就静默跳过，**信号照发**：进度不该被一个演出性的缺席卡住。
 */
function moveResidentIn(instanceId: string, buildingId: string): void {
  const species = HOUSE_OF[buildingId];
  if (!species) return;

  const placement = findPlacement(instanceId);
  if (placement) {
    /*
     * 驻地设在**门口外一步**，不是房子中心：房子中心在墙里面，
     * 乱走的候选点会全部落进屋里，他就永远"闷在家里"。门口那一步
     * 让他在自家门前转悠——那才是"住在这儿"的样子。
     *
     * 门在正面（本地 +z），实例的 facing 决定正面朝世界的哪边——
     * 占位壳是 3×3，门口外一步 ≈ 沿正面方向 2.2。四个朝向查表，
     * 和家具的 FACING_ROTATION 同一套语义。
     */
    const OUT: Record<string, [number, number]> = {
      north: [0, 2.2],
      south: [0, -2.2],
      east: [2.2, 0],
      west: [-2.2, 0],
    };
    const [dx, dz] = OUT[placement.facing] ?? [0, 2.2];
    const pet = getPets().find((p) => p.definitionId === species);
    if (pet) pet.rehome(placement.x + dx, placement.z + dz);
  }

  signal("resident_moved_in", species);
}

let detach: (() => void) | null = null;

/** 挂上完工监听。整个应用只调一次（Game3D 常驻系统） */
export function startResidents(): () => void {
  if (detach) return detach;
  const off = on("building_completed", ({ buildingId, instanceId }) => {
    moveResidentIn(instanceId, buildingId);
  });
  detach = () => {
    off();
    detach = null;
  };
  return detach;
}

/** 某位居民搬进来了吗（他的房子在世界里 = 搬过）。调试指令用 */
export function isResidentHoused(species: string): boolean {
  const pet = getPet(`pet-${species.replace("_neighbor", "")}`);
  return Boolean(pet);
}
