/**
 * 建筑的**平衡数值**。模型和玩法在 Frontend，数字在这儿——照仓库的
 * 老规矩：内容与平衡数值进 `Core/src/Data/`，gameplay 代码里不许出现
 * 平衡数值。
 */

export const goldJarTuning = {
  /**
   * 各级容量。**l1 = 10 是用户定的**（2026-08-23）；l2 / l3 仍是占位值，
   * 等任务 / 交易的产出量定下来再调。
   *
   * 单调递增是硬要求（`buildingAudit` 之外由用例钉住）：升级换来的
   * 必须是"能装更多"，否则升级这个动作没有意义。
   */
  capacityByLevel: { l1: 10, l2: 150, l3: 400 } as Record<string, number>,
};

/** 这一级的容量。认不出的等级给 0——没建罐 = 装不下，是同一条语义 */
export function jarCapacity(levelId: string): number {
  return goldJarTuning.capacityByLevel[levelId] ?? 0;
}

/**
 * **不建罐也揣得下的那点钱**（用户 2026-08-23 定：默认上限 10，不是 0）。
 *
 * 原来没罐时总容量是 0，于是开局每一笔进账全额流失——每日任务打一个勾
 * 给 5 金币，新玩家看到的第一句反馈是"5 金币流失了"。死锁那条早就用
 * "第一只罐免费"解掉了，但**免费不等于已经建好**：从开局走到把罐立起来
 * 之间的每一笔收入照样蒸发，那段体验读起来像 bug 而不像设计。
 *
 * 它不是"身上的口袋"而是**院子里的钱匣**——和罐一样属于世界不属于人，
 * 所以做客时看到的是主人家的余额，不会把自己的钱混进去。
 *
 * 数值取 10 = 和 l1 罐一样：第一只罐的意义因此是"翻倍"，
 * 而不是"终于能存钱了"。
 */
export const BASE_GOLD_CAPACITY = 10;

/**
 * 一组罐的总容量。**只数罐，不含 `BASE_GOLD_CAPACITY`**——
 * 这个函数回答的是"罐给了多少"，钱匣那份由持有方自己加。
 *
 * 分开的理由是这两者的归属不同：罐会被拆、被升级，钱匣一直在。
 * 揉成一个数之后，"拆掉最后一只罐"和"从来没建过罐"就再也分不出来了。
 */
export function totalCapacity(levelIds: readonly string[]): number {
  return levelIds.reduce((sum, id) => sum + jarCapacity(id), 0);
}

export const farmTuning = {
  /** 番茄：种下去多久到需浇水、多久成熟、收几个。占位值 */
  tomato: { waterAtMinutes: 30, growMinutes: 120, yield: 3 },
};
