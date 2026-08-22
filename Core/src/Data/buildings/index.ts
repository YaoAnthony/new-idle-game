/**
 * 建筑的**平衡数值**。模型和玩法在 Frontend，数字在这儿——照仓库的
 * 老规矩：内容与平衡数值进 `Core/src/Data/`，gameplay 代码里不许出现
 * 平衡数值。
 */

export const goldJarTuning = {
  /**
   * 各级容量。**占位值**——真正的数等任务 / 交易的产出量定下来再调。
   *
   * 单调递增是硬要求（`buildingAudit` 之外由用例钉住）：升级换来的
   * 必须是"能装更多"，否则升级这个动作没有意义。
   */
  capacityByLevel: { l1: 50, l2: 150, l3: 400 } as Record<string, number>,
};

/** 这一级的容量。认不出的等级给 0——没建罐 = 装不下，是同一条语义 */
export function jarCapacity(levelId: string): number {
  return goldJarTuning.capacityByLevel[levelId] ?? 0;
}

/**
 * 一组罐的总容量。**没有罐时是 0**，于是第一笔金币全额溢出。
 *
 * 这不是边界情况而是开局的常态：领地上一开始什么都没有，所以第一只罐
 * 的建造代价必须为 0，否则玩家永远攒不出建罐的钱（死锁）。
 */
export function totalCapacity(levelIds: readonly string[]): number {
  return levelIds.reduce((sum, id) => sum + jarCapacity(id), 0);
}

export const farmTuning = {
  /** 番茄：种下去多久到需浇水、多久成熟、收几个。占位值 */
  tomato: { waterAtMinutes: 30, growMinutes: 120, yield: 3 },
};
