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
import { restoreHeld, snapshotHeld } from "../../Game/State/heldItem";
import {
  restoreLocalPosition,
  snapshotLocalPosition,
} from "../../Game/State/participants";
import { restoreResting, snapshotResting } from "../../Game/State/posture";
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

/** 捏人系统还没做，先给一套默认外观；接 CharacterCreator 时从那里读 */
const DEFAULT_AVATAR = {
  bodyId: "body_default",
  hairId: "hair_default",
  topId: "top_default",
  bottomId: "bottom_default",
  shoesId: "shoes_default",
  colors: {},
};

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
      avatar: previous?.player.avatar ?? DEFAULT_AVATAR,
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

      maps: { [MAIN_MAP_ID]: createSingleRoomMap(MAIN_MAP_ID, world.room) },
      pets: snapshotPets(),
      placedFurniture: world.placedFurniture,
      // 地上扔着的东西也是世界的一部分，不存就等于关一次游戏丢一次货
      droppedItems: snapshotDroppedItems(),
      // 消息记录只留最近几个世界日，裁剪规则在 Core 的 trimChatLog
      chatLog: snapshotChatLog(),
      inventories: snapshotStorages(),

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
  const room = Object.values(save.ownWorld.maps)[0]?.rooms;
  const firstRoom = room ? Object.values(room)[0] : undefined;

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
  // 老存档没有这个字段，restoreDroppedItems 会当空数组处理
  restoreDroppedItems(save.ownWorld.droppedItems);
  // 消息记录要在时钟之后恢复——裁剪按"今天是哪天"算
  restoreChatLog(save.ownWorld.chatLog);
  pruneOrphanStorages(
    save.ownWorld.placedFurniture.map((item) => item.instanceId),
  );

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
