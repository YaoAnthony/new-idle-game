import type { AnchorId, InventoryId, PlayerId } from "./base.js";
import type { PlayerActionEntry } from "./actions.js";
import type { AvatarConfig } from "./avatar.js";
import type { MissionInstance } from "./events.js";
import type { PlacedFurnitureInstanceId } from "./furniture.js";
import type { InventoryStack } from "./inventory.js";
import type { RecipeId } from "./recipes.js";

export type PlayerNeedsSave = {
  hunger: number;
  fatigue: number;
};

/**
 * 跟着玩家走的数据。联机进入别人的世界时，玩家带着自己的背包、
 * 需求和已学配方——世界里的家具、宠物、储物箱属于 WorldSave。
 */
export type PlayerSave = {
  playerId?: PlayerId;
  name: string;
  avatar: AvatarConfig;
  missions: {
    daily: MissionInstance[];
    primary: MissionInstance[];
  };
  character: {
    inventory: InventoryStack[];
    inventoryId?: InventoryId;
    needs: PlayerNeedsSave;

    /**
     * 手上端着的东西。背包之外单独一格，因为带内容的容器**不能进背包**
     * （背包按 itemId 合堆，两口锅合成一堆会丢掉其中一口锅里的菜）。
     * 端着锅存盘、读档后锅还在手上，否则会凭空吞掉一口锅。
     */
    heldItem?: InventoryStack | null;

    /**
     * 坐 / 躺在哪件家具的哪个锚点上。
     * 纯新增的可选字段：老存档读出来是 undefined → 站着，不需要迁移。
     */
    restingOn?: {
      instanceId: PlacedFurnitureInstanceId;
      anchorId: AnchorId;
      returnTo: { x: number; z: number };
    } | null;
  };

  /** 已解锁的配方跟着玩家走：在朋友家的工作台前也能做自己会做的东西 */
  discoveredRecipeIds: RecipeId[];

  /**
   * 保存下来的行动清单（"写完 assignment2"这类）。
   * 跟着玩家走——这是**你现实里要做的事**，不属于哪间屋子。
   */
  actionEntries: PlayerActionEntry[];
};
