import type { FeatureId, GridFootprint } from "../types/base.js";
import type { ItemId } from "../types/items.js";
import type { BuildingPlacement } from "../types/building.js";
import type { TerritoryDefinition } from "../types/territory.js";
import { Facing } from "../types/base.js";
import type { DeckRect } from "./roomGeometry.js";
import { rectInsideTerritory } from "./territory.js";

/**
 * 建筑规则。**纯函数，Backend 可复用**——和领地、门、放置同一条纪律。
 *
 * 这里收的是**"等级的样子"的一个子集**（`LevelShape`）而不是整个
 * `BuildingLevel`：完整定义住在 Frontend（带 three.js 的 `build()`），
 * Core 不能 import 它。签名只要占地和那几张升级用的表——规则需要知道的
 * 就这些，多要一点就把渲染拖进来了。
 */

export type MaterialCost = ReadonlyArray<{ itemId: ItemId; quantity: number }>;

export type LevelShape = {
  levelId: string;
  footprint: GridFootprint;
  nextLevelIds?: string[];
  /**
   * **从无到有盖起来**要什么（只有初始等级用得上）。
   *
   * 和 `upgradeCost` 分成两个字段而不是塞进同一张表：建造的代价挂在
   * "第一级"上，升级的代价挂在"从这一级到那一级"上，键的含义根本不同。
   * 硬合成一张表就得约定一个"从无到有"的假 levelId。
   */
  buildCost?: MaterialCost;
  upgradeCost?: Record<string, Array<{ itemId: ItemId; quantity: number }>>;
  requires?: Record<string, Array<{ buildingId: string; minLevelId: string }>>;
};

/**
 * 材料够不够。建造和升级共用——两处各写一份判断迟早走散。
 *
 * `materials` 是**"玩家现在有多少"**的清单，调用方怎么凑出来是它的事：
 * Frontend 那边是"背包各物品的数量 + 金币"，金币用保留 id `"gold"` 混在
 * 同一张表里（它不是背包里的物品，但对这条规则来说和木板没有分别）。
 * 这一层不知道也不该知道钱存在罐子里这回事。
 */
export function missingMaterials(
  cost: MaterialCost,
  materials?: ReadonlyMap<ItemId, number>,
): Array<{ itemId: ItemId; quantity: number }> {
  return cost.filter((need) => (materials?.get(need.itemId) ?? 0) < need.quantity);
}

export type BuildCostCheck =
  | { ok: true }
  | { ok: false; reason: "missing_materials"; missing: Array<{ itemId: ItemId; quantity: number }> };

// ---- 连成一片的建筑（围墙）----

/** 四个世界方向上有没有同类邻居 */
export type WallSides = {
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
};

type WallCell = Pick<BuildingPlacement, "x" | "z" | "buildingId" | "instanceId">;

/**
 * 这一格围墙的**四邻**。木墙靠它决定自己长什么样：孤零零一根柱子，
 * 还是一段直墙、一个拐角、一个丁字口。
 *
 * ## 判据是"同型号 + 正好隔一格"
 *
 * 同型号：木墙不该和金币罐连起来。正好一格：围墙是 1×1 的，中心之间
 * 差 1 就是贴着。用 `EPSILON` 兜浮点——坐标落在半格上（奇偶宽的吸附
 * 规则），差值算出来是 0.9999999 这种数。
 *
 * ## 为什么返回四个布尔而不是一个"形状名"
 *
 * 返回 `"L" | "T" | "I"` 的话，表现层还得知道 L 是哪两个方向的 L，
 * 于是又要一个旋转角——形状名加旋转角是同一份信息的两次编码，迟早
 * 有一处写反。四个布尔直接就是"哪几边要伸出去"，模型照着长胳膊就行，
 * I/L/T/十 全都是这一条规则的结果，不用枚举。
 */
export function wallConnections(
  self: WallCell,
  others: readonly WallCell[],
): WallSides {
  const EPSILON = 0.05;
  const sides: WallSides = {
    north: false,
    east: false,
    south: false,
    west: false,
  };

  for (const other of others) {
    if (other.instanceId === self.instanceId) continue;
    if (other.buildingId !== self.buildingId) continue;

    const dx = other.x - self.x;
    const dz = other.z - self.z;
    if (Math.abs(dz) < EPSILON && Math.abs(Math.abs(dx) - 1) < EPSILON) {
      if (dx > 0) sides.east = true;
      else sides.west = true;
    } else if (Math.abs(dx) < EPSILON && Math.abs(Math.abs(dz) - 1) < EPSILON) {
      // 世界的 +z 是南（和 Facing 那套一致）
      if (dz > 0) sides.south = true;
      else sides.north = true;
    }
  }

  return sides;
}

// ---- 施工 ----

