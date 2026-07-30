export type MapId = string;
export type RoomId = string;
export type WallId = string;
export type OpeningId = string;
export type PlayerId = string;
export type WorldId = string;
export type FeatureId = string;
export type MissionId = string;
export type ActionId = string;
export type ProcessId = string;
export type InventoryId = string;
export type CustomDataId = string;
export type LocalizationKey = string;
export type VisualId = string;
export type AudioProfileId = string;
export type SlotId = string;
/** 家具上一个能安放身体的位置（椅面、床铺）。见 FurnitureAnchor */
export type AnchorId = string;

/**
 * 角色姿势的注册表键。和 VisualId 同一个路子：
 * Core 只存这个字符串，"具体哪个部件转多少度"是表现层的事。
 *
 * 分两层，因为姿势会组合而不是穷举：
 * - 姿态（站 / 坐 / 躺）管腿和身体高度
 * - 活动（伏案写字 / 端着东西）管手臂和上身倾斜
 * 「坐着学习」= 坐 + 伏案，两层各碰不同部件，叠加天然不冲突。
 * 否则 3 姿态 × 4 活动 = 12 个 id，加一个活动就要补一排。
 */
export type PoseId = string;

export enum Facing {
  North = "north",
  East = "east",
  South = "south",
  West = "west",
}

export enum Rarity {
  Common = "common",
  Uncommon = "uncommon",
  Rare = "rare",
  Epic = "epic",
  Legendary = "legendary",
  Mythic = "mythic",
}

export type GridFootprint = {
  width: number;
  height: number;
};

export type GridPosition = {
  x: number;
  y: number;
};

export type WorldPosition = {
  mapId: MapId;
  x: number;
  y: number;
  facing: Facing;
};
