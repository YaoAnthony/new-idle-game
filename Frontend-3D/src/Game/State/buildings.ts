import {
  Facing,
  buildingRectWorld,
  checkBuildingPlacement,
  checkRemove,
  checkUpgrade,
  roomCellToWorld,
  successorsOf,
  totalCapacity,
  type BuildCheck,
  type BuildingPlacement,
  type DeckRect,
  type LevelShape,
  type RemoveCheck,
  type RoomSave,
  type UpgradeCheck,
} from "core";

import { emit } from "../EventBus";
import { guardWorldMutation } from "../Multiplayer/worldLock";
import { nextObjectId, syncIdCounters } from "./ids";
import { findBuilding, findBuildingLevel } from "../../Buildings/index";
import { materialCounts, spendMaterials } from "../Systems/materials";
import { getUnlockedFeatures } from "../Systems/events";
import {
  getCurrentMap,
  getRoom,
  getRoomStyle,
  getRooms,
  getWorld,
  replaceRooms,
} from "./worldRuntime";

/**
 * 玩家在领地里建的建筑：**唯一的读写口**。
 *
 * 规则全在 Core（`logic/buildings`），这一层做三件事：把型号（住在
 * Frontend，带 three.js 的 `build()`）拆成 Core 认得的 `LevelShape` 喂进去、
 * 管实例列表、发事件。
 *
 * 小镇那六家店**不经过这里**——它们是地图内容（`MapDefinition.buildings`），
 * 每次进图从定义生成，不进存档也不会升级。这里只管玩家自己建的。
 */

let placements: BuildingPlacement[] = [];

/** 型号的某一级 → Core 认得的形状。剥掉 build/interior 那些带 three.js 的 */
function shapeOf(buildingId: string, levelId?: string): LevelShape | undefined {
  const level = findBuildingLevel(buildingId, levelId);
  if (!level) return undefined;
  return {
    levelId: level.levelId,
    footprint: level.footprint,
    nextLevelIds: level.nextLevelIds,
    upgradeCost: level.upgradeCost,
    requires: level.requires,
  };
}

export function listBuildings(): readonly BuildingPlacement[] {
  return placements;
}

export function findPlacement(instanceId: string): BuildingPlacement | undefined {
  return placements.find((item) => item.instanceId === instanceId);
}

/** 这栋楼此刻的占地矩形（按它当前等级算） */
export function rectOf(placement: BuildingPlacement): DeckRect {
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  return buildingRectWorld(placement, level?.footprint ?? { width: 1, height: 1 });
}

/** 领地参数。没有领地的图给 undefined，Core 那边就不判这一条 */
function territoryArg() {
  const definition = getCurrentMap().territory;
  if (!definition) return undefined;
  return { definition, unlocked: new Set(getUnlockedFeatures()) };
}

/**
 * 院子占用图里已被占的**世界整数格**（院里的家具、主屋的脚印）。
 *
 * 占用图的键是**房本地格**，而建筑占地是世界矩形——两者差一个由院子
 * 锚点决定的平移。走 Core 的 `roomCellToWorld` 换算，不在这儿按
 * "减一半宽"重算一遍：那正是"房子中心 = 世界原点"公理反复复活的方式。
 */
function occupiedWorldCells(): Set<string> {
  const yardId = getCurrentMap().outdoorRoomId;
  const yard = getRoom(yardId);
  const cells = new Set<string>();
  if (!yard) return cells;

  for (const key of getWorld().occupancyOf(yardId).blocked) {
    const [cx, cy] = key.split(",").map(Number);
    // roomCellToWorld 给的是**格心**；它落在哪个世界整数格里，就占哪一格
    const world = roomCellToWorld(yard, cx, cy);
    cells.add(`${Math.floor(world.x)},${Math.floor(world.z)}`);
  }
  return cells;
}

function othersFor(excludeInstanceId?: string) {
  return placements
    .filter((item) => item.instanceId !== excludeInstanceId)
    .map((item) => ({ instanceId: item.instanceId, rect: rectOf(item) }));
}