/**
 * 这块工地干到哪儿了（0..1）。
 *
 * 三种情况分得很清楚：
 * - 不在施工 → 1（已经是成品）
 * - 在队里等着（没 `workerId` / 没时刻）→ **0**，而且不会自己往前走
 * - 有人在建 → 按 `(now − start) / (finish − start)` 线性推
 *
 * 排队的那一档是这套规则的重点。时刻在工人认领时才写，所以"玩家关掉
 * 游戏一天再回来，排队的工地全建好了"这件事在**数据上就不可能发生**，
 * 不需要在别处补一层判断。
 */
export function constructionProgress(
  placement: Pick<BuildingPlacement, "construction">,
  nowUtc: string,
): number {
  const site = placement.construction;
  if (!site) return 1;
  if (!site.startUtc || !site.finishUtc) return 0;

  const start = Date.parse(site.startUtc);
  const finish = Date.parse(site.finishUtc);
  const now = Date.parse(nowUtc);
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish <= start) {
    return 0;
  }
  return Math.max(0, Math.min(1, (now - start) / (finish - start)));
}

/** 建完了吗。没在施工的答 false——它早就是成品，没有"刚建完"这一刻 */
export function isConstructionDone(
  placement: Pick<BuildingPlacement, "construction">,
  nowUtc: string,
): boolean {
  if (!placement.construction) return false;
  return constructionProgress(placement, nowUtc) >= 1;
}

/** 这块工地在排队（蓝图落了、围栏立了，但还没人来干） */
export function isConstructionQueued(
  placement: Pick<BuildingPlacement, "construction">,
): boolean {
  const site = placement.construction;
  return Boolean(site && !site.workerId);
}

/** 盖得起吗（只管材料；能不能放在那儿是 `checkBuildingPlacement` 的事） */
export function checkBuildAfford(options: {
  level: Pick<LevelShape, "buildCost">;
  materials?: ReadonlyMap<ItemId, number>;
}): BuildCostCheck {
  const missing = missingMaterials(options.level.buildCost ?? [], options.materials);
  if (missing.length > 0) return { ok: false, reason: "missing_materials", missing };
  return { ok: true };
}

/**
 * 这栋楼在世界里的占地矩形。
 *
 * 占地取**当前等级**的（升级会变大），`facing` 是 East/West 时宽深互换
 * ——和家具占地同一个道理，四向旋转下矩形转完还是轴对齐矩形。
 */
export function buildingRectWorld(
  placement: Pick<BuildingPlacement, "x" | "z" | "facing">,
  footprint: GridFootprint,
): DeckRect {
  const rotated =
    placement.facing === Facing.East || placement.facing === Facing.West;
  const halfW = (rotated ? footprint.height : footprint.width) / 2;
  const halfD = (rotated ? footprint.width : footprint.height) / 2;
  return {
    minX: placement.x - halfW,
    maxX: placement.x + halfW,
    minZ: placement.z - halfD,
    maxZ: placement.z + halfD,
  };
}

export type BuildCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "outside_territory"
        | "overlaps_building"
        | "cell_occupied"
        | "max_instances";
    };

/**
 * 这栋楼能不能放在这。
 *
 * **地面平整度和"压不压到桥/出入口"不在这儿**——那是
 * `checkHousePlacement` 已经写好的一整套判据，房子和建筑是同一件事的
 * 两个尺寸，判据不该有两份。调用方两边都问一次，各取所长。
 *
 * `excludeInstanceId` 是给**移动**用的：不排除自己的话，原地微调会被
 * 判成"压到了自己"。
 */
export function checkBuildingPlacement(options: {
  rect: DeckRect;
  /** 领地。不给 = 这张图没有领地，整图能建 */
  territory?: { definition: TerritoryDefinition; unlocked: ReadonlySet<FeatureId> };
  /** 场上其他建筑的占地。移动时要排除自己 */
  others: Array<{ instanceId: string; rect: DeckRect }>;
  excludeInstanceId?: string;
  /** 院子占用图里已被占的世界整数格（`"x,z"`） */
  occupiedCells?: ReadonlySet<string>;
  /** 这个型号已有几栋、最多几栋 */
  instances?: { current: number; max?: number };
}): BuildCheck {
  const { rect, territory, others, excludeInstanceId, occupiedCells, instances } =
    options;

  if (
    instances?.max !== undefined &&
    instances.current >= instances.max
  ) {
    return { ok: false, reason: "max_instances" };
  }

  if (territory && !rectInsideTerritory(territory.definition, territory.unlocked, rect)) {
    return { ok: false, reason: "outside_territory" };
  }

  for (const other of others) {
    if (other.instanceId === excludeInstanceId) continue;
    if (
      rect.minX < other.rect.maxX &&
      rect.maxX > other.rect.minX &&
      rect.minZ < other.rect.maxZ &&
      rect.maxZ > other.rect.minZ
    ) {
      return { ok: false, reason: "overlaps_building" };
    }
  }

  if (occupiedCells) {
    for (let x = Math.floor(rect.minX); x < Math.ceil(rect.maxX); x += 1) {
      for (let z = Math.floor(rect.minZ); z < Math.ceil(rect.maxZ); z += 1) {
        if (occupiedCells.has(`${x},${z}`)) {
          return { ok: false, reason: "cell_occupied" };
        }
      }
    }
  }

  return { ok: true };
}

