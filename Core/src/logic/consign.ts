/**
 * 寄售箱的结算算法。
 *
 * 和小店（`shopkeeping.ts`）是两种渠道：小店按客人的预算一件件挑，贵的可能
 * 挂很多天；寄售箱是**保底渠道**——箱里每一件第二天都成交，不看客人、不看
 * 预算，代价是只收打折价（`consignTuning.priceRate`，8 折）。
 *
 * 这里是纯函数：喂一份箱格 + 定价函数 + 折扣，吐出流水。不扣货、不入账，
 * 那两步归前端（`Systems/consigning.ts`）。预告（面板上的"明早到账"）和真
 * 结算走的是同一个函数——预告和实际不一样的话，玩家只会认为结算黑箱。
 */

export type ConsignSlot = { itemId: string; count: number } | null;

export type ConsignSale = {
  slotIndex: number;
  itemId: string;
  count: number;
  /** 每件成交价（已打折） */
  unitPrice: number;
};

/**
 * 寄售价：标价打折，**向下取整**。标价 > 0 的东西至少给 1——1 块钱的
 * 小玩意打 8 折是 0.8，取整成 0 等于白送，玩家会觉得箱子吞了东西。
 */
export function consignPriceOf(value: number, rate: number): number {
  if (value <= 0) return 0;
  return Math.max(1, Math.floor(value * rate));
}

/** 结算一次：箱里每一件都按寄售价成交。空格跳过，不改入参 */
export function settleConsign(
  slots: readonly ConsignSlot[],
  priceFor: (itemId: string) => number,
  rate: number,
): ConsignSale[] {
  const sold: ConsignSale[] = [];
  slots.forEach((slot, slotIndex) => {
    if (!slot || slot.count <= 0) return;
    sold.push({
      slotIndex,
      itemId: slot.itemId,
      count: slot.count,
      unitPrice: consignPriceOf(priceFor(slot.itemId), rate),
    });
  });
  return sold;
}

/** 一批流水总共多少钱 */
export function consignRevenue(sold: readonly ConsignSale[]): number {
  return sold.reduce((sum, sale) => sum + sale.unitPrice * sale.count, 0);
}