function instanceCount(buildingId: string): number {
  return placements.filter((item) => item.buildingId === buildingId).length;
}

export type BuildingActionResult =
  | { ok: true; instanceId: string }
  | { ok: false; reason: string; detail?: unknown };

/**
 * 校验一个落点，**不写状态**。
 *
 * 建造 / 移动 / 升级三条路和虚影预览走的是同一个函数——两条路各写一套
 * 规则的话，UI 显示绿色而提交被拒是迟早的事。
 */
export function previewPlacement(options: {
  buildingId: string;
  levelId?: string;
  x: number;
  z: number;
  facing: Facing;
  excludeInstanceId?: string;
  /** 建造时判实例上限；移动和升级不判（那栋楼本来就已经存在） */
  countsAsNew?: boolean;
}): BuildCheck {
  const level = findBuildingLevel(options.buildingId, options.levelId);
  if (!level) return { ok: false, reason: "cell_occupied" };

  const definition = findBuilding(options.buildingId);
  const rect = buildingRectWorld(
    { x: options.x, z: options.z, facing: options.facing },
    level.footprint,
  );
  return checkBuildingPlacement({
    rect,
    territory: territoryArg(),
    others: othersFor(options.excludeInstanceId),
    excludeInstanceId: options.excludeInstanceId,
    occupiedCells: occupiedWorldCells(),
    instances: options.countsAsNew
      ? { current: instanceCount(options.buildingId), max: definition?.maxInstances }
      : undefined,
  });
}

export function placeBuilding(
  buildingId: string,
  x: number,
  z: number,
  facing: Facing = Facing.North,
  options: { asSite?: boolean } = {},
): BuildingActionResult {
  if (guardWorldMutation()) return { ok: false, reason: "busy" };

  const definition = findBuilding(buildingId);
  if (!definition) return { ok: false, reason: "unknown_building" };

  const check = previewPlacement({ buildingId, x, z, facing, countsAsNew: true });
  if (check.ok === false) return { ok: false, reason: check.reason };

  const firstLevel = definition.levels[0].levelId;
  /*
   * `asSite`：落下去的是**工地**不是成品。
   *
   * 工地就是这栋建筑的一个阶段，不另立实体——占地校验、迁移、拆除全部
   * 立刻复用现成规则。区别只在 `construction` 这一块在不在。
   *
   * 开工时刻**不在这里写**：那是工人认领时的事（见 `claimSite`）。
   * 下单就按墙钟算的话，玩家去睡一觉回来排队的全建好了。
   */
  const placement: BuildingPlacement = {
    instanceId: nextObjectId("building", buildingId),
    buildingId,
    x,
    z,
    elevation: 0,
    facing,
    // 新建出来就是**初始等级**（levels[0]）
    levelId: firstLevel,
    ...(options.asSite
      ? { construction: { targetLevelId: firstLevel } }
      : {}),
  };
  placements = [...placements, placement];
  syncBuildingInteriors();
  emit("world_changed", { reason: "buildings" });
  return { ok: true, instanceId: placement.instanceId };
}

// ---- 施工 ----

/**
 * 型号没写 `buildDuration` 时的工期（秒）。
 *
 * 给一个数而不是 0：0 会让工地在落地那一帧就完工，玩家看不见围栏也看不见
 * 石傀儡走过来——那正是这一整套要演的东西。20 秒是测试期的值，正式平衡
 * 时每个型号自己写。
 */
const DEFAULT_BUILD_SECONDS = 20;

/** 场上所有工地（有 construction 的），按下单先后（数组顺序）排 */
export function listSites(): BuildingPlacement[] {
  return placements.filter((item) => item.construction);
}

/**
 * 工人认领一块工地：写上 workerId 和**开工/完工时刻**。
 *
 * 时刻在这一刻才写，是整套排队规则的支点——见 `BuildingPlacement.construction`
 * 的注释。工期从型号表的 `buildDuration` 查，查不到给个兜底值。
 */
