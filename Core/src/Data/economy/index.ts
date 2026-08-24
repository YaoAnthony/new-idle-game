/**
 * 经济总表。**改平衡只动这一个文件。**
 *
 * ## 为什么收支要并排
 *
 * 「一天做 4~5 个任务永远能 cover 当前开销」（用户 2026-08-24）是一条
 * **不变量**，不是一个数。要守住它，"这个阶段进多少 / 出多少"必须一眼
 * 看得见——分散在 dailyTasks、商人货架、餐厅进货三个文件里的话，每次
 * 调平衡都要在三处之间心算，而心算错了没有任何东西会报。
 * `Core/tests/economy.test.ts` 读的就是这张表。
 *
 * ## 阶段列是留着的，今天只有一个阶段
 *
 * 用户 2026-08-24：阶段刻度（挂在居民数还是地块数还是天数）等数值平衡时
 * 再定。所以这里**结构留全、数字大半是占位**——照 `goldJarTuning` 的先例
 * （l1 是拍过板的，l2/l3 明写占位）。真平衡时是往下面加行、改数，不是改代码。
 *
 * ## 这里放什么、不放什么
 *
 * 放**金额**（一天进多少、一件东西加价几成、偷走几枚）。
 * 不放**容量**（`goldJarTuning` 的 10/150/400 是"装得下多少"，
 * 和"一天进出多少"不是一张表上的东西）。
 * 也不放**单件价格**（那是内容，逐件写在 `Data/items` 的 `value` 上）。
 */

export type EconomyStage = {
  stageId: string;
  /** 人读的名字，报错信息里用 */
  label: string;

  income: {
    /** 每日任务打一个勾 */
    perTaskCheck: number;
    /** 四条全打完的满格奖 */
    boardComplete: number;
    /**
     * 卖货的**典型一天**估算。
     *
     * 卖货是脉冲式的（水獭三天来一趟，一趟清一批），这里填的是摊平到
     * 每天的量，**只给不变量测试当参考**——它不是任何地方的实际发放数，
     * 实际发放按每件的 `value` 算。
     */
    typicalSellPerDay: number;
  };

  spending: {
    /**
     * **必需**：不花就过不下去的（吃饭）。
     *
     * 这一项要低到 1~2 个勾就能覆盖——少做几天只该**慢**，不该**倒退**。
     * 这条界是整个"陪伴工具"定位在经济上的分水岭，`economy.test.ts`
     * 有一条专门钉它。
     */
    essentialPerDay: number;
    /**
     * **可选**：推进度用的（餐厅进货、旅行商人、盖楼摊平）。
     * 打满勾之后的余量就是它的预算。
     */
    optionalPerDay: number;
  };
};

/**
 * 阶段表。**今天只有一个阶段。**
 *
 * `opening` 这一行反映的是**期 1 落地时的真实状态**：卖货（期 3）和
 * 食材开销（期 3）都还不存在，所以两项都是 0。期 3 上线时把它们填上，
 * 那一刻不变量测试才真正开始咬人——现在它守的是"结构在、以后破不了"。
 */
export const economyStages: EconomyStage[] = [
  {
    stageId: "opening",
    label: "开局（还没有商人和居民）",
    income: {
      // 这两个是**现行值**不是占位：Data/dailyTasks 里已经在用
      perTaskCheck: 5,
      boardComplete: 12,
      // 期 3 之前没有销路
      typicalSellPerDay: 0,
    },
    spending: {
      // 期 3 之前食材不要钱（行动会掉、农田会长）
      essentialPerDay: 0,
      optionalPerDay: 0,
    },
  },
];

export function findEconomyStage(stageId: string): EconomyStage | undefined {
  return economyStages.find((stage) => stage.stageId === stageId);
}

/** 一天打满那块板能拿多少（N 个勾 + 满格奖）。不变量测试和 UI 共用 */
export function fullBoardIncome(stage: EconomyStage, taskCount: number): number {
  return stage.income.perTaskCheck * taskCount + stage.income.boardComplete;
}

/**
 * 交易的调参（期 3 起用）。
 *
 * 卖价就是物品的 `value`、**不打折**——收和卖的集合不重叠（水獭只收家具、
 * 只卖食材），套利在结构上不成立。所以这里只有"想要"的溢价和出摊周期。
 */
export const tradingTuning = {
  /** 水獭每趟有几件"这回特别想要的" */
  wantedCount: 3,
  /** 想要的那几件加多少倍。1.5 = 一件 20 的卖 30 */
  wantedMultiplier: 1.5,
  /**
   * 水獭多久来一趟（世界日）。**固定周期，玩家数得出来**（用户 2026-08-24）
   * ——他是"收货的熟人"，可预期正是他该有的气质。
   */
  otterVisitEveryDays: 3,
  /**
   * 旅行商人多久来一趟。**拉开到 7 天以上**，两个角色才不糊：
   * 一密一疏、一收一卖。惊喜来自"摊上有什么"，不来自"他来不来"。
   */
  travelerVisitEveryDays: 8,
} as const;

/**
 * 偷窃（期 3）。
 *
 * **第一次全额追回**（用户定），所以这个数不是净损失，是"一笔钱短暂地
 * 不见了"——要小到不吓人、大到看得见。8 枚 ≈ 一天半的每日任务收入，
 * 而且刚好比 l1 金库的容量（10）小一点：玩家看得见液面掉下去一截。
 */
export const theftTuning = {
  amount: 8,
} as const;

/** 居民买家具的日预算（期 5 小店的隔夜结算读它）。占位值 */
export const shopkeepingTuning = {
  budgetPerResidentPerDay: 15,
} as const;

/**
 * 居民（期 4）。
 *
 * 房子的建造费：图纸是他**送**的（对话里递给你），但把房子立起来的
 * 材料钱是你的——白得一栋楼的话，"给邻居安家"就没有付出感。
 * 15 ≈ 半天的满格任务，占位值。
 */
export const residentTuning = {
  houseBuildGold: 15,
} as const;
