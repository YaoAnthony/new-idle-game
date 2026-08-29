import type { AnchorId, InventoryId, PlayerId, WorldPosition } from "./base.js";
import type {
  ActionLogSave,
  ActionProcessSave,
  DiarySave,
  PlayerActionEntry,
} from "./actions.js";
import type { AvatarConfig } from "./avatar.js";
import type { DailyTasksSave } from "./dailyTasks.js";
import type { ActionChainSave } from "./actions.js";
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
  /**
   * 玩家自建的系列任务（行动链）。跟着人走：联机进别人的世界，
   * 看到的还是自己的目标。
   *
   * 这里原来是 missions: { daily, primary }（MissionInstance 三态领奖的
   * 死壳，从未被读写）——v28 删掉。系统派发的任务将来要做时另起类型，
   * 别复活那个壳。
   */
  actionChains: ActionChainSave[];

  /**
   * **在别人家赚的、还没带回家的钱**（存档 v29）。
   *
   * 做客时运行时里装着的是**房主的**世界，金币罐当然也是房主的——赚到的钱
   * 直接入账等于往朋友的罐子里塞钱（用户 2026-08-23 定："联机的人获得的
   * 金币存到自己的世界的金库里面，而不是这个人的"）。而自己家的罐子这会儿
   * 根本不在运行时里，存不进去。
   *
   * 所以钱先记在**人**身上，回家那一刻再走正常入账（该溢出照样溢出——
   * 罐装不下是罐的事，不因为钱是外面赚的就网开一面）。
   *
   * 落在 PlayerSave 不落在 WorldSave 的理由和 `actionChains`、`character.position`
   * 一样：**它跟着人走**。做客期间的存档合成（composeGuestSave）玩家侧照抄
   * 运行时、世界侧用入房前快照，所以挂在这里的钱中途崩溃也不丢。
   *
   * 老档没有 → 0。不是"欠玩家一笔"，是"没在外面赚过钱"。
   */
  pendingGold?: number;

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
   * 每日任务的池子和今日抽签（V0.11）。同样跟着玩家走：
   * 联机去朋友家做客，看到的还是自己的那几条待办。
   *
   * 和上面的 `actionEntries` 分工：那些是**能在游戏里做完并自动结算**的
   * （专注 25 分钟）；这些是游戏判定不了、只能自己打勾的（"喝八杯水"）。
   *
   * 纯新增可选字段：老存档读出来是 undefined → 空池子，不需要迁移。
   */
  dailyTasks?: DailyTasksSave;

  /**
   * 事后补记用掉的每日额度（2026-08-25）。
   *
   * 跟着玩家走，和上面的 `actionEntries` 同一个理由：补记的是**你现实里
   * 做过的事**，不属于哪间屋子；去朋友家做客用掉的还是自己那份。
   *
   * 纯新增可选字段：老存档读出来是 undefined → 今天还没补记过，
   * 不需要迁移。
   */
  actionLog?: ActionLogSave;

  /**
   * 日记本（v35，2026-08-29）。**挂在玩家身上，不挂在世界上**——
   * 用户原话"联机可不能用的是别人的日记"：做客时翻开的必须还是
   * 自己的历史。
   *
   * 结构是**稀疏数组**：只存有内容的那些天（用户点名的形状），
   * 翻到没记录的日子渲染空页即可，不用为每一天占一条。不修剪——
   * 它就是"完整的历史"这个需求的存放处；`dayFacts` 那份两天的
   * 修剪版继续归报纸，两者职责不同不合并。
   */
  diary?: DiarySave;

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
