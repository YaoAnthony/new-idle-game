import type { ItemId } from "../../types/items.js";

/**
 * 战利品表：一次性容器（搬家纸箱、任务奖励箱）里装了什么。
 *
 * 为什么单独一张表而不是写在家具定义上：同一种"纸箱"要能装不同的东西——
 * 装什么是**这一箱**的属性，不是"纸箱"这个品类的属性。
 * 所以家具定义只说"我是一次性容器"（FurnitureCapability.Unpack），
 * 实例的 `state.lootTableId` 指向这里的某一条。
 *
 * 以后任务奖励、宠物带回来的包裹都复用这套，不用再造一遍轮子。
 */

export type LootEntry = {
  itemId: ItemId;
  quantity: number;
};

export type LootTableDefinition = {
  id: string;
  /** 开箱面板的标题文案 key */
  localizationKey: string;
  entries: LootEntry[];
};

export const lootTableDefinitions: LootTableDefinition[] = [
  /**
   * 搬家第一天的两个纸箱（2026-07-30 定稿：开局只留这两个）。
   *
   * 拆成"工具"和"家什"两箱是有讲究的：玩家开第一箱拿到工作台和炒锅，
   * 立刻就能做饭做东西；第二箱是桌椅，是"把家布置起来"的开始。
   * 一箱全给的话，32 格背包一次性塞满，玩家反而不知道先干嘛。
   */
  {
    id: "moving_tools",
    localizationKey: "loot.moving_tools",
    entries: [
      { itemId: "furniture_kitchen_counter", quantity: 1 },
      { itemId: "furniture_workbench", quantity: 1 },
      { itemId: "wok", quantity: 1 },
      { itemId: "plate", quantity: 1 },
    ],
  },
  {
    id: "moving_furniture",
    localizationKey: "loot.moving_furniture",
    entries: [
      { itemId: "furniture_table", quantity: 1 },
      { itemId: "furniture_chair", quantity: 2 },
      // 地铺原来是"背着来的"，开局直接在手上。但教程第一步就是拆箱子，
      // 那条兜底兜的是一个玩家必然会做的动作——而代价是开局第一眼
      // 手上凭空多个东西，和"行李全在箱子里"这个开场自相矛盾
      { itemId: "bedroll", quantity: 1 },
    ],
  },
];

export function findLootTable(id: string): LootTableDefinition | undefined {
  return lootTableDefinitions.find((table) => table.id === id);
}
