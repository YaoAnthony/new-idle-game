import type { ActionId, PlayerId, WorldPosition } from "./base.js";
import type { PlacedFurnitureInstanceId } from "./furniture.js";
import type { WorldSave } from "./world.js";

export type WorldSnapshot = WorldSave;

export type RuntimeGameState = {
  activeWorld:
    | {
        kind: "own";
        world: WorldSave;
      }
    | {
        kind: "remote";
        world: WorldSnapshot;
        hostPlayerId: PlayerId;
        revision: number;
      };
  participants: Record<string, ParticipantState>;
};

export type ParticipantState = {
  playerId: PlayerId;
  position: WorldPosition;
  activity?: {
    actionId: ActionId;
    startedAt: number;
    furnitureInstanceId?: PlacedFurnitureInstanceId;
  };
};
