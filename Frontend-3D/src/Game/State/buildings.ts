import {
  Facing,
  buildingRectWorld,
  checkBuildingPlacement,
  findBlueprintForBuilding,
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
  floorSurfaceId,
} from "core";

import { emit } from "../EventBus";
import { guardWorldMutation } from "../Multiplayer/worldLock";
import { nextObjectId, syncIdCounters } from "./ids";
import { findBuilding, findBuildingLevel } from "../../Buildings/index";
import { materialCounts, spendMaterials } from "../Systems/materials";
import { addItem } from "./inventory";
import { getUnlockedFeatures } from "../Systems/events";
import {
  getCurrentMap,
  getRoom,
  getRoomStyle,
  getRooms,
  getWorld,
  replaceRooms,
} from "./worldRuntime";
import { siteHeightAt } from "./world/walkable";

/**
 * 这栋楼该坐在多高。
 *
 * **必须在把它加进 `placements` 之前采**：带内景的楼（居民房、小店、
 * 餐厅）会给自己铺一块室内地板面，而 `groundHeightAt` 优先答地板不答
 * 地形——先加后采会问到它自己刚铺的那块地板，永远拿到锚点的旧标高。
 *
 * ## 为什么这一行值得单独存在
 *
 * 原来这里写死 `elevation: 0`。带内景的楼因此在自己脚下铺出一块标高 0
 * 的地板，`groundHeightAt` 问到那块地板答 0，视图照 0 渲染——
 * **一个自洽但和地形无关的循环**。院子那一带地形是 -0.45，于是房子
 * 悬空 0.45 米（用户 2026-08-25 报的绿房子浮空就是它）。
 *
 * 反过来在高处建就会陷进去：地形 +2，楼还按 0 摆，埋掉两米。
 * 用户当时的预判完全正确。
 *
 * 不带内景的楼（金库、木墙）一直是对的——它们不铺地板，
 * `groundHeightAt` 直接答地形。这也是为什么同一个院子里只有房子浮空。
 */
function groundElevationFor(
  x: number,
  z: number,
  ignore?: ReadonlySet<string>,
): number {
  return siteHeightAt(x, z, ignore);
}

/** 这些楼自己铺的那几块地板。采标高时要当它们不存在 */
function ownFloorIds(items: readonly BuildingPlacement[]): ReadonlySet<string> {
  return new Set(items.map((item) => floorSurfaceId(interiorRoomId(item))));
}

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
   *
   * `instantBuild` 的型号（木墙）**无视 asSite**：当场就是成品。这道门开在
   * 这里而不是调用方，是因为"哪些建筑要工地"是建筑自己的性质，不是每个
   * 下单入口各自记着的规矩——摆放控制器、调试指令、以后的任何入口，
   * 都不该有机会把它记错。
   */
  const placement: BuildingPlacement = {
    instanceId: nextObjectId("building", buildingId),
    buildingId,
    x,
    z,
    // 落地时采一次地形；写死 0 会让带内景的楼浮空或陷进地里（见上面那段）
    elevation: groundElevationFor(x, z),
    facing,
    // 新建出来就是**初始等级**（levels[0]）
    levelId: firstLevel,
    ...(options.asSite && !definition.instantBuild
      ? { construction: { targetLevelId: firstLevel } }
      : {}),
  };
  placements = [...placements, placement];
  syncBuildingInteriors();
  emit("world_changed", { reason: "buildings" });
  /*
   * **当场成品的也算完工**（2026-08-24，期 4 实测抓到）。
   *
   * `building_completed` 原来只在 `finishSite` 发，于是走这条路落地的楼
   * ——`instantBuild` 的木墙、`buildDuration` 为空的瞬时建筑、调试指令
   * 直接摆的——一律不发。后果是任何挂在"楼建成了"上的剧情**静默不触发**：
   * 期 4 的居民搬入实测就卡在这儿，房子立起来了人不进去，而且不报错。
   *
   * 判据是"这一刻它是不是成品"（没有 construction 就是），不是"走了哪个
   * 函数"。两条落地路径各发一次，`finishSite` 那条只在真的从工地转成品时发，
   * 所以同一栋楼不会报两遍。
   */
  if (!placement.construction) {
    emit("building_completed", {
      buildingId: placement.buildingId,
      instanceId: placement.instanceId,
    });
  }
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
  /*
   * 完工才报，下单和认领都不报——排队中的工地对剧情来说什么也没发生。
   * 带上 buildingId 是因为 world_changed 只说"建筑那边变了"，
   * 剧情要问的是"变成了什么"。
   */
  emit("building_completed", {
    buildingId: placement.buildingId,
    instanceId,
  });
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

  /*
   * 挪楼**也要重新采一次高度**。不采的话，从低处挪到高处的楼会带着
   * 旧标高走，看起来像陷进了山坡。
   *
   * 自己那块地板此刻还铺在旧位置上，多半够不着新落点——但"多半"不是
   * 保证（原地微调、大楼重叠都够得着），所以照样点名摘掉。
   */
  const nextElevation = groundElevationFor(x, z, ownFloorIds([placement]));
  placements = placements.map((item) =>
    item.instanceId === instanceId
      ? { ...item, x, z, facing: nextFacing, elevation: nextElevation }
      : item,
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
   *
   * `instantBuild` 的型号例外，当场换级：建得瞬间、升级却要等人跑一趟，
   * 那是同一栋楼上的两套规矩。
   */
  const definition = findBuilding(placement.buildingId);
  placements = placements.map((item) =>
    item.instanceId === instanceId
      ? definition?.instantBuild
        ? { ...item, levelId: target }
        : { ...item, construction: { targetLevelId: target } }
      : item,
  );
  // 换了等级就可能换内景/占地，和 finishSite 走的是同一套善后
  if (definition?.instantBuild) syncBuildingInteriors();
  emit("world_changed", { reason: "buildings" });
  return { ok: true };
}

