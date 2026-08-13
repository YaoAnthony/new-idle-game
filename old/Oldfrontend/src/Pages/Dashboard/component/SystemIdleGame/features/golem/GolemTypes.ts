import type { BuildingFacing } from '../building/BuildingTypes';

export type GolemState = 'dormant' | 'awake' | 'idle' | 'moving' | 'building' | 'repairing' | 'upgrading';

export interface GolemTaskSave {
  kind: 'building' | 'repairing' | 'upgrading' | 'moving';
  targetBuildingId?: string;
  startedAtGameMinute: number;
  completesAtGameMinute: number;
}

export interface GolemInstanceSave {
  id: string;
  definitionId: 'stone_golem' | string;
  displayName: string;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  worldId: string;
  facing: BuildingFacing;
  state: GolemState;
  task?: GolemTaskSave | null;
  ownerPlayerId?: string;
  awakenedAtGameMinute?: number | null;
  createdAtGameMinute: number;
  updatedAtGameMinute: number;
  meta?: Record<string, unknown>;
}

export interface AwakenGolemRequest {
  roomId?: string | null;
  golemId?: string;
  x?: number;
  y?: number;
  cellX?: number;
  cellY?: number;
  worldId?: string;
  absoluteGameMinutes?: number;
}

export interface SpawnGolemRequest extends AwakenGolemRequest {
  state?: 'dormant' | 'awake';
}

export interface AssignGolemRequest {
  roomId?: string | null;
  golemId: string;
  task: Partial<GolemTaskSave>;
  absoluteGameMinutes?: number;
}

export interface AssembleGolemRequest {
  roomId?: string | null;
  buildingIds: string[];
  absoluteGameMinutes?: number;
}

export interface GolemApiResponse {
  success: boolean;
  golem?: GolemInstanceSave;
  golems: GolemInstanceSave[];
  gameSave: unknown;
}
