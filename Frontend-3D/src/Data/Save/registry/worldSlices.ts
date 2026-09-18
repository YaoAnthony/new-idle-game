import {
  DEFAULT_HOUSE_ID,
  type MailboxSave,
  type WorldSliceKey,
  type WorldSliceValue,
} from "core";
import { restoreStats, snapshotStats } from "../../../Game/State/stats";
import {
  restoreAchievements,
  snapshotAchievements,
} from "../../../Game/Systems/achievements";
import { restoreCodex, snapshotCodex } from "../../../Game/Systems/codex";
import { getWorldSeed, restoreWorldSeed } from "../../../Game/State/worldSeed";
import { restoreClock, snapshotClock } from "../../../Game/State/clock";
import { restoreChatLog, snapshotChatLog } from "../../../Game/State/chatLog";
import {
  reconcileDroppedItems,
  restoreDroppedItems,
  snapshotDroppedItems,
} from "../../../Game/State/droppedItems";
import {
  loadWorldEntities,
  snapshotWorldEntities,
  type ActiveEntities,
  type WorldEntitiesBundle,
} from "../../../Game/State/world/entities";
import { restoreWorld } from "../../../Game/State/world/maps";
import { restoreDailyBoard, snapshotDailyBoard } from "../../../Game/State/dailyBoard";
import {
  pruneOrphanGramophones,
  restoreGramophones,
  snapshotGramophones,
} from "../../../Game/State/gramophones";
import { pruneOrphanLamps, restoreLamps, snapshotLamps } from "../../../Game/State/lamps";
import { restoreBuildings, snapshotBuildings } from "../../../Game/State/buildings";
import { restoreBaseGold, snapshotBaseGold } from "../../../Game/State/gold";
import { shelfOwnerIds } from "../../../Game/Systems/shopkeeping";
import { restoreTravelerStock, snapshotTravelerStock } from "../../../Game/Systems/trading";
import { restoreNewspaper, snapshotNewspaper } from "../../../Game/Systems/newspaper";
import {
  pruneOrphanStorages,
  restoreStorages,
  snapshotStorages,
} from "../../../Game/State/storage";
import { restoreWeather, snapshotWeather } from "../../../Game/State/weather";
import { restoreDoors } from "../../../Game/State/doorsRuntime";
import {
  reconcileResidents,
  restoreResidents,
  snapshotResidents,
} from "../../../Game/State/residentsRuntime";
import { getRoomStyle, getWorld, setRoomStyleId } from "../../../Game/State/worldRuntime";
import {
  getEventProgress,
  getUnlockedFeatures,
  replaceUnlockedFeatures,
  restoreProgression,
} from "../../../Game/Systems/events";
import {
  getFiredStoryRuleIds,
  getPoolMisses,
  getSignalCounts,
  restoreFiredStoryRules,
  restorePoolMisses,
  restoreSignalCounts,
} from "../../../Game/Systems/story";
import { getDayFacts, restoreDayFacts } from "../../../Game/Systems/dayRecord";
import { restoreFavors, snapshotFavors } from "../../../Game/Systems/residents/favors";
import { restorePorch, snapshotPorch } from "../../../Game/Systems/residents/porch";
import { restoreInteriors, snapshotInteriors } from "../../../Game/Systems/residents/interiors";
import { restoreResidentTrips, snapshotResidentTrips } from "../../../Game/Systems/residents/townTrips";
import { restoreTripPlans, snapshotTripPlans } from "../../../Game/Systems/residents/trips";
import { restoreMailbox, snapshotMailbox } from "../../../Game/Systems/mail";
import { restoreFlags, snapshotFlags } from "../../../Game/Systems/flags";
import {
  requireSave,
  when,
  type RestoreCtx,
  type SliceRuntime,
  type SnapshotCtx,
} from "./types";

/**
 * 世界侧每一片怎么进出运行时。键和 Core 的 `WORLD_SLICE_POLICY` 一一对应，
 * 漏一片编译不过。顺序不在这里定（见 `order.ts`），同步策略也不在这里定
 * （见 Core）——这张表只回答"怎么抓、怎么灌、什么事件算脏"。
 */

const WORLD_ID = "world";

// ---- 世界实体五键的组：抓一次、分一次桶 ----

const ENTITIES_MEMO = "worldEntities";
const ACTIVE_BUNDLE = "activeEntities";

