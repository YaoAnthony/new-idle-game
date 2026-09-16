import type { AssertNever } from "core";
import type { RestoreKey } from "./types";

/**
 * **读档的黄金顺序**。一份显式清单，不用拓扑排序。
 *
 * 为什么不按 `after` 声明自动排：现有 48 步里大多数两两之间没有约束，
 * 拓扑排序在无约束处的定序取决于实现细节（Map 遍历序、边的插入序），
 * "注册表化之后行为不变"这句承诺就守不住了。清单照抄 2026-09-13 之前
 * `serialize.ts` 里 hydrateGameSave 的顺序；各片的 `after` 仍然声明，
 * 由测试断言这份清单满足它们——因果写在片上，顺序定在这里。
 *
 * 顺序的讲究（原注释搬过来，别丢）：
 * - 风格最先：环境音按它的 regionId 选底噪，侧边栏拿它显示屋子名；
 * - `maps` 是世界实体的组 owner：定当前图、分桶、几何和当前图家具进运行时，
 *   掉落物 / 活物 / 门的当前图切片留在 ctx.bundles 给后面的片按位取；
 * - 时钟与天气早于其他系统：离线结算、每日限额要读时间；
 * - 建筑早于钱匣（罐容量）和储物清孤儿（货架 id 由建筑实例生成）；
 * - 消息记录在时钟之后：裁剪按"今天是哪天"算；
 * - 位置要在 GameView 挂载之前就位：CharacterController 的构造函数读初值；
 * - 坐姿要查家具锚点，房间必须已就位；
 * - 手上的东西在背包之后：restoreInventory 会先清空整个背包；
 * - 活物在需求之后、门最后（门只寄存锁状态，等 RoomScene 建门时认领）；
 * - 行动最后：它可能立刻结算并发奖励，需要背包已经就位。
 *
 * 漏一个键这里编译不过（`RestoreOrderIsComplete`）；重复由运行时测试拦。
 */
export const RESTORE_ORDER = [
  "world.worldId",
  "world.seed",
  "world.house",
  "world.maps",
  "world.placedFurniture",
  "world.clock",
  "world.weather",
  "world.inventories",
  "world.gramophones",
  "world.lamps",
  "world.buildings",
  "world.baseGold",
  "world.droppedItems",
  "world.chatLog",
  "world.dailyBoard",
  "player.dailyTasks",
  "player.avatar",
  "player.character.inventory",
  "player.character.heldItem",
  "player.character.position",
  "player.discoveredRecipeIds",
  "player.character.restingOn",
  "player.character.needs",
  "world.pets",
  "world.doors",
  "world.progression.events",
  "world.progression.unlockedFeatureIds",
  "world.progression.firedStoryRuleIds",
  "world.progression.signalCounts",
  "world.progression.poolMisses",
  "world.progression.stats",
  "world.progression.achievements",
  "world.progression.codex",
  "world.dayFacts",
  "world.residentTrips",
  "world.tripPlans",
  "world.mailbox",
  "world.flags",
  "player.birthday",
  "world.favors",
  "world.porch",
  "world.interiors",
  "world.travelerStock",
  "world.newspaper",
  "player.actionEntries",
  "player.actionGroups",
  "player.actionLog",
  "player.diary",
  "player.pendingGold",
  "player.activeActionProcess",
  // 没有运行时的：透传键（name）和死字段（playerId / inventoryId / gameRules）。restore 是空操作，排哪儿都行
  "player.name",
  "player.playerId",
  "player.character.inventoryId",
  "world.gameRules",
] as const satisfies readonly RestoreKey[];

/** `RestoreKey` 里有键不在上面清单里时，这里编译不过 */
export type RestoreOrderIsComplete = AssertNever<
  Exclude<RestoreKey, (typeof RESTORE_ORDER)[number]>
>;
