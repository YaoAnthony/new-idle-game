import type {
  AudioProfileId,
  Facing,
  GridFootprint,
  GridPosition,
  InventoryId,
  LocalizationKey,
  ProcessId,
  RoomId,
  VisualId,
  WallId,
} from "./base.js";

export type FurnitureId = string;
export type PlacedFurnitureInstanceId = string;

export enum FurnitureCategory {
  Station = "station",
  Storage = "storage",
  Bed = "bed",
  Seating = "seating",
  Table = "table",
  Lighting = "lighting",
  Decoration = "decoration",
}

export enum PlacementSurface {
  Floor = "floor",
  Wall = "wall",
}

export enum FurnitureCapability {
  Crafting = "crafting",
  Cooking = "cooking",
  Storage = "storage",
  Sleep = "sleep",
  Sitting = "sitting",
  Ambience = "ambience",
}

export type FurnitureDefinition = {
  id: FurnitureId;
  visualId: VisualId;
  footprint: GridFootprint;
  placementSurface: PlacementSurface;
  localizationKey: LocalizationKey;
  category: FurnitureCategory;
  capabilities: FurnitureCapability[];
  audioProfileId: AudioProfileId | null;
};

export type FloorFurniturePlacement = {
  kind: PlacementSurface.Floor;
  roomId: RoomId;
  gridPosition: GridPosition;
  facing: Facing;
};

export type WallFurniturePlacement = {
  kind: PlacementSurface.Wall;
  roomId: RoomId;
  wallId: WallId;
  gridPosition: GridPosition;
  facing: Facing;
};

export type FurniturePlacement = FloorFurniturePlacement | WallFurniturePlacement;

export type PlacedFurnitureState = {
  durability?: number;
  storageInventoryId?: InventoryId;
  activeProcessId?: ProcessId;
  customVisualId?: VisualId;
};

export type PlacedFurniture = {
  instanceId: PlacedFurnitureInstanceId;
  furnitureId: FurnitureId;
  placement: FurniturePlacement;
  state: PlacedFurnitureState;
};
