import type { WorldAction } from '../../systems/WorldActionSystem';
import type { FarmActionKind, FarmActionTarget } from '../../features/farming/FarmSystem';

export interface FarmActionDefinition {
  id: FarmActionKind;
  worldActionType: Extract<
    WorldAction['type'],
    'TILL_TILE' | 'WATER_TILE' | 'PLANT_CROP' | 'HARVEST_CROP'
  >;
  defaultItemId?: string;
}

export const FARM_ACTION_DEFINITIONS: Record<FarmActionKind, FarmActionDefinition> = {
  till: {
    id: 'till',
    worldActionType: 'TILL_TILE',
    defaultItemId: 'scythe',
  },
  water: {
    id: 'water',
    worldActionType: 'WATER_TILE',
    defaultItemId: 'watering_can',
  },
  plant: {
    id: 'plant',
    worldActionType: 'PLANT_CROP',
    defaultItemId: 'wheat_seed',
  },
  harvest: {
    id: 'harvest',
    worldActionType: 'HARVEST_CROP',
  },
};

/**
 * Shared action catalogue for player/NPC capabilities.
 *
 * The executor decides when to run an action; this catalogue owns how a
 * capability maps to a world command.
 */
export class ActionCatalog {
  getFarmAction(action: FarmActionKind): FarmActionDefinition {
    return FARM_ACTION_DEFINITIONS[action];
  }

  toFarmWorldAction(
    actorId: string,
    action: FarmActionKind,
    target: Pick<FarmActionTarget, 'tx' | 'ty' | 'cropId' | 'worldId'>,
    itemId?: string,
  ): WorldAction {
    const definition = this.getFarmAction(action);
    if (definition.worldActionType === 'TILL_TILE') {
      return { type: 'TILL_TILE', actorId, tx: target.tx, ty: target.ty, worldId: target.worldId, itemId: itemId ?? definition.defaultItemId };
    }
    if (definition.worldActionType === 'WATER_TILE') {
      return { type: 'WATER_TILE', actorId, tx: target.tx, ty: target.ty, worldId: target.worldId, itemId: itemId ?? definition.defaultItemId };
    }
    if (definition.worldActionType === 'PLANT_CROP') {
      return { type: 'PLANT_CROP', actorId, tx: target.tx, ty: target.ty, worldId: target.worldId, itemId: itemId ?? definition.defaultItemId ?? 'wheat_seed' };
    }
    return { type: 'HARVEST_CROP', actorId, tx: target.tx, ty: target.ty, worldId: target.worldId, cropId: target.cropId ?? `${target.worldId ?? 'world:main'}:${target.tx},${target.ty}` };
  }
}

export const defaultActionCatalog = new ActionCatalog();
