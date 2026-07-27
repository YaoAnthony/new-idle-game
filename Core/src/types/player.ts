import type { InventoryId, PlayerId } from "./base.js";
import type { MissionInstance } from "./events.js";
import type { InventoryStack } from "./inventory.js";

export type PlayerNeedsSave = {
  hunger: number;
  fatigue: number;
};

export type PlayerSave = {
  playerId?: PlayerId;
  name: string;
  avatar: string;
  missions: {
    daily: MissionInstance[];
    primary: MissionInstance[];
  };
  character: {
    inventory: InventoryStack[];
    inventoryId?: InventoryId;
    needs: PlayerNeedsSave;
  };
  discoveredRecipeIds: string[];
};
