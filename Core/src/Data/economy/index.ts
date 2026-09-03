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

/**
 * 挂机经营（期 5 小店，期 8 餐厅复用）。
 *
 * ## 预算为什么按"人 × 天"给
 *
 * 客源是**函数不是数组**（用户 2026-08-24："我们可以默认是居民先"），
 * 所以收入自然跟着居民数走：三位邻居 = 一天 45 的销路上限。以后加小镇
 * 散客是往客源函数里加来源，这个数一个字不用改。
 *
 * 15 ≈ 三个勾。三位住齐 = 一天 45，比满格任务（4×5+12=32）高一截——
 * 这是有意的：小店是**从"等水獭来"变成"天天都能卖"**的那一步，
 * 它得比每日任务更值得经营，否则玩家没有理由盖它。占位值。
 *
 * ## 货位数是店铺唯一有意义的成长维度
 *
 * 升级不加价、不加客人，只加货位——因为**货架就是离线产出的上限**
 * （见 `logic/shopkeeping.ts`）。加货位 = 能离线更久，这条因果玩家一看就懂；
 * 加价或加客人则会把"升级"变成纯数值膨胀。
 */
export const shopkeepingTuning = {
  budgetPerResidentPerDay: 15,
  /** 各级的货位数。键是 levelId，和 `BuildingDefinition.levels` 对齐 */
  shelfSlotsByLevel: { l1: 6, l2: 12 } as Record<string, number>,
  /**
   * 盖起小店要多少钱。**测试期免费**（2026-08-30，用户定的）：
   * 经营循环（上架→隔夜卖→收银台领钱）正在搭，验证它得先有店；
   * 40 金的门槛此刻只挡开发不挡任何设计问题。上线前恢复收费时
   * 只改这个数——40 那版的理由还成立（图纸邻居送、工钱自付）。
   */
  buildGold: 0,
  /** 升到 l2 多少钱。占位值 */
  upgradeGold: 90,
} as const;

/**
 * 寄售箱（2026-09-02，用户定）。**保底渠道**：放进去的第二天一定卖掉，
 * 不看居民、不看预算，代价是只收 8 折——100 的东西小店能卖 100，寄售箱
 * 只给 80。小店是"全价但要有客人"，寄售箱是"打折但稳"：早期一个居民
 * 都没有时也能把家具换成钱，后期贵重物件仍然该走小店或水獭。
 *
 * 只有两个数。结算算法在 `logic/consign.ts`，钱走金币抽屉（`logic/goldDrawer.ts`）。
 */
export const consignTuning = {
  /** 寄售价 = 标价 × 这个数，向下取整；标价 > 0 的东西至少 1 枚 */
  priceRate: 0.8,
  /** 一只箱几个格。比小店 l1 的 6 少：它是"顺手卖两件"，不是开店 */
  slots: 4,
} as const;

/**
 * 1 级餐厅（期 8）。**型号 id 是 `diner`**——`restaurant` 早被小镇那家
 * 布景餐厅占了（`interiorMapId: "shop-restaurant"`，换图进店），
 * 两者除了都卖吃的以外没有任何关系。
 ***这一版只有楼，没有经营。**
 *
 * 卖料理 / 提供座位那套循环还没接，所以这里只放"盖它要多少钱"一个数——
 * 提前把座位数、翻台率、菜单这些填进来，等于用占位值把还没想清楚的
 * 设计固定下来，而那些数字一旦进了表就没人再回头质疑（小店那次
 * `budgetPerResidentPerDay` 就是这么定死的）。
 *
 * 定 120：比小店的 40 贵两倍。理由是**它是院子里第一栋要占 9×7 的楼**
 * ——领地里放得下它的位置只有几处（实测空院子里 10×8 只剩 33 个落点），
 * 这个选择应该重到值得想一想，而不是攒够 40 就随手一放。
 */
export const dinerTuning = {
  buildGold: 120,
} as const;

/**
 * 旅行商人（期 6）。
 *
 * ## 限量是这个角色的命
 *
 * 不限量他就是第二家常驻店：好东西买得完，"这趟没赶上"的遗憾就没了，
 * 而那份遗憾正是稀客的全部价值（星露谷推车、动森狐利同款规矩）。
 * 所以每趟只从货单里抽 `drawCount` 件、每件 `stockPerItem` 份，
 * 买光了这一趟就没了——关掉游戏再回来还是买光的状态。
 *
 * ## 什么时候来是固定的，摊上有什么是随机的
 *
 * 两个都随机的话他就是一家开得比较少的杂货铺。**日历可预期**（玩家能
 * 规划"下周他来，我先攒着"），**货单靠运气**——惊喜来自摊上有什么，
 * 不来自他来不来。周期读 `tradingTuning.travelerVisitEveryDays`（8 天）。
 */
export const travelerTuning = {
  /** 每趟从货单里抽几件摆出来 */
  drawCount: 3,
  /** 每件摆几份。1 = 真·限量，买走就没了 */
  stockPerItem: 1,
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
