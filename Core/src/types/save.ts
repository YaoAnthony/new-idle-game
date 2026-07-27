import type { PlayerSave } from "./player.js";
import type { UtcTimestamp } from "./time.js";
import type { WorldSave } from "./world.js";

export type GameSaveMeta = {
  saveSchemaVersion: number;
  createdAtUtc: UtcTimestamp;
  updatedAtUtc: UtcTimestamp;
  cloudRevision?: number;
};

export type GameSave = {
  meta: GameSaveMeta;
  player: PlayerSave;
  ownWorld: WorldSave;
};