/** 同一次序列化里只调一次 snapshotWorldEntities：五键共用这份合流结果 */
function entities(ctx: SnapshotCtx): WorldEntitiesBundle {
  const cached = ctx.memo.get(ENTITIES_MEMO) as WorldEntitiesBundle | undefined;
  if (cached) return cached;
  const bundle = snapshotWorldEntities();
  ctx.memo.set(ENTITIES_MEMO, bundle);
  return bundle;
}

/** `world.maps` 分桶后留下的当前图切片。排在它前面的片调到这里就是顺序错了 */
function activeEntities(ctx: RestoreCtx): ActiveEntities {
  const active = ctx.bundles.get(ACTIVE_BUNDLE) as ActiveEntities | undefined;
  if (!active) {
    throw new Error("[save-registry] world.maps 还没灌，实体切片必须排在它后面（见 registry/order.ts）");
  }
  return active;
}

/**
 * 活物哪些变化值得整片刷新：生灭（登场、移除、读档）。吃睡走这类每秒好几条的
 * 不刷——那些由 op 和关键帧管。自动存档不受这条限制（防抖着呢）。
 */
const PETS_REFRESH_REASONS = new Set(["spawn", "removed", "seeded", "restored", "entered"]);

const EMPTY_MAILBOX = (): MailboxSave => ({
  letters: [],
  outbox: [],
  sentOnce: [],
  lastSent: {},
  scheduled: [],
  replies: {},
});

const noop = (): void => undefined;

