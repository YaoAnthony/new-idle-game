export type MapId = string;
export type RoomId = string;
export type WallId = string;
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
