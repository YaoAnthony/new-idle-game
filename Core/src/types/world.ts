import type { ActionProcessSave } from "./actions.js";
import type { FeatureId, WorldId } from "./base.js";
import type { EventProgressSave } from "./events.js";
import type { StoryRuleId } from "./story.js";
import type { PlacedFurniture } from "./furniture.js";
import type { InventorySave } from "./inventory.js";
import type { MapSave } from "./map.js";
import type { PetSave } from "./pets.js";
import type { RegionId, RoomStyleId } from "./roomStyle.js";
import type { WorldClockSave } from "./time.js";
import type { WeatherSave } from "./weather.js";

export type HouseId = string;

export type HouseSave = {
  houseId: HouseId;
  regionId: RegionId;

  /** 当前屋子风格；新建世界时由 seed 决定，解锁装修后可切换 */
  styleId: RoomStyleId;
};

export type GameRulesSave = {
  timeRun: boolean;
};

/**
 * 属于世界的数据。玩家自己的背包、需求和已学配方在 PlayerSave 里，
 * 不在这里——联机时玩家带着自己的东西进入房主的 WorldSave。
 *
 * 房间几何（含门窗）实存于 maps 中，而不是加载时按 styleId 重新生成：
 * 联机时访客直接使用房主存档里的几何，双方内容版本不同也不会各自
 * 生成出不一样的房间。
 */
export type WorldSave = {
  worldId: WorldId;
  seed: number;
  house: HouseSave;

  clock: WorldClockSave;
  weather: WeatherSave;

  maps: Record<string, MapSave>;
  pets: Record<string, PetSave>;
  placedFurniture: PlacedFurniture[];

  /** 储物箱等容器的内容，键为 InventoryId */
  inventories: Record<string, InventorySave>;

  progression: {
    unlockedFeatureIds: FeatureId[];
    events: EventProgressSave;

    /**
     * 已经触发过的一次性剧情规则。不存这个的话，读档后
     * `StoryRule.once` 会重新成立，开场提示和宠物登场会再演一遍。
     */
    firedStoryRuleIds?: StoryRuleId[];
  };

  /**
   * 正在进行的行动。放在世界侧是因为它绑着世界里的某件家具
   * （furnitureInstanceId）。按绝对 UTC 推进，关掉游戏也会照常完成。
   */
  activeActionProcess?: ActionProcessSave;

  gameRules?: GameRulesSave;
};