export const WORLD_SLICES = {
  worldId: { snapshot: () => WORLD_ID, restore: noop, changedBy: [] },
  seed: {
    // 建档时定、之后不变：有上一份档就沿用它的（读档回来运行时那份就是它）；
    // 没有 = 新档，用开新档时抓的那个（State/worldSeed）。随机池的抽签拌它
    snapshot: ({ previous }) => previous?.ownWorld.seed ?? getWorldSeed(),
    restore: (value, ctx) => restoreWorldSeed(value, ctx.mode),
    changedBy: [],
  },
  house: {
    /*
     * 屋子风格**问运行时要，不从上一份存档抄**——纯透传的话运行时改了风格
     * 存盘也拿不到。regionId 从风格定义推导、不另存一份：两个字段各存各的，
     * 迟早出现"styleId 是海边小屋、regionId 还写着 forest"。
     */
    snapshot: ({ previous }) => {
      const style = getRoomStyle();
      return {
        houseId: previous?.ownWorld.house.houseId ?? DEFAULT_HOUSE_ID,
        regionId: style.regionId,
        styleId: style.id,
      };
    },
    // 存档里是删掉的风格时 setRoomStyleId 会保持不动——内容更新不该让存档读不出来
    restore: (value) => setRoomStyleId(value.styleId),
    changedBy: [],
  },
  maps: {
    snapshot: (ctx) => entities(ctx).maps,
    /*
     * 组 owner。按玩家所在的地图（position.mapId）定当前图，四族实体分成
     * "当前图的"和"搁置的"：几何和当前图家具由它直接灌进运行时；掉落物 /
     * 活物 / 门只分拣不代灌，留在 ctx.bundles 给后面的片按黄金顺序取。
     */
    restore: (_value, ctx) => {
      const save = requireSave(ctx);
      const active = loadWorldEntities(
        {
          maps: save.ownWorld.maps,
          placedFurniture: save.ownWorld.placedFurniture,
          droppedItems: save.ownWorld.droppedItems ?? [],
          pets: save.ownWorld.pets,
          doors: save.ownWorld.doors ?? [],
        },
        save.player.character.position?.mapId,
      );
      ctx.bundles.set(ACTIVE_BUNDLE, active);
    },
    changedBy: ["world_changed"],
  },
  placedFurniture: {
    snapshot: (ctx) => entities(ctx).placedFurniture,
    // 当前图的家具已由 maps 那一片连几何一起灌了
    restore: noop,
    // 刷新只发**当前图在场**的家具（收起来的房子里的不算）
    replicate: () => [...getWorld().placedFurniture],
    applyReplica: (value) => restoreWorld({ room: getWorld().room, placedFurniture: value }),
    // kitchen_changed：锅槽内容存在家具实例的 state 里
    changedBy: ["world_changed", "kitchen_changed"],
  },
  clock: {
    snapshot: () => snapshotClock(),
    restore: (value) => restoreClock(value),
    // 拨时间的事件在阶段 3 补（clock_changed）；今天这一片只搭别的刷新的车
    changedBy: [],
  },
  weather: {
    snapshot: () => snapshotWeather(),
    restore: (value) => restoreWeather(value),
    changedBy: ["weather_changed"],
  },
  inventories: {
    snapshot: () => snapshotStorages(),
    restore: (value) => restoreStorages(value),
    /*
     * 活名单 = 还拥有库存的东西：家具之外还有家具小店的货架，它的键由**建筑**
     * 实例 id 生成——漏掉的话读一次档整架货就没了。建筑那一片排在前面，
     * 所以 finalize 时 shelfOwnerIds 报的已经是这个世界的店。
     */
    finalize: (ctx) =>
      pruneOrphanStorages([
        ...requireSave(ctx).ownWorld.placedFurniture.map((item) => item.instanceId),
        ...shelfOwnerIds(),
      ]),
    changedBy: ["storage_changed"],
  },
  gramophones: {
    snapshot: () => snapshotGramophones(),
    restore: (value) => restoreGramophones(value),
    finalize: (ctx) =>
      pruneOrphanGramophones(requireSave(ctx).ownWorld.placedFurniture.map((item) => item.instanceId)),
    changedBy: ["gramophone_changed"],
  },
  lamps: {
    snapshot: () => snapshotLamps(),
    restore: (value) => restoreLamps(value),
    finalize: (ctx) =>
      pruneOrphanLamps(requireSave(ctx).ownWorld.placedFurniture.map((item) => item.instanceId)),
    changedBy: ["lamp_changed"],
  },
  buildings: {
    snapshot: () => snapshotBuildings(),
    restore: (value) => restoreBuildings(value),
    changedBy: ["world_changed", "building_state_changed"],
    /*
     * 刷新也听 building_state_changed（2026-09-18，种植系统 期 5）：状态变化其实低频
     * （浇一次、收一次、存一次钱）——原来担心的"液面每秒好几次"是液面动画的事，
     * 那不进状态；作物的派生变化走 farm_cell_changed，也不进这里。
     */
    replicateOn: ["world_changed", "building_state_changed"],
  },
  baseGold: {
    snapshot: () => snapshotBaseGold(),
    restore: (value) => restoreBaseGold(value),
    changedBy: ["gold_changed"],
    after: ["world.buildings"],
  },
  droppedItems: {
    snapshot: (ctx) => entities(ctx).droppedItems,
    restore: (_value, ctx) => restoreDroppedItems(activeEntities(ctx).droppedItems),
    replicate: () => snapshotDroppedItems(),
    // 对账而不是全量替换：正在飞的重放实体要保住运动学
    applyReplica: (value) => reconcileDroppedItems(value),
    changedBy: ["dropped_items_changed"],
    after: ["world.maps"],
  },
  chatLog: {
    snapshot: () => snapshotChatLog(),
    restore: (value) => restoreChatLog(value),
    changedBy: ["chat_message"],
    after: ["world.clock"],
  },
  dailyBoard: {
    snapshot: () => snapshotDailyBoard(),
    restore: (value) => restoreDailyBoard(value),
    changedBy: ["daily_board_changed"],
  },
  pets: {
    snapshot: (ctx) => entities(ctx).pets,
    restore: (_value, ctx) => restoreResidents(activeEntities(ctx).pets),
    // 刷新只发当前图的活物
    replicate: () => snapshotResidents(),
    // 对账不重建：正在走的路、正在做的动词都保住
    applyReplica: (value) => reconcileResidents(value),
    changedBy: ["resident_changed"],
    replicateOn: [when("resident_changed", ({ reason }) => PETS_REFRESH_REASONS.has(reason))],
    after: ["world.maps", "player.character.needs"],
  },
  doors: {
    snapshot: (ctx) => entities(ctx).doors,
    // 只寄存锁定状态；门实例要等 RoomScene 拿到房间几何后 initDoors 才建
    restore: (_value, ctx) => restoreDoors(activeEntities(ctx).doors),
    // 锁状态没有专门的事件（door_toggled 是开合，每几秒一条，不该触发落盘）。阶段 3 补
    changedBy: [],
    after: ["world.maps", "world.pets"],
  },
  "progression.events": {
    snapshot: () => getEventProgress(),
    // 和 unlockedFeatureIds 是同一个 restoreProgression 调用：两片一起灌
    restore: (value, ctx) =>
      restoreProgression({
        events: value,
        unlockedFeatureIds: requireSave(ctx).ownWorld.progression.unlockedFeatureIds,
      }),
    /*
     * 事件阶段推进**立即写，不防抖**。低频、重要（送礼认作朋友、任务阶段完成），
     * 和"移动了一件家具"不该用同一条 2.5 秒防抖合并。实测撞过一次：舒舒的初见
     * 对话走完、进度推到 gifted，玩家在防抖窗口内刷新了页面——pagehide 兜底是
     * 异步写 IndexedDB，页面卸载时经常来不及。结果是刚认完的朋友读档后又要重新哄。
     */
    changedBy: ["event_progress_changed"],
    write: "immediate",
  },
  "progression.unlockedFeatureIds": {
    snapshot: () => getUnlockedFeatures(),
    // 由 events 那一片一起灌了
    restore: noop,
    applyReplica: (value) => replaceUnlockedFeatures(value),
    // 领地开地走 world_changed{territory}；剧情的 unlock_feature 走 event_progress_changed（events 那片已经立即写）
    changedBy: ["world_changed"],
    after: ["world.progression.events"],
  },
  "progression.firedStoryRuleIds": {
    snapshot: () => getFiredStoryRuleIds(),
    restore: (value) => restoreFiredStoryRules(value ?? []),
    // 剧情规则在信号到达时评估，触发过的表也是那时候变的
    changedBy: ["story_signal"],
  },
  "progression.signalCounts": {
    snapshot: () => getSignalCounts(),
    restore: (value) => restoreSignalCounts(value),
    changedBy: ["story_signal"],
  },
  "progression.poolMisses": {
    snapshot: () => getPoolMisses(),
    restore: (value) => restorePoolMisses(value),
    changedBy: ["story_signal"],
  },
  "progression.stats": {
    snapshot: () => snapshotStats(),
    restore: (value) => restoreStats(value),
    changedBy: ["stats_changed"],
  },
  "progression.achievements": {
    snapshot: () => snapshotAchievements(),
    restore: (value) => restoreAchievements(value),
    changedBy: ["achievements_changed"],
  },
  "progression.codex": {
    snapshot: () => snapshotCodex(),
    restore: (value) => restoreCodex(value),
    changedBy: ["codex_changed"],
  },
  dayFacts: {
    snapshot: () => getDayFacts(),
    restore: (value) => restoreDayFacts(value),
    // dayRecord 不发事件，今天只搭别的落盘的车。阶段 3 补
    changedBy: [],
  },
  residentTrips: {
    snapshot: () => snapshotResidentTrips(),
    restore: (value) => restoreResidentTrips(value),
    changedBy: [when("resident_changed", ({ reason }) => reason === "away")],
  },
  tripPlans: {
    snapshot: () => snapshotTripPlans(),
    restore: (value) => restoreTripPlans(value),
    changedBy: ["trip_plans_changed"],
  },
  mailbox: {
    snapshot: () => snapshotMailbox(),
    restore: (value) => restoreMailbox(value),
    // 空信箱 snapshot 是 undefined；线上要发空值，房客才会清掉自己那份旧的
    replicate: () => snapshotMailbox() ?? EMPTY_MAILBOX(),
    changedBy: ["mail_changed"],
  },
  flags: {
    snapshot: () => snapshotFlags(),
    restore: (value) => restoreFlags(value),
    replicate: () => snapshotFlags() ?? {},
    changedBy: ["flags_changed"],
  },
  favors: {
    snapshot: () => snapshotFavors(),
    restore: (value) => restoreFavors(value),
    replicate: () => snapshotFavors() ?? {},
    changedBy: ["favors_changed"],
  },
  porch: {
    snapshot: () => snapshotPorch(),
    restore: (value) => restorePorch(value),
    replicate: () => snapshotPorch() ?? {},
    changedBy: ["porch_changed"],
  },
  interiors: {
    snapshot: () => snapshotInteriors(),
    restore: (value) => restoreInteriors(value),
    replicate: () => snapshotInteriors() ?? {},
    changedBy: ["interiors_changed"],
  },
  travelerStock: {
    snapshot: () => snapshotTravelerStock(),
    restore: (value) => restoreTravelerStock(value),
    // trading 不发事件，今天只搭别的落盘的车。阶段 3 补
    changedBy: [],
  },
  newspaper: {
    snapshot: () => snapshotNewspaper(),
    restore: (value) => restoreNewspaper(value),
    // newspaper 不发事件，同上
    changedBy: [],
  },
  gameRules: { dead: "全仓无读写（审计 2026-09-13），阶段 6 连类型一起删" },
} satisfies { [K in WorldSliceKey]-?: SliceRuntime<WorldSliceValue<K>> };
