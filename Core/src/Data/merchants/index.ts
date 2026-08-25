import type { ItemId } from "../../types/items.js";

/**
 * 商人注册表（期 3）：**谁的货架上卖什么**。
 *
 * 只有"卖"没有"收"——收购不在这里写清单：水獭**什么都收**（决策 17），
 * 判据就是"这件东西有没有 `value`"，另抄一张收购清单等于把物品注册表
 * 复制第二遍，迟早走散。
 *
 * 价钱也不在这里：读物品自己的 `value`（一个数管买卖两头，见
 * `ItemDefinition.value` 那段——收和卖的集合不重叠，套利在结构上不成立）。
 * 这里只回答"上架哪些"。
 */
export type MerchantDefinition = {
  merchantId: string;
  /** 货架清单。价钱读各物品的 value */
  stock: ItemId[];
};

export const merchantDefinitions: MerchantDefinition[] = [
  {
    merchantId: "otter_trader",
    /*
     * 六种食材是**全游戏第一次有来源**（此前米/猪肉/青椒/皮蛋/娃娃菜/
     * 奶酪零产出，六道菜里四道做不出来）。
     *
     * 番茄种子上架而番茄不上架：**农田管温饱、商人卖好料**（决策 4）——
     * 能种的就该去种，买的是你种不出来的。这条分工让"买菜"是可选的
     * 优化而不是活下去的门槛，"不制造焦虑"落到货架上就是它。
     *
     * 基础材料（木头/甘蔗/皮革/铁锭/石墨）也上架：期 2 之后行动只出
     * 家具，这五种材料断了供，29 条工作台配方成了死内容。让水獭顺手
     * 卖材料是最省事的续命——"拆家具得材料"那条更有意思的路留给以后。
     */
    stock: [
      "rice",
      "pork",
      "green_pepper",
      "century_egg",
      "baby_cabbage",
      "cheese",
      "tomato_seed",
      "wood",
      "sugarcane",
      "leather",
      "iron_ingot",
      "graphite",
    ],
  },
  {
    merchantId: "traveling_peddler",
    /*
     * 稀客卖的是**永久 QoL 升级**，不是消耗品。
     *
     * 一次性买断、不通胀：买了就永远有，不会变成"每天都要买的开销"。
     * 这正是他和水獭的经济分工——水獭那边是经常性支出（吃饭），
     * 这边是攒钱的目标。两种开销都有，金币才既有下限也有上限。
     *
     * 今天只有一把广口水壶。斧头、鱼竿、稀有种子都是**加内容不加机制**
     * （`tool.power` 的语义已经通用），往这个数组里加一行就行。
     */
    stock: ["watering_can_wide"],
  },
];

export function findMerchantDefinition(
  merchantId: string,
): MerchantDefinition | undefined {
  return merchantDefinitions.find((m) => m.merchantId === merchantId);
}
