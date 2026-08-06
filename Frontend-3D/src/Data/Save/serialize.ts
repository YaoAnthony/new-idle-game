import { createSingleRoomMap, type GameSave } from "core";
import { restoreClock, snapshotClock } from "../../Game/State/clock";
import {
  restoreChatLog,
  snapshotChatLog,
} from "../../Game/State/chatLog";
import {
  restoreDroppedItems,
  snapshotDroppedItems,
} from "../../Game/State/droppedItems";
import {
  restoreDailyBoard,
  snapshotDailyBoard,
} from "../../Game/State/dailyBoard";
import {
  restoreDailyTasks,
  snapshotDailyTasks,
} from "../../Game/State/dailyTasks";
import { restoreHeld, snapshotHeld } from "../../Game/State/heldItem";
import { resetIdCounters } from "../../Game/State/ids";
import {
  restoreLocalPosition,
  snapshotLocalPosition,
} from "../../Game/State/participants";
import { restoreResting, snapshotResting } from "../../Game/State/posture";
import {
  pruneOrphanGramophones,
  restoreGramophones,
  snapshotGramophones,
} from "../../Game/State/gramophones";
import {
  pruneOrphanStorages,
  restoreStorages,
  snapshotStorages,
} from "../../Game/State/storage";
import { restoreWeather, snapshotWeather } from "../../Game/State/weather";
import {
  restoreInventory,
  snapshotInventory,
} from "../../Game/State/inventory";
import { getNeeds, restoreNeeds } from "../../Game/State/needs";
import { restoreAvatar, snapshotAvatar } from "../../Game/State/avatar";
import { restoreDoors, snapshotDoors } from "../../Game/State/doorsRuntime";
import { restorePets, snapshotPets } from "../../Game/State/petsRuntime";
import {
  getRoomStyle,
  restoreWorld,
  setRoomStyleId,
  snapshotWorld,
} from "../../Game/State/worldRuntime";
import {
  restoreAction,
  restoreActionEntries,
  snapshotAction,
  snapshotActionEntries,
} from "../../Game/Systems/actions";
import {
  getDiscoveredRecipeIds,
  restoreDiscoveredRecipes,
} from "../../Game/Systems/crafting";
import {
  getEventProgress,
  getUnlockedFeatures,
  restoreProgression,
} from "../../Game/Systems/events";
import {
  getFiredStoryRuleIds,
  getSignalCounts,
  restoreFiredStoryRules,
  restoreSignalCounts,
} from "../../Game/Systems/story";
import { SAVE_SCHEMA_VERSION } from "./types";

/**
 * 运行时状态 ↔ GameSave 的双向映射。
 *
 * 存档形状用的是 Core 的 GameSave，不另造一套 Frontend 专用结构——
 * Backend 校验联机存档时读的是同一份类型。
 *
 * 归属规则（V0.2 文档"删除重复定义"）：
 * - PlayerSave 跟着玩家走：背包、饥饿疲劳、已学配方、捏人配置
 * - WorldSave 属于世界：家具、宠物、房间几何、事件进度
 */

const MAIN_MAP_ID = "home";
const WORLD_ID = "world";



function nowUtc(): string {
  return new Date().toISOString();
}


