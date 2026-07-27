export const MAIN_WORLD_ID = 'world:main';

export type WorldNavigationPoint = {
  x: number;
  y: number;
  worldId?: string;
};

export type ResolvedWorldNavigationPoint = Required<WorldNavigationPoint>;

export interface WorldPortal {
  id: string;
  fromWorldId: string;
  toWorldId: string;
  approach: ResolvedWorldNavigationPoint;
  exit: ResolvedWorldNavigationPoint;
  returnPoint?: ResolvedWorldNavigationPoint;
  cost?: number;
  metadata?: Record<string, unknown>;
}

export type WorldNavigationActor = {
  name: string;
  sprite: { x: number; y: number };
  navigateTo: (x: number, y: number, onArrive?: () => void) => void;
  navigateDirectTo?: (x: number, y: number, onArrive?: () => void, worldId?: string) => void;
  navigateAlongPath?: (waypoints: [number, number][], onArrive?: () => void, worldId?: string) => void;
};

export interface WorldLocalNavigationAdapter {
  canHandleWorld(worldId: string): boolean;
  navigate(actor: WorldNavigationActor, target: Required<WorldNavigationPoint>, onArrive?: () => void): boolean;
}

export type WorldTransitionRequest = {
  actor: WorldNavigationActor;
  actorWorldId: string;
  targetWorldId: string;
  target: Required<WorldNavigationPoint>;
};

export type WorldTransition = {
  approach: Required<WorldNavigationPoint>;
  activate: (actor: WorldNavigationActor, onComplete: () => void) => void;
};

export interface WorldTransitionAdapter {
  resolveTransition(request: WorldTransitionRequest): WorldTransition | null;
}