export function claimSite(instanceId: string, workerId: string, nowUtc: string): boolean {
  const placement = placements.find((item) => item.instanceId === instanceId);
  if (!placement?.construction || placement.construction.workerId) return false;

  const target = placement.construction.targetLevelId;
  const level = findBuildingLevel(placement.buildingId, target);
  const seconds = level?.buildDuration?.[target] ?? DEFAULT_BUILD_SECONDS;
  const start = Date.parse(nowUtc);

  placements = placements.map((item) =>
    item.instanceId === instanceId
      ? {
          ...item,
          construction: {
            ...item.construction!,
            workerId,
            startUtc: nowUtc,
            finishUtc: new Date(start + seconds * 1000).toISOString(),
          },
        }
      : item,
  );
  emit("world_changed", { reason: "buildings" });
  return true;
}

/** 工人放手（被引开、读档、傀儡没了）。工地退回队列，进度清零重来 */
export function releaseSite(instanceId: string): void {
  const placement = placements.find((item) => item.instanceId === instanceId);
  if (!placement?.construction) return;
  placements = placements.map((item) =>
    item.instanceId === instanceId
      ? {
          ...item,
          construction: { targetLevelId: item.construction!.targetLevelId },
        }
      : item,
  );
  emit("world_changed", { reason: "buildings" });
}

/**
 * 完工：`construction` 摘掉，`levelId` 落到目标等级。
 *
 * 建造和升级走**同一条**完工路径——两者的区别只在下单时 `targetLevelId`
 * 是不是当前等级。
 */
export function finishSite(instanceId: string): void {
  const placement = placements.find((item) => item.instanceId === instanceId);
  if (!placement?.construction) return;
  const target = placement.construction.targetLevelId;
  placements = placements.map((item) =>
    item.instanceId === instanceId
      ? { ...item, levelId: target, construction: undefined }
      : item,
  );
  syncBuildingInteriors();
  emit("world_changed", { reason: "buildings" });
}

export function moveBuilding(
  instanceId: string,
  x: number,
  z: number,
  facing?: Facing,
): BuildingActionResult {
  if (guardWorldMutation()) return { ok: false, reason: "busy" };

  const placement = findPlacement(instanceId);
  if (!placement) return { ok: false, reason: "unknown_instance" };

  const nextFacing = facing ?? placement.facing;
  const check = previewPlacement({
    buildingId: placement.buildingId,
    levelId: placement.levelId,
    x,
    z,
    facing: nextFacing,
    // **排除自己**：不然原地微调会被判成"压到了自己"
    excludeInstanceId: instanceId,
  });
  if (check.ok === false) return { ok: false, reason: check.reason };

  placements = placements.map((item) =>
    item.instanceId === instanceId ? { ...item, x, z, facing: nextFacing } : item,
  );
  // 内景锚点跟着走——走进去还是那间屋，家具还在原来的格上
  syncBuildingInteriors();
  emit("world_changed", { reason: "buildings" });
  return { ok: true, instanceId };
}

/** 这一级能升到哪几级。给指令列选项和选址 UI 用 */
export function upgradeOptions(instanceId: string): string[] {
  const placement = findPlacement(instanceId);
  if (!placement) return [];
  const shape = shapeOf(placement.buildingId, placement.levelId);
  return shape ? successorsOf(shape) : [];
}

/** 屋里还有几件家具（升级和拆除都要问） */
function furnitureInside(placement: BuildingPlacement): number {
  const level = findBuildingLevel(placement.buildingId, placement.levelId);
  if (!level?.interior) return 0;
  const roomId = interiorRoomId(placement);
  return getWorld().placedFurniture.filter(
    (item) => item.placement.roomId === roomId,
  ).length;
}

/**
 * 这栋楼内景的 roomId。**固定，不带等级**——升级换的是几何不是身份。
 *
 * 这样家具的 `roomId` 在升级前后一致，配合"升级必须先搬空"是双保险：
 * 就算哪天放开了带家具升级，家具也不会因为房间改名而变成孤儿。
 */
export function interiorRoomId(placement: BuildingPlacement): string {
  return `${placement.buildingId}:${placement.instanceId}`;
}

