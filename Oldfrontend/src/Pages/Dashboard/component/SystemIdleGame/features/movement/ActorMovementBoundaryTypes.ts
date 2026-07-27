export type ActorBoundaryKind = 'player' | 'npc' | 'pet';

export type ActorMovementAxis = 'x' | 'y';

export type ActorBoundaryInput = {
  kind: ActorBoundaryKind;
  id: string;
  worldId: string;
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
  tags?: readonly string[];
};
