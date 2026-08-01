import type { AnchorId, InventoryId, PlayerId, WorldPosition } from "./base.js";
import type { ActionProcessSave, PlayerActionEntry } from "./actions.js";
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
     * 站在哪、面朝哪。
     *
     * 这是 `RuntimeGameState.participants[me].position` 的持久化形态——
     * **位置跟着人走**，所以落在 PlayerSave 不落在 WorldSave：联机时你带着
     * 自己的位置进房主的世界，`mapId` 负责区分"在自己家"还是"在别人家"。
     *
     * 存四向不存弧度：连续朝向是渲染层为了转身平滑才需要的，
     * 各端插值参数不可能一致，传弧度等于把表现层细节塞进联机协议。
     *
     * 纯新增可选字段：老存档读出来是 undefined → 回出生点，不需要迁移。
     */
    position?: WorldPosition;

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

  /**
   * 正在进行的那一个行动。
   *
   * **从 WorldSave 搬过来的**（save v12）。原来挂在世界上是错的形状：
   * 世界级单数字段意味着 3 个人进房主的世界只有一个"正在进行"的槽，
   * 两个访客同时开行动会互相覆盖。V0.2 文档把 `activity` 放在
   * `ParticipantState` 上正是为了避开这一点，而 `actionEntries`
   * 本来就在 PlayerSave——清单跟着人走、执行中的那条却留在世界里，
   * 本身也自相矛盾。
   *
   * 仍然按绝对 UTC 推进：关掉游戏也会照常完成。绑着的
   * `furnitureInstanceId` 指向所在世界的家具，离开那个世界就失效。
   */
  activeActionProcess?: ActionProcessSave;
};
