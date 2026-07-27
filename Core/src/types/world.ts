import type { FeatureId, InventoryId, WorldId } from "./base.js";
import type { EventProgressSave } from "./events.js";
import type { PlacedFurniture } from "./furniture.js";
import type { InventorySave } from "./inventory.js";
import type { MapSave } from "./map.js";
import type { PetSave } from "./pets.js";
import type { PlayerNeedsSave } from "./player.js";
import type { WorldClockSave } from "./time.js";

export type WeatherId = string;
export type HouseId = string;

export type HouseSave = {
  houseId: HouseId;
  regionId?: string;
};

export type WeatherSave = {
  currentWeatherId: WeatherId;
};

export type GameRulesSave = {
  timeRun: boolean;
};

export type WorldSave = {
  worldId: WorldId;
  seed: number;
  house: HouseSave;
  clock: WorldClockSave;
  weather: WeatherSave;
  maps: Record<string, MapSave>;
  pets: Record<string, PetSave>;
  placedFurniture: PlacedFurniture[];
  inventories: Record<string, InventorySave>;
  playerCharacter?: {
    inventoryId: InventoryId;
    needs: PlayerNeedsSave;
  };
  progression: {
    unlockedFeatureIds: FeatureId[];
    discoveredRecipeIds?: string[];
    events: EventProgressSave;
  };
  gameRules?: GameRulesSave;
};
