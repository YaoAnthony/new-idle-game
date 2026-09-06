import { FurnitureCapability } from "../../types/furniture.js";
import type { SpotKind } from "../../types/residents.js";

/**
 * 场所表（居民系统 02）：**哪种东西算哪种场所**。只写"怎么认出来"，不写任何实例 id。
 *
 * 动森村民会坐你摆在户外的椅子，前提是椅子"能坐"——所以场所从家具的**能力**和
 * 建筑的**型号**推，不从 id 推。摆一把新椅子、换一家店，这张表一个字不用改。
 * 把表翻成当前世界里的坐标是前端 `Systems/residents/spots.ts` 的事（每次现算，不缓存）。
 *
 * 到达后做什么这一版还写在 routine 技能里；12 落地后由活动表接管，这张表只剩识别。
 */
export type SpotSource =
  /** 带某种能力的家具。`outdoor` = 只认摆在室外的 */
  | { kind: "furniture_capability"; capability: FurnitureCapability; outdoor: boolean }
  /** 某型号建筑的门口一步 */
  | { kind: "building_door"; buildingId: string }
  /** 领地地标（旧井这类地块布景） */
  | { kind: "landmark"; landmarkId: string }
  /** 别的居民的房门口 */
  | { kind: "resident_home" };

export type SpotDefinition = {
  kind: SpotKind;
  sources: SpotSource[];
  /** 站定后和目标保持的距离（米）。座位要贴着，店门口站远一点 */
  reach: number;
};

export const spotDefinitions = [
  {
    kind: "seat",
    sources: [{ kind: "furniture_capability", capability: FurnitureCapability.Sitting, outdoor: true }],
    reach: 0.9,
  },
  {
    kind: "water",
    sources: [
      { kind: "furniture_capability", capability: FurnitureCapability.WaterSource, outdoor: true },
      { kind: "landmark", landmarkId: "landmark_old_well" },
    ],
    reach: 1.4,
  },
  {
    kind: "shop",
    sources: [{ kind: "building_door", buildingId: "furniture_shop" }],
    reach: 1.2,
  },
  {
    kind: "consign",
    sources: [{ kind: "furniture_capability", capability: FurnitureCapability.Consign, outdoor: true }],
    reach: 1.2,
  },
  {
    kind: "neighbor_door",
    sources: [{ kind: "resident_home" }],
    reach: 1.2,
  },
] as const satisfies readonly SpotDefinition[];

export function findSpotDefinition(kind: SpotKind): SpotDefinition | undefined {
  return (spotDefinitions as readonly SpotDefinition[]).find((entry) => entry.kind === kind);
}

/** 场所表里认识的全部种类。content 测试用它校性格表里的 spot */
export const SPOT_KINDS: readonly SpotKind[] = spotDefinitions.map((entry) => entry.kind);
