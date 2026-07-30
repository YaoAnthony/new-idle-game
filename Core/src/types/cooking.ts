import type { LocalizationKey, VisualId } from "./base.js";
import type { FurnitureCapability } from "./furniture.js";
import type { ItemQuality } from "./inventory.js";
import type { ItemId } from "./items.js";

/**
 * 厨房系统的共享类型（设计见 `版本期望/V0.X - 厨房系统.md`）。
 *
 * 三条铁律，都是为了"加内容不改代码"：
 * 1. 厨具、加工方式、配方全部是注册表数据，没有任何字面量联合类型
 * 2. 系统代码不 switch 加工方式，只做 cookware.methods ∋ recipe.method 的匹配
 * 3. 食材的归属是指针（在手里 / 在槽位 / 在容器内），绝不同时记两处
 */

// ---- 加工方式 ----

export type CookMethodId = string;

/**
 * 「怎么加热」也是内容而不是枚举：交互气泡要显示「炒」这个字（localizationKey），
 * 火焰/水汽/油烟按方式区分（visualId）。凡是需要挂数据的就走注册表。
 */
export type CookMethodDefinition = {
  id: CookMethodId;
  localizationKey: LocalizationKey;
  /** 加热时的表现。渲染层自己查，逻辑层不认识 */
  visualId?: VisualId;
};

// ---- 厨具与盛器：ItemDefinition 上的能力块 ----

/** 「这是一口锅」= 这个 ItemId 带 cookware 块。不需要独立的 id 空间 */
export type CookwareId = ItemId;
export type ServingWareId = ItemId;

export type CookwareBlock = {
  /** 能做哪些加工方式，配方靠这个匹配 */
  methods: CookMethodId[];
  /** 固定容量，不做体积计算 */
  capacity: number;
  /**
   * 要架在带哪种能力的家具上才会加热。
   * 不填 = 不需要火，放哪张台面都能用（搅拌碗）。
   */
  heatSource?: FurnitureCapability;
};

export type ServingWareBlock = {
  /** 一盘能装几样，和 CookwareBlock 同名同义 */
  capacity: number;
  /** 只收某几类菜？留空 = 什么都能盛。对 ItemDefinition.ingredient.tags */
  acceptsTags?: string[];
};

// ---- 配方 ----

export type CookingRecipeId = string;

export type CookingRecipeInput = {
  itemId: ItemId;
  quantity: number;
};

/**
 * 配方表是扁平的：半成品留在锅里继续加工，所以「番茄炒蛋 = 煎鸡蛋 + 番茄」
 * 仍然只是一条普通配方，其中一样材料恰好是另一条配方的产物。
 * 合成树是数据自己长出来的，系统不需要感知"这是第几步"。
 */
export type CookingRecipeDefinition = {
  id: CookingRecipeId;
  localizationKey: LocalizationKey;
  /** 引注册表里的物品 id，不是写死的字符串 */
  cookwareId: CookwareId;
  method: CookMethodId;
  /** 锅内需要的东西。可以包含其他配方的产出（煎鸡蛋） */
  inputs: CookingRecipeInput[];
  output: ItemId;
  durationSeconds: number;
  /**
   * 进度条会不会烧到红色。省略 = true。
   * 半成品（煎鸡蛋）写 false：进度走完就停住等你加下一样。
   *
   * 为什么显式声明而不是「有配方用到它就是半成品」那样推导：
   * 推导会让"以后加一道盖饭"顺手改掉番茄炒蛋要不要盯火，
   * 而那是手感决定，不该由不相关的内容改动来决定。
   */
  overcookable?: boolean;
};

// ---- 火候 ----

/**
 * 进度条四色。白（刚下锅）→ 绿（没熟）→ 黄（上乘）→ 红（焦了）。
 * 玩家看准颜色按 F 起锅，品质就定在那一刻。
 */
export enum HeatBand {
  Raw = "raw",
  Undercooked = "undercooked",
  Perfect = "perfect",
  Overcooked = "overcooked",
}

/**
 * 火候的时间刻度，全部是 durationSeconds 的倍数。
 * 平衡数值不写在 gameplay 代码里（AGENTS.md），放注册表这边。
 */
export type HeatTuning = {
  /** 白 → 绿 的分界 */
  undercookedAt: number;
  /** 绿 → 黄 的分界，正好是 1（配方时长走完就是刚熟） */
  perfectAt: number;
  /** 黄 → 红 的分界 */
  overcookedAt: number;
  /** 进度环画满的位置，用来把红色段也画得出来 */
  ringFullAt: number;
};

// ---- 容器内容 ----

/**
 * 容器里的一份东西。食材按 itemId 计数，不需要每份一个实例。
 * quality 只在"这份东西本身是道菜"时有意义（煎鸡蛋），用来传递给下一步。
 */
export type ContainerItem = {
  itemId: ItemId;
  quantity: number;
  quality?: ItemQuality;
};

/**
 * 容器（锅 / 碗 / 盘）的内容与进度。
 *
 * 挂在 ItemStackState.container 上——于是端起锅的时候内容自动跟着走，
 * 不会出现"锅记在手上、食材还留在台面数据里"这个经典 Bug。
 */
export type ContainerContents = {
  items: ContainerItem[];
  /** 当前内容匹配到的配方；没有匹配 = 配错了，停止加热 */
  recipeId?: CookingRecipeId;
  /** 已累积的加热秒数。端离灶台就停止累加，不清零 */
  heatSeconds: number;
};
