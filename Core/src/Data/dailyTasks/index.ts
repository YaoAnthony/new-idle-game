import type { DailyBoardDefinition } from "../../types/dailyTasks.js";
import { economyStages } from "../economy/index.js";

/**
 * 每日任务机器的玩法参数（V0.11）。
 *
 * **全是数据不是常量**：调平衡（每天几条、奖励给什么）改这一处，
 * 逻辑一行不动。和 `actionPriorityDefinitions`、`petDefinitions` 同一个路子。
 */
export const dailyBoardDefinition: DailyBoardDefinition = {
  /**
   * 每天抽 4 条，同时是进度条的分母。
   *
   * **分母恒为 4，不随房里人数变**——两个人各打一个勾就是 2/4。
   * 若按人数缩放（4×人数），两个人各做一个只有 2/8，比单人还慢，
   * 和"一起过日子更轻松"的意图正好相反。副作用是人越多凑得越快，
   * 这是想要的（Habitica 的 Boss 战也是这个数学）。
   */
  taskCount: 4,

  /**
   * 池子上限。20 条足够写满一个人日常的所有花样，
   * 再多的话每天抽 4 条的重复率低到失去"今天要做这个"的分量。
   */
  poolLimit: 20,

  /** 单条文案上限。一行写得下的长度，写成日记就跑题了 */
  textLimit: 40,

  /** 每天一次重抽。为什么不是无限，见 DailyBoardDefinition 的注释 */
  rerollPerDay: 1,

  /**
   * 满格奖励。**在场每人各得一整份**，不是分掉。
   *
   * 现在只有一颗番茄，是为了先把流程跑通。以后要接战利品表
   * （`findLootTable`）、按天数/人数变化，都在这一处扩展——
   * `RewardDefinition` 已经支持 `item` 和 `unlock` 两种形状。
   */
  /*
   * 一份实物 + 一份金币。金币**直接进罐**不吐成地上的东西——罐就是钱包，
   * 吐成实物的话玩家能捡起来揣着，"容量就是持有上限"当场作废。
   *
   * 12 是占位值：真正的数等交易和建造代价定下来再调（期 2 的 upgradeCost
   * 还全是空数组）。
   */
  /*
   * 打一个勾当场 5 金币。即时反馈——你在现实里做完一件事，机器立刻有回应，
   * 不用等四条全打完。
   *
   * 4 条 × 5 = 20，加上满格那 12 就是一天 32；而 l1 罐只装 10，
   * **第二个勾之后就开始溢出**。这是故意的（用户 2026-08-23 定）：
   * 第一天就让玩家撞上"罐太小"，逼着去升罐/多建罐——容量是关卡这件事
   * 靠说明书讲不明白，靠漏掉几个金币一次就懂。溢出有明话提示，不是默默吞。
   */
  /*
   * **金额从 `Data/economy` 读，不在这里写字面量**（2026-08-24）。
   *
   * 原来这两个数（5 / 12）就写在这儿。它们同时是"一天能挣多少"这条
   * 不变量的分子，而分母（一天要花多少）住在别的文件——两处分开放，
   * 每次调平衡都要在文件之间心算，心算错了没有任何东西会报。
   * 现在收支并排在同一张表上，`economy.test.ts` 直接读它对账。
   *
   * 取 `economyStages[0]` 是因为阶段刻度还没定（用户：等数值平衡时再说），
   * 表里只有一个阶段。真接上阶段之后这里要改成"按当前阶段取"，
   * 那时候这个函数要能拿到运行时状态——所以那一天它会挪出注册表，
   * 变成一个由玩法层调用的选择器。今天不需要。
   */
  perTaskRewards: [{ type: "gold", amount: economyStages[0].income.perTaskCheck }],

  /*
   * **满格只给金币**（决策 2，2026-08-24）。
   *
   * 原来还有一颗番茄，是"先把流程跑通"时随手放的。现在两条产出线分工
   * 明确：**行动出家具、任务出金币**，中间靠卖货接起来。任务再吐一颗
   * 番茄的话，玩家会以为"食材从任务来"，而实际来源是农田和商人（期 3）。
   * 一条线一种产出，读得懂才记得住。
   */
  rewards: [{ type: "gold", amount: economyStages[0].income.boardComplete }],

  hintLocalizationKey: "hint.daily_board_first_placed",
};

/**
 * 每日确定性伪随机。**抽签不能用 Math.random()**——
 * 同一天里反复开关面板必须抽出同一批，否则玩家会一直重开面板
 * 直到抽到最容易的那四条，抽签这个机制当场失效。
 *
 * 用 FNV-1a 哈希把 `playerId + worldDayId` 这类字符串折成一个 32 位种子，
 * 再用 mulberry32 展开成序列。两者都是几行的经典实现，没有依赖，
 * 而且**结果只取决于输入**——读档、换设备、联机各端算出来都一样。
 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // FNV 质数 16777619，用移位加法凑（避免 JS 大整数乘法丢精度）
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32：给定种子的确定性 0~1 序列 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从候选里确定性地抽 count 个（不重复）。
 *
 * 洗牌取前 N 而不是"随机取 N 次去重"：后者在候选数接近 count 时
 * 会退化成大量重试，而且重试次数依赖运气——同一个种子在不同实现下
 * 可能走出不同的结果，那就不叫确定性了。
 *
 * 候选不足 count 时**返回全部**（不补空）：池子里只有两条就抽两条，
 * 分母仍是 taskCount，UI 负责说"再写几条才凑得满"。
 */
export function drawDeterministic<T>(
  candidates: readonly T[],
  count: number,
  seed: number,
): T[] {
  const pool = [...candidates];
  const random = seededRandom(seed);

  // Fisher-Yates，从后往前
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, Math.max(0, count));
}
