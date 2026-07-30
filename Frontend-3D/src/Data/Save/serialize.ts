import {
  createSingleRoomMap,
  roomStyleDefinitions,
  type GameSave,
} from "core";
import { restoreHeld, snapshotHeld } from "../../Game/State/heldItem";
import { restoreResting, snapshotResting } from "../../Game/State/posture";
import {
  restoreInventory,
  snapshotInventory,
} from "../../Game/State/inventory";
import { getNeeds, restoreNeeds } from "../../Game/State/needs";
import { restorePets, snapshotPets } from "../../Game/State/petsRuntime";
import {
  restoreWorld,
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
  restoreFiredStoryRules,
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

function worldDayId(): string {
  return nowUtc().slice(0, 10);
}

export function serializeGameSave(previous?: GameSave): GameSave {
  const world = snapshotWorld();
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
        restingOn: snapshotResting(),
      },
      // 做过一次的配方。不是"解锁"（配方目前全量开放），
      // 而是"见过"——它保证配方不会因为材料用光而从列表里消失
      discoveredRecipeIds: getDiscoveredRecipeIds(),
      // 行动清单跟着玩家走——这是你现实里要做的事，不属于哪间屋子
      actionEntries: snapshotActionEntries(),
    },

    ownWorld: {
      worldId: WORLD_ID,
      seed: previous?.ownWorld.seed ?? 1,
      house: previous?.ownWorld.house ?? {
        houseId: "home",
        regionId: "forest",
        styleId: roomStyleDefinitions[0].id,
      },

      // 时钟与天气系统还没实现，先存一份结构合法的占位，
      // 接 Time / Weather 系统时替换成真实状态（届时需要一条迁移）
      clock: previous?.ownWorld.clock ?? {
        timeZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timePolicyId: "default",
        lastObservedUtc: timestamp,
        lastObservedSource: "device",
        lastObservedWorldDayId: worldDayId(),
      },
      weather: previous?.ownWorld.weather ?? {
        seed: 1,
        lastResolvedWorldDayId: worldDayId(),
        schedule: [],
        overrides: [],
      },

      maps: { [MAIN_MAP_ID]: createSingleRoomMap(MAIN_MAP_ID, world.room) },
      pets: snapshotPets(),
      placedFurniture: world.placedFurniture,
      inventories: previous?.ownWorld.inventories ?? {},

      progression: {
        unlockedFeatureIds: getUnlockedFeatures(),
        events: getEventProgress(),
        firedStoryRuleIds: getFiredStoryRuleIds(),
      },

      activeActionProcess: snapshotAction(),
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

  restoreWorld({
    room: firstRoom,
    placedFurniture: save.ownWorld.placedFurniture,
  });

  restoreInventory(save.player.character.inventory);
  restoreHeld(save.player.character.heldItem);
  restoreDiscoveredRecipes(save.player.discoveredRecipeIds ?? []);
  // 坐姿最后恢复：它要查家具锚点，房间必须已经就位
  restoreResting(save.player.character.restingOn);
  restoreNeeds(save.player.character.needs);
  restorePets(save.ownWorld.pets);

  restoreProgression({
    events: save.ownWorld.progression.events,
    unlockedFeatureIds: save.ownWorld.progression.unlockedFeatureIds,
  });
  restoreFiredStoryRules(save.ownWorld.progression.firedStoryRuleIds ?? []);

  // 行动最后恢复：它可能立刻结算并发奖励，需要背包已经就位
  restoreActionEntries(save.player.actionEntries);
  restoreAction(save.ownWorld.activeActionProcess);
}