export function serializeGameSave(previous?: GameSave): GameSave {
  const world = snapshotWorld();
  const style = getRoomStyle();
  const timestamp = nowUtc();

  return {
    meta: {
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      createdAtUtc: previous?.meta.createdAtUtc ?? timestamp,
      updatedAtUtc: timestamp,
    },

    player: {
      name: previous?.player.name ?? "旅人",
      avatar: snapshotAvatar(),
      missions: previous?.player.missions ?? { daily: [], primary: [] },
      character: {
        inventory: snapshotInventory(),
        needs: getNeeds(),
        heldItem: snapshotHeld(),
        // 站在哪、面朝哪。权威在 Game/State/participants，渲染层每帧写进去
        position: snapshotLocalPosition(),
        restingOn: snapshotResting(),
      },
      // 做过一次的配方。不是"解锁"（配方目前全量开放），
      // 而是"见过"——它保证配方不会因为材料用光而从列表里消失
      discoveredRecipeIds: getDiscoveredRecipeIds(),
      // 行动清单跟着玩家走——这是你现实里要做的事，不属于哪间屋子
      actionEntries: snapshotActionEntries(),
      // 正在做的那条也跟着人走（v12 从 WorldSave 搬来，见 PlayerSave 的注释）
      activeActionProcess: snapshotAction(),
      // 每日任务的池子和今日抽签跟着玩家走：做客时看到的还是自己的待办
      dailyTasks: snapshotDailyTasks(),
    },

    ownWorld: {
      worldId: WORLD_ID,
      seed: previous?.ownWorld.seed ?? 1,
      /**
       * 屋子风格**问运行时要，不从上一份存档抄**。
       *
       * 原来写的是 `previous?.ownWorld.house ?? {默认}`——纯透传，
       * 于是运行时改了风格（将来的装修系统）存盘也拿不到。
       * 加上读档那边压根没回灌，这个字段两个方向都是断的。
       *
       * regionId 从风格定义推导、不另存一份：两个字段各存各的，
       * 迟早出现"styleId 是海边小屋、regionId 还写着 forest"。
       */
      house: {
        houseId: previous?.ownWorld.house.houseId ?? "home",
        regionId: style.regionId,
        styleId: style.id,
      },

      clock: snapshotClock(),
      weather: snapshotWeather(),

      /*
       * `maps` 是 Record<MapId, MapSave>，这里只塞一张。
       *
       * **现在是对的，但它是一条会到期的假设。** 今天全世界只有一个
       * room（院子没有几何、活在渲染层的 OutdoorScene 里），所以"整份
       * maps 就是主房间那一张"成立。等真有了二楼 / 独立的院子 room，
       * 这一行会**静默丢掉除主房间外的一切**——不报错、不崩，只是存盘
       * 之后那些房间没了，是最难查的那种数据丢失。
       *
       * 没有现在就改成多 map，是因为改它要先定"谁持有多张 map 的运行时
       * 状态"（现在 worldRuntime 只有单个 `room`），那是比存档大得多的
       * 一次重构，不该顺手做。留这段注释，加上下面的读回对称写法。
       */
      maps: { [MAIN_MAP_ID]: createSingleRoomMap(MAIN_MAP_ID, world.room) },
      pets: snapshotPets(),
      doors: snapshotDoors(),
      placedFurniture: world.placedFurniture,
      // 地上扔着的东西也是世界的一部分，不存就等于关一次游戏丢一次货
      droppedItems: snapshotDroppedItems(),
      // 消息记录只留最近几个世界日，裁剪规则在 Core 的 trimChatLog
      chatLog: snapshotChatLog(),
      inventories: snapshotStorages(),
      gramophones: snapshotGramophones(),
      // 每日任务的**共享进度**属于这个家，不属于哪台机器（V0.11）
      dailyBoard: snapshotDailyBoard(),

      progression: {
        unlockedFeatureIds: getUnlockedFeatures(),
        events: getEventProgress(),
        firedStoryRuleIds: getFiredStoryRuleIds(),
        signalCounts: getSignalCounts(),
      },
    },
  };
}

/**
 * 把存档灌回运行时。顺序有讲究：**世界先于宠物**——
 * 宠物快照要读房间尺寸做坐标换算，房间没就位会算错格子。
 */
