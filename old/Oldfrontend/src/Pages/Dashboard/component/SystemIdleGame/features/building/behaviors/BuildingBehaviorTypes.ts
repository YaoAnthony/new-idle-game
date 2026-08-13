import type { BuildingBehaviorKey, BuildingDefinition, BuildingInstanceSave } from '../BuildingTypes';

export interface BuildingBehaviorContext {
  scene: any;
  definition: BuildingDefinition;
}

export interface BuildingBehavior {
  key: BuildingBehaviorKey;
  ownsRuntimeView?: boolean;
  onLoaded?: (building: BuildingInstanceSave, context: BuildingBehaviorContext) => void;
  onPlaced?: (building: BuildingInstanceSave, context: BuildingBehaviorContext) => void;
  onRemoved?: (building: BuildingInstanceSave, context: BuildingBehaviorContext) => void;
  onInteracted?: (building: BuildingInstanceSave, context: BuildingBehaviorContext) => boolean | void;
  onRuntimeSync?: (building: BuildingInstanceSave, context: BuildingBehaviorContext) => void;
  onUpdate?: (context: { scene: any; playerPosition: { x: number; y: number } | null }) => void;
}

export function hasBehavior(definition: BuildingDefinition | null | undefined, key: BuildingBehaviorKey): boolean {
  return definition?.behaviors?.includes(key) ?? false;
}
