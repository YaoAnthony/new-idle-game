/**
 * 挂机式经营的结算算法：**货架 + 客人 → 谁买走了什么**。
 *
 * 两个用户：家具小店（期 5）和自家餐厅（期 8）。两者的差别只有三样——
 * 货是什么、客人是谁、一件值多少——所以它们是这个函数的**入参**，
 * 不是两份代码。从第一天就按两个用户写：等期 8 再来抽象的话，
 * 第一个用户早就长满了小店专属的假设，抽象会变成重写。
 *
 * ## 为什么是挂机式而不是柜台式
 *
 * 用户 2026-08-24 定的。而它恰好是本作**唯一**和「关掉游戏也在走」对得上的
 * 形态：把货摆上、关掉、明天回来钱到账。柜台式（客人上门你现卖）要求玩家
 * 在场盯着，和整个陪伴定位拧着。
 *
 * ## 货架就是天然的上限
 *
 * 离线十天回来不会凭空多出十天的钱——**货架上有多少就卖多少，卖完就停**。
 * 这正是动森那条「产出补但封顶」（跳一天化石 4→6，跳十天还是 6），
 * 而我们连封顶规则都不用写，货架自己就是上限。**不要再加一层"最多补 N 天"**：
 * 那是在惩罚离线，而离线封顶那条规矩管的是消耗（饿、累），不是产出。
 *
 * ## 为什么在 Core 而不在前端
 *
 * 照 `goldJar.ts` 的先例：**算法在 Core、接线在前端**。这样"离线十天只卖出
 * 三天的货"这种用例不用起浏览器、不用碰存档，一个纯函数就钉死了。
 */

/** 货架上的一格。null = 空位 */
export type ShelfSlot = { itemId: string; count: number } | null;

/** 一位客人和他今天的钱包 */
export type Customer = { id: string; budget: number };

export type SoldEntry = {
  itemId: string;
  /** 卖给谁 */
  customerId: string;
  /** 实际成交价 */
  price: number;
  /** 从哪一格卖走的。调用方照它扣货 */
  slotIndex: number;
};

export type SettleInput = {
  slots: readonly ShelfSlot[];
  customers: readonly Customer[];
  /** 一件货对某位客人值多少。餐厅要按品质加价，小店就是 value */
  priceFor: (itemId: string, customerId: string) => number;
  /**
   * 这一天最多能收多少钱。**金库还剩多少空位**（不填 = 不限）。
   *
   * ## 为什么装不下就不卖，而不是照卖然后溢出
   *
   * 金币罐是钱包、超出容量的部分丢弃——这是 `goldJar.ts` 立下的规矩，
   * 玩家在场时它是好的：`depositGoldTo` 当场弹一句"金库满了"，
   * 玩家知道这趟白跑了一半。
   *
   * 挂机结算**没有那个当场**。离线一夜回来，钱在你不在的时候溢出了，
   * 没有任何提示，只有一屋子少掉的家具——那是"东西没了钱也没了"。
   * 所以这里换一条：**金库装不下就不成交，货留在架上**。没有任何损失，
   * 玩家第二天看见满架的货和满格的金库，自己就知道该加个罐子了。
   *
   * 这也没有破坏"货架就是上限"，只是多了一个同样看得见的上限：
   * 架上的存量，和金库的空位。
   */
  revenueCap?: number;
};

/**
 * 结算一天。
 *
 * ## 顺序是确定的，不掷骰子
 *
 * 客人按 id 排序、每人从**贵的往便宜的**挑、买得起就买。同一天同一份货架
 * 同一批客人，算出来必须**逐字一样**——否则玩家发现"今天没卖出去"就重开
 * 游戏重摇销量，和每日任务抽签、水獭想要清单是同一条判据。
 *
 * 这里连 `hashSeed` 都不需要：**顺序本身就是确定的**。引入随机再用种子
 * 锁住，是把一个本来就不必存在的自由度先造出来再关掉。
 *
 * ## 为什么贵的先被买走
 *
 * 这样"把好货摆上去"才有回报。反过来（便宜的先走）会让玩家发现摆一堆
 * 廉价小件的日收入更高——那是在奖励刷量，不是奖励经营。
 *
 * 返回的是**流水**不是新货架：扣货由调用方做（前端的货架是储物库存，
 * 有它自己的增删接口和联机通道），这个函数不碰状态。
 */
export function settleDay(input: SettleInput): SoldEntry[] {
  const { slots, customers, priceFor, revenueCap } = input;

  // 本地账本：一格卖掉几件。不改入参
  const takenPerSlot = slots.map(() => 0);
  const sold: SoldEntry[] = [];
  let till = revenueCap ?? Number.POSITIVE_INFINITY;

  const queue = [...customers].sort((a, b) => a.id.localeCompare(b.id));

  for (const customer of queue) {
    let wallet = customer.budget;

    /*
     * 一位客人可以买好几件（预算够就继续）。每买一件重新挑一次最贵的买得起的
     * ——而不是先排好一张清单：买完第一件之后钱包变小，原来排在后面的那件
     * 可能已经买不起了。
     */
    for (;;) {
      let bestIndex = -1;
      let bestPrice = -1;

      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i];
        if (!slot) continue;
        if (slot.count - takenPerSlot[i] <= 0) continue;

        const price = priceFor(slot.itemId, customer.id);
        // 白送的东西不占成交（价 0 的货会让"卖出去了"这句话变得没有意义）
        if (price <= 0) continue;
        if (price > wallet) continue;
        // 金库塞不下这一笔就不成交（整笔，不找零）
        if (price > till) continue;

        if (price > bestPrice) {
          bestPrice = price;
          bestIndex = i;
        }
      }

      if (bestIndex < 0) break;

      takenPerSlot[bestIndex] += 1;
      wallet -= bestPrice;
      till -= bestPrice;
      sold.push({
        itemId: slots[bestIndex]!.itemId,
        customerId: customer.id,
        price: bestPrice,
        slotIndex: bestIndex,
      });
    }
  }

  return sold;
}

/** 一笔流水的总金额。结算和报纸都要，别各写各的 reduce */
export function totalRevenue(sold: readonly SoldEntry[]): number {
  return sold.reduce((sum, entry) => sum + entry.price, 0);
}