export function upgradeBuilding(
  instanceId: string,
  targetLevelId?: string,
): UpgradeCheck & { options?: string[] } {
  if (guardWorldMutation()) {
    return { ok: false, reason: "max_level" };
  }
  const placement = findPlacement(instanceId);
  if (!placement) return { ok: false, reason: "unknown_target" };

  const shape = shapeOf(placement.buildingId, placement.levelId);
  if (!shape) return { ok: false, reason: "unknown_target" };

  const options = successorsOf(shape);
  if (options.length === 0) return { ok: false, reason: "max_level" };

  /*
   * **不指定目标时不替玩家选**：只有一个后继才直接升，分叉时把选项列出来
   * 让调用方（指令 / UI）去问。悄悄选一条的后果是玩家的房子变成了他没挑的
   * 那一栋，而升级是单向的。
   */
  const target = targetLevelId ?? (options.length === 1 ? options[0] : undefined);
  if (!target) return { ok: false, reason: "unknown_target", options };

  // 已经在施工的不给再下单：一栋楼同时只能有一个目标
  if (placement.construction) return { ok: false, reason: "unknown_target" };

  const check = checkUpgrade({
    level: shape,
    targetLevelId: target,
    /*
     * 材料**这次真的传了**。以前这里不传，于是 `checkUpgrade` 里那道
     * `missing_materials` 的门物理上永远开着——校验写好了却从没被触发过。
     */
    materials: materialCounts(),
    others: placements
      .filter((item) => item.instanceId !== instanceId)
      .map((item) => ({
        buildingId: item.buildingId,
        levelId: item.levelId ?? "",
      })),
    furnitureInside: furnitureInside(placement),
  });
  if (check.ok === false) return check;

  const cost = shape.upgradeCost?.[target] ?? [];
  if (!spendMaterials(cost)) return { ok: false, reason: "missing_materials", missing: cost };

  /*
   * 升级**不再瞬间完成**：变成一块工地，围栏立起、进度 0，等石傀儡走
   * 过来。`levelId` 要到完工才落到 `target`（`finishSite`），所以在建
   * 期间这栋楼仍然是旧等级——容量、内景、占地都还是原来那份，玩家
   * 在建期间照样用得上。
   *
   * **instanceId 不变**：升级是同一栋楼换了个等级，里面存的东西、位置
   * 全保留。这正是"升级 = 同一建筑的多个等级"那条决策的落点。
   */
  placements = placements.map((item) =>
    item.instanceId === instanceId
      ? { ...item, construction: { targetLevelId: target } }
      : item,
  );
  emit("world_changed", { reason: "buildings" });
  return { ok: true };
}

export function removeBuilding(
  instanceId: string,
  contents: { gold?: number } = {},
): RemoveCheck {
  if (guardWorldMutation()) return { ok: true };
  const placement = findPlacement(instanceId);
  if (!placement) return { ok: true };

  const check = checkRemove({
    furniture: furnitureInside(placement),
    gold: contents.gold,
  });
  if (check.ok === false) return check;

  placements = placements.filter((item) => item.instanceId !== instanceId);
  syncBuildingInteriors();
  emit("world_changed", { reason: "buildings" });
  return { ok: true };
}


/**
 * 把**有内景的建筑**的房间同步进 `worldState.rooms`。
 *
 * 这是"同图走进去"那条架构的落点：小屋和房子的内景不是另一张图，
 * 而是 base 图上多出来的几个房间——各有自己的 `floorGrid`、自己的墙、
 * 自己的占用图，锚点就是那栋楼摆在哪。于是它们**自动**拿到了：
 * 地板承托面（`buildGroundMap` 收全部房间）、镜头的屋内盒
 * （`standingHouses` 遍历列表）、门、放置面。一条都不用特判。
 *
 * 每次建造 / 移动 / 升级 / 读档之后整份重算——**建筑变化是稀有事件**，
 * 增量维护"哪个房间要改锚点、哪个要换几何"的复杂度换不来任何东西。
 *
 * 地图自带的房间（`living`、`yard`）不动：它们不属于任何建筑实例。
 */