export function hydrateGameSave(save: GameSave): void {
  /*
   * 取主 map 的第一个 room。
   *
   * 按 MAIN_MAP_ID 取而不是 `Object.values(...)[0]`：后者依赖对象键的
   * 遍历顺序，多 map 的那天会随机读到二楼。存的时候用的是具名键，
   * 读的时候也该用同一个名字——存/读不对称是存档最容易腐烂的地方。
   * `?? 第一张` 是兜底：老存档的 map 键不一定叫 home。
   */
  const maps = save.ownWorld.maps ?? {};
  const rooms = (maps[MAIN_MAP_ID] ?? Object.values(maps)[0])?.rooms;
  const firstRoom = rooms ? Object.values(rooms)[0] : undefined;

  /*
   * 换世界了，id 计数器先清零。
   *
   * 清空放在这里而不是各家 restore 里：报数的有好几家（家具一家、
   * 掉落物一家），谁自带清空谁就会抹掉先报的那家。清空是"换一份世界"
   * 这件事本身的一部分，只该发生一次，所以归读档的入口管。
   */
  resetIdCounters();

  // 风格最先回灌：环境音按它的 regionId 选底噪，侧边栏拿它显示屋子名。
  // 存档里是删掉的风格时 setRoomStyleId 会保持不动（退回默认），
  // 和 restoreWorld 丢弃未知家具是同一个姿态——内容更新不该让存档读不出来
  setRoomStyleId(save.ownWorld.house.styleId);

  restoreWorld({
    room: firstRoom,
    placedFurniture: save.ownWorld.placedFurniture,
  });

  // 时钟与天气最先恢复：其他系统（离线结算、每日限额）要读时间
  restoreClock(save.ownWorld.clock);
  restoreWeather(save.ownWorld.weather);
  // 储物家具的内容属于世界，跟着房间一起恢复。
  // 恢复完立刻清一次幽灵库存——老存档里可能存着已经不在屋里的家具的箱子，
  // 不清的话它会一直占着 WorldSave.inventories 且永远打不开
  restoreStorages(save.ownWorld.inventories);
  restoreGramophones(save.ownWorld.gramophones);
  // 老存档没有这个字段，restoreDroppedItems 会当空数组处理
  restoreDroppedItems(save.ownWorld.droppedItems);
  // 消息记录要在时钟之后恢复——裁剪按"今天是哪天"算
  restoreChatLog(save.ownWorld.chatLog);
  pruneOrphanStorages(
    save.ownWorld.placedFurniture.map((item) => item.instanceId),
  );
  pruneOrphanGramophones(
    save.ownWorld.placedFurniture.map((item) => item.instanceId),
  );

  // 每日任务：世界那半跟着世界恢复，个人那半跟着玩家。
  // 两边都是"发现日期不对就归零"的惰性逻辑，不用管离线跨了几天
  restoreDailyBoard(save.ownWorld.dailyBoard);
  restoreDailyTasks(save.player.dailyTasks);

  restoreAvatar(save.player.avatar);
  restoreInventory(save.player.character.inventory);
  restoreHeld(save.player.character.heldItem);
  // 位置要在 GameView 挂载之前就位：CharacterController 的构造函数从这里读初值
  restoreLocalPosition(save.player.character.position);
  restoreDiscoveredRecipes(save.player.discoveredRecipeIds ?? []);
  // 坐姿最后恢复：它要查家具锚点，房间必须已经就位
  restoreResting(save.player.character.restingOn);
  // 带上上次存盘的时刻，startNeeds 的首次 tick 才能补算离线期间的衰减
  restoreNeeds(save.player.character.needs, save.meta?.updatedAtUtc);
  restorePets(save.ownWorld.pets);
  // 只寄存锁定状态；门实例要等 RoomScene 拿到房间几何后 initDoors 才建
  restoreDoors(save.ownWorld.doors);

  restoreProgression({
    events: save.ownWorld.progression.events,
    unlockedFeatureIds: save.ownWorld.progression.unlockedFeatureIds,
  });
  restoreFiredStoryRules(save.ownWorld.progression.firedStoryRuleIds ?? []);
  restoreSignalCounts(save.ownWorld.progression.signalCounts);

  // 行动最后恢复：它可能立刻结算并发奖励，需要背包已经就位
  restoreActionEntries(save.player.actionEntries);
  restoreAction(save.player.activeActionProcess);
}