export type RemoveCheck =
  | { ok: true }
  | { ok: false; reason: "not_empty"; detail: { furniture?: number; gold?: number } };

/**
 * 能不能拆。**非空不给拆**，和"升级必须先搬空"同一条规矩。
 *
 * 屋里有家具 / 罐里有钱就拒绝，并说清楚是哪一样、还剩多少。
 * 静默吞掉玩家的东西是这套设计明确要避免的事——拆一栋楼的代价必须
 * 是玩家自己先做的一个决定。
 */
export function checkRemove(contents: {
  furniture?: number;
  gold?: number;
}): RemoveCheck {
  const furniture = contents.furniture ?? 0;
  const gold = contents.gold ?? 0;
  if (furniture > 0 || gold > 0) {
    return {
      ok: false,
      reason: "not_empty",
      detail: {
        ...(furniture > 0 ? { furniture } : {}),
        ...(gold > 0 ? { gold } : {}),
      },
    };
  }
  return { ok: true };
}

export type UpgradeCheck =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "max_level"
        | "unknown_target"
        | "not_a_successor"
        | "missing_materials"
        | "requires_unmet"
        | "not_empty";
      unmet?: Array<{ buildingId: string; minLevelId: string }>;
      missing?: Array<{ itemId: ItemId; quantity: number }>;
      itemCount?: number;
    };

/** 这一级能升到哪几级（给指令和选址 UI 列选项） */
export function successorsOf(level: LevelShape): string[] {
  return level.nextLevelIds ?? [];
}

/**
 * 能不能升到 `targetLevelId`。
 *
 * **必须指定目标。** 分叉之后"升级"不再是一个动作而是一个选择：不指定
 * 就默认第一个后继的话，房子会在玩家没选的情况下悄悄变成 3a。
 *
 * 三道门今天都是空的但**路径是通的**——`upgradeCost` 空 = 材料恒够、
 * `requires` 空 = 前置恒满足、`furnitureInside` 为 0 = 屋里是空的。
 * 以后填数据即生效，不用改这个函数。
 */
export function checkUpgrade(options: {
  level: LevelShape;
  targetLevelId: string;
  /** 玩家背包里各物品的数量 */
  materials?: ReadonlyMap<ItemId, number>;
  /** 领地上其他建筑的当前等级，判 requires 用 */
  others?: ReadonlyArray<{ buildingId: string; levelId: string }>;
  /** 这栋楼内景里还有几件家具。> 0 就不给升 */
  furnitureInside?: number;
  /** 判 requires 时"这一级算不算达到了 minLevelId"。不给 = 只认相等 */
  levelReaches?: (buildingId: string, levelId: string, minLevelId: string) => boolean;
}): UpgradeCheck {
  const { level, targetLevelId, materials, others, furnitureInside, levelReaches } =
    options;

  const successors = successorsOf(level);
  if (successors.length === 0) return { ok: false, reason: "max_level" };
  if (!successors.includes(targetLevelId)) {
    /*
     * 分两种理由，因为玩家该看到的话不一样：目标压根不是这个型号的
     * 等级（打错了）vs 目标存在但不是这一级的后继（想跳级）。
     * 前者靠调用方查型号确认，这里只在"不是后继"里区分不出来时报
     * unknown_target——所以调用方传进来的 targetLevelId 必须是它已经
     * 在型号里查到过的。
     */
    return { ok: false, reason: "not_a_successor" };
  }

  /*
   * **屋里非空不给升**（B11）。这一条同时消掉了"升级时家具会不会丢"
   * 那个最大的数据风险：没有家具，就没有归属问题。
   *
   * 不自动搬空：那是替玩家做决定，而且背包放不下时还要处理溢出。
   * 让玩家自己动手，顺带也是一次"你真的要升级吗"。
   */
  if ((furnitureInside ?? 0) > 0) {
    return { ok: false, reason: "not_empty", itemCount: furnitureInside };
  }

  const requires = level.requires?.[targetLevelId] ?? [];
  const unmet = requires.filter((need) => {
    const other = others?.find((item) => item.buildingId === need.buildingId);
    if (!other) return true;
    return levelReaches
      ? !levelReaches(need.buildingId, other.levelId, need.minLevelId)
      : other.levelId !== need.minLevelId;
  });
  if (unmet.length > 0) return { ok: false, reason: "requires_unmet", unmet };

  const missing = missingMaterials(level.upgradeCost?.[targetLevelId] ?? [], materials);
  if (missing.length > 0) return { ok: false, reason: "missing_materials", missing };

  return { ok: true };
}