export function syncBuildingInteriors(): void {
  const style = getRoomStyle();
  const owned = new Set(placements.map((item) => interiorRoomId(item)));

  const next: Record<string, RoomSave> = {};
  for (const [roomId, room] of Object.entries(getRooms())) {
    // 留下地图自带的房间；上一轮建筑留下的内景房间按新名单重建
    if (!roomId.includes(":")) next[roomId] = room;
  }

  for (const placement of placements) {
    const level = findBuildingLevel(placement.buildingId, placement.levelId);
    if (!level?.interior) continue;
    const roomId = interiorRoomId(placement);
    next[roomId] = {
      ...level.interior(style),
      roomId,
      // 锚点 = 建筑的位置和朝向。房子挪走内景跟着走，一个字都不用另记
      anchor: {
        x: placement.x,
        z: placement.z,
        elevation: placement.elevation,
        facing: placement.facing,
      },
    };
  }

  void owned;
  replaceRooms(next);
}

/**
 * 改一栋楼的实例状态（罐里的钱、田里的进度）。
 *
 * **合并写不整份替换**：一栋楼的状态由几个互不相干的系统各管一块
 * （金币归金币、播种归农田），整份替换会让后写的把先写的抹掉。
 *
 * 不发 `world_changed`——状态变化每秒可能好几次（液面、生长），
 * 而那条事件会触发整组重建和导航网格作废。视图听 `building_state_changed`
 * 做轻量更新即可。
 */
export function setBuildingState(
  instanceId: string,
  patch: Record<string, unknown>,
): void {
  placements = placements.map((item) =>
    item.instanceId === instanceId
      ? { ...item, state: { ...item.state, ...patch } }
      : item,
  );
  emit("building_state_changed", { instanceId });
}

// ---- 金币罐的总账（罐就是钱包）----

/** 场上所有金币罐的等级，按建造顺序 */
export function jarLevelIds(): string[] {
  return (
    placements
      .filter((item) => item.buildingId === "gold_jar")
      /*
       * **还在盖的罐子不算容量**。工地一落地 `levelId` 就是初始等级
       * （占地校验、迁移、拆除都要它），但那只罐子还没有底——钱不能
       * 先存进一个正在施工的箱子里。玩家看到的是围栏和进度条，
       * 左上角却已经涨了容量，那是两句互相矛盾的话。
       *
       * **升级中的照算**：l1 升 l2 期间 `levelId` 仍是 l1，那只罐子
       * 本来就在那儿、装着钱，算 l1 的容量正好（`finishSite` 之后才
       * 变 l2）。所以判据是"有没有建成过"，不是"有没有在施工"——
       * 前者看 targetLevelId 是不是初始等级。
       */
      .filter((item) => {
        if (!item.construction) return true;
        const first = findBuilding(item.buildingId)?.levels[0].levelId;
        // 目标是初始等级 = 这是**从无到有**的那一单，还没建成过
        return item.construction.targetLevelId !== first;
      })
      .map((item) => item.levelId ?? "l1")
  );
}

/** 能持有的金币上限 = 所有罐的容量之和。**没建罐时是 0** */
export function goldCapacity(): number {
  return totalCapacity(jarLevelIds());
}

// ---- 存档 ----

export function snapshotBuildings(): BuildingPlacement[] {
  return placements.map((item) => ({ ...item }));
}

export function restoreBuildings(saved: BuildingPlacement[] | undefined): void {
  /*
   * 丢弃引用了未知型号的实例——照 `findPlaceableItem` 丢弃未知家具的
   * 先例：内容更新后删过一个型号时，老存档不该让整个世界读不出来。
   * 未知的**等级**不丢（findBuildingLevel 会退回初始等级并告警），
   * 因为那栋楼本身还在，只是那一级的内容没了。
   */
  placements = (saved ?? []).filter((item) => findBuilding(item.buildingId));
  syncIdCounters(placements.map((item) => item.instanceId));
  syncBuildingInteriors();
  emit("world_changed", { reason: "buildings" });
}
