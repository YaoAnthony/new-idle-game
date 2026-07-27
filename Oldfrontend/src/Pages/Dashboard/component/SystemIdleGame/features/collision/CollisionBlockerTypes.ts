import type { NavigationEdge } from '../../shared/WorldGrid';

export type CollisionBlockerDebugKind =
  | 'terrain'
  | 'building'
  | 'furniture'
  | 'nature'
  | 'vehicle'
  | 'system'
  | 'npc-nav-only'
  | 'nav-edge';

export interface CollisionBlockerRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface CollisionBlockerNavEdge {
  col: number;
  row: number;
  edge: NavigationEdge;
}

export interface CollisionBlockerEntry {
  id: string;
  worldId: string;
  rects: readonly CollisionBlockerRect[];
  blocksPlayer: boolean;
  blocksNpcNav: boolean;
  debugLabel: string;
  debugKind?: CollisionBlockerDebugKind;
  navEdges?: readonly CollisionBlockerNavEdge[];
}

export interface CollisionBlockerSnapshot extends CollisionBlockerEntry {
  enabled: boolean;
}
