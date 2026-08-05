import type { LocalizationKey } from "./base.js";
import type { RewardDefinition } from "./events.js";
import type { UtcTimestamp, WorldDayId } from "./time.js";

/**
 * 每日任务机器（V0.11）。
 *
 * 玩家把现实里想做的事写成一池自由文本，机器每天抽 4 条当"今日任务"，
 * 做完手动打勾；屋里的共享进度条推进，凑满机器吐出奖励。
 *
 * ---- 三条设计约束，都写在类型里而不是靠实现记住 ----
 *
 * 1. **游戏不判定任务完成**。任务是自由文本（"喝八杯水"），没有任何信号
 *    能验证它。这和会自动结算的**行动系统**（`PlayerActionEntry`）分工明确：
 *    那套管"在游戏里坐下来做的事"，这套管"游戏管不到的事"。
 *    因此没有防作弊，而且是刻意的——能骗过它的唯一受害者是玩家自己。
 *
 * 2. **没有任何惩罚字段**。没有 streak、没有连续记录、没有"欠了几天"。
 *    Habitica 的数据：丢掉 2–3 天连续记录的用户只有 0.90% 会回来重开。
 *    一旦有"断掉"这个状态，断掉的人就不回来了。跨天就是干净地重来。
 *
 * 3. **池子跟着玩家、进度跟着世界**。联机时房客带自己的池子进房主家，
 *    看到的还是自己的待办；但两个人的勾加在同一个进度上（"各做一个算两次"）。
 */

/**
 * 玩家写的一条待办。**纯文本，游戏不理解它的含义**。
 *
 * `taskId` 稳定不变：改文案不换 id，这样"今天抽中的那条"才追得回模板。
 */
export type DailyTaskTemplate = {
  taskId: string;
  text: string;
  createdAtUtc: UtcTimestamp;
};

/**
 * 今天抽中的一条。
 *
 * **`text` 是抽签那一刻的快照**，不是每次回池子里查：玩家中途改了文案
 * （或者干脆删掉那条模板），今天已经抽出来的任务不该跟着变或凭空消失。
 * "今天要做的事"定了就是定了——这也是 `taskId` 允许指向一条已删模板的原因。
 */
export type DailyTaskDraw = {
  taskId: string;
  text: string;
  done: boolean;
};

/**
 * 跟着玩家走的那一半（挂在 `PlayerSave.dailyTasks`）。
 *
 * 不复用 `PlayerSave.missions.daily`（`MissionInstance[]`）：那个类型是给
 * "系统派发的、有 missionId 的任务"设计的，`status: active|completed|claimed`
 * 是三态领奖流程。这里是玩家自写的自由文本、两态、不单独领奖——
 * 硬套会得到一个两边都不像的类型。那个空壳留给将来真正的系统任务。
 */
export type DailyTasksSave = {
  pool: DailyTaskTemplate[];

  /**
   * 今日抽签结果。**`worldDayId` 变了就整个作废重抽**——
   * 惰性重置，不需要后台定时器，也不怕玩家离线跨了三天。
   */
  today?: {
    worldDayId: WorldDayId;
    draws: DailyTaskDraw[];
    /** 今天那一次重抽用掉了没有。跨天连同 today 一起作废 */
    rerollUsed?: boolean;
  };
};

/**
 * 跟着**世界**走的那一半（挂在 `WorldSave.dailyBoard`）。
 *
 * 放世界顶层而不是家具实例的 state 上，是为了让"摆多台机器"这件事
 * 自己解释自己：进度属于**这个家的今天**，机器只是它的显示器和出口。
 * 摆第二台不会多一份奖励，因为它显示的是同一份进度——不需要一条
 * "禁止摆两台"的规则。
 *
 * 代价：机器被收走时进度不跟着走。这是对的——今天做了几件事是这个家的
 * 事实，不是那台机器的。全部收走再摆回来，当天进度照旧。
 */
export type DailyBoardSave = {
  worldDayId: WorldDayId;
  /** 0..taskCount。**谁打的勾都算**，这就是"共享" */
  progress: number;
  /** 今天吐过奖励没有。防止两个客户端同时满格吐两份 */
  claimed: boolean;
};

/**
 * 玩法参数。**是注册表数据不是代码里的常量**——调平衡时改这里，不动逻辑。
 */
export type DailyBoardDefinition = {
  /** 每天抽几条。**同时是进度条的分母** */
  taskCount: number;

  /** 池子上限，防止无限写 */
  poolLimit: number;

  /** 单条任务文案的长度上限 */
  textLimit: number;

  /**
   * 每天能重抽几次。0 = 不许重抽。
   *
   * 定成 1 而不是无限：无限重抽等于让玩家直接筛出最容易的四条，
   * 抽签这个机制当场失效——而每天抽出不同组合正是对抗"第四周流失"
   * （游戏化 app 第四周 67% 流失）的主要手段。
   */
  rerollPerDay: number;

  /**
   * 满格奖励。**每个在场的人各得一整份**，不是分掉——
   * Habitica 的 party quest 就是这样：所有参与者拿到完全相同的奖励。
   */
  rewards: RewardDefinition[];

  /** 摆下第一台机器时飘的那句引导 */
  hintLocalizationKey: LocalizationKey;
};