/**
 * 拆掉一栋之后**图纸回背包**（用户定，2026-08-23："墙拆了，要能回到背包里吧"）。
 *
 * 返还的是**图纸**不是材料：图纸就是这栋楼在背包里的形态，买图纸 →
 * 摆下去 → 拆掉退回图纸，来回不亏。返材料的话还得回答"1 金币退给谁"
 * （罐满了怎么办、罐拆光了怎么办），而图纸没有容量问题。
 *
 * **升级花掉的材料不退**：升级是一次承诺。真想挪位置有"迁移"，那条是
 * 免费的，不该逼玩家拆了重建。
 */
function refundBlueprint(buildingId: string): void {
  const blueprint = findBlueprintForBuilding(buildingId);
  if (blueprint) addItem(blueprint.id, 1);
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
  refundBlueprint(placement.buildingId);
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
      // 锚点 = 建筑的位置和朝向。房子挪走内景跟着走，一个字都不用另记。
      // 地板抬 floorRaise：有台明的楼，室内要铺在台明**上**（期 C）
      anchor: {
        x: placement.x,
        z: placement.z,
        elevation: placement.elevation + (level.floorRaise ?? 0),
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
  /*
   * **落地高度每次读档都重算一遍。**
   *
   * 不是"老存档修一次就行"：地形本身会变（以后改地图、挖河、垫高院子），
   * 存下来的标高就过期了。既然它是**位置的函数**、算一次只要几微秒，
   * 那就别把它当作需要迁移的状态——每次读档现算，永远和当下的地形一致。
   *
   * 这也顺手修好了 2026-08-25 之前存的档：那时候 `placeBuilding` 写死
   * `elevation: 0`，带内景的房子全部悬空 0.45 米。
   *
   * 采样必须在 `syncBuildingInteriors()` **之前**——`siteHeightAt` 跳过
   * 室内地板，所以顺序其实无所谓，但摆在前面读起来更像回事：先知道
   * 自己站多高，再照这个高度铺地板。
   */
  const kept = (saved ?? []).filter((item) => findBuilding(item.buildingId));
  const ownFloors = ownFloorIds(kept);
  placements = kept.map((item) => ({
    ...item,
    elevation: groundElevationFor(item.x, item.z, ownFloors),
  }));
  syncIdCounters(placements.map((item) => item.instanceId));
  syncBuildingInteriors();
  emit("world_changed", { reason: "buildings" });
}
