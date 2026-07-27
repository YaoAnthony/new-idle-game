import type {
  Facing,
  GridFootprint,
  GridPosition,
  MapId,
  RoomId,
  WallId,
} from "./base.js";

export type WallSave = {
  wallId: WallId;
  facing: Facing;
  grid: GridFootprint;
  origin: GridPosition;
};

export type RoomSave = {
  roomId: RoomId;
  floorGrid: GridFootprint;
  walls: Record<string, WallSave>;
};

export type MapSave = {
  mapId: MapId;
  rooms: Record<string, RoomSave>;
};
