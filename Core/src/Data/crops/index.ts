import type { CropDefinition, CropId } from "../../types/farming.js";

/**
 * 作物注册表（2026-09-17）。**加一种作物 = 这里加一项 + 一包种子物品 +
 * 几段造型 + 文案键**，规则代码一行不改。
 *
 * 数字全是**占位**，用户随时改。改数只动这个文件——`logic/farming` 只认
 * 这里给的分钟数和区间，不藏任何数。
 *
 * 番茄是测试用例：两个世界的规则（哪些作物是这个世界的）定下来之后，
 * 这张表换内容，代码不动。
 */

export const farmingTuning = {
  /**
   * 一次浇水扣几格水。**范围浇水也是 1**：广口壶靠 capacity 大，不靠省水——
   * 否则"一次浇九格只扣一格"和"一格一格浇扣九格"是同一把壶两种账。
   */
  chargesPerPour: 1,
  /** 巨大果实的种子串里的盐，防止和别的抽签串撞上 */
  giantSeedSalt: "giant",
  /**
   * 节拍器几秒看一次田（画面刷新信号、巨大判定）。作物按分钟长，5 秒够了——
   * 更密只是多算几遍时间戳，画面不会更准。
   */
  tickSeconds: 5,
};

export const cropDefinitions: readonly CropDefinition[] = [
  {
    cropId: "tomato",
    localizationKey: "crop.tomato",
    seedItemId: "tomato_seed",
    // 占位：累计湿润 4 小时成熟
    growMinutes: 240,
    stages: [
      // 土堆是所有作物共用的一段：种下去了、还没冒头
      { at: 0, visual: "crop_sown" },
      { at: 0.2, visual: "crop_tomato_sprout" },
      { at: 0.55, visual: "crop_tomato_bush" },
      { at: 1, visual: "crop_tomato_ripe" },
    ],
    // 占位：一次水湿 90 分钟 → 4 小时要浇约 3 次
    needs: [{ kind: "water", lastsMinutes: 90 }],
    // 占位
    harvest: { itemId: "tomato", count: [2, 3], seeds: [1, 2] },
    // 占位：四格同时成熟时 20% 并成一颗，产量是四格分开收的 1.5 倍
    giant: { size: 2, chance: 0.2, yieldMultiplier: 1.5, visual: "crop_tomato_giant" },
  },
];

export function findCropDefinition(cropId: CropId): CropDefinition | undefined {
  return cropDefinitions.find((crop) => crop.cropId === cropId);
}

/** 手上这包种子种出什么。物品的 seed 块只写 cropId，反查走这里 */
export function cropOfSeed(seedItemId: string): CropDefinition | undefined {
  return cropDefinitions.find((crop) => crop.seedItemId === seedItemId);
}
