import { WorldStateManager } from '../state/WorldStateManager';
import type { WorldEntityKind, WorldObjectKind } from '../state/worldStateTypes';
import { FarmSystem } from '../../features/farming/FarmSystem';
import { NestStateSystem } from '../../features/creatures/NestStateSystem';
import type { TreeSystem } from '../../features/farming/TreeSystem';
import type {
  PetBehaviorMode,
  PetColor,
  PetHomeAnchor,
  PetLifeStage,
  PetLifeState,
  PetMemorySeed,
  PetPersonality,
} from '../../features/pets/PetTypes';
import type { PetTravelDirection } from '../../features/pets/travel/PetTravelTypes';

export type WorldAction =
  | { type: 'MOVE_ENTITY'; entityId: string; x: number; y: number; worldId?: string }
  | { type: 'PLACE_OBJECT'; actorId: string; itemId: string; x: number; y: number; worldId?: string; placeEntity?: 'bed' | 'nest' | 'pet' | 'fence' | 'path' | 'building'; buildingDefinitionId?: string }
  | { type: 'PLACE_BUILDING'; actorId: string; definitionId: string; itemId?: string; x: number; y: number; cellX?: number; cellY?: number; worldId?: string }
  | { type: 'MOVE_BUILDING'; actorId: string; buildingId: string; x: number; y: number; cellX?: number; cellY?: number; worldId?: string }
  | { type: 'ROTATE_BUILDING'; actorId: string; buildingId: string; facing: 'up' | 'down' | 'left' | 'right' }
  | { type: 'REMOVE_BUILDING'; actorId?: string; buildingId: string }
  | { type: 'START_BUILDING_UPGRADE'; actorId?: string; buildingId: string; absoluteGameMinutes?: number }
  | { type: 'START_BUILDING_REPAIR'; actorId?: string; buildingId: string; absoluteGameMinutes?: number }
  | { type: 'COMPLETE_BUILDING_JOB'; actorId?: string; absoluteGameMinutes: number }
  | { type: 'PLACE_HOUSE'; actorId: string; definitionId: string; blueprintItemId: string }
  | { type: 'PLACE_STORAGE_CHEST'; actorId: string; itemId: string }
  | { type: 'PLACE_PET'; actorId: string; itemId: string; x: number; y: number; worldId?: string; petEntityId?: string; petDefinitionId?: string; ownerNpcId?: string; displayName?: string; memories?: PetMemorySeed[]; home?: Partial<PetHomeAnchor>; behavior?: PetBehaviorMode; canSpeak?: boolean; petColor?: PetColor; petLifeStage?: PetLifeStage; birthGameMinute?: number; life?: Partial<PetLifeState>; personality?: Partial<PetPersonality> }
  | { type: 'REMOVE_OBJECT'; actorId?: string; objectId: string; objectKind?: WorldObjectKind }
  | { type: 'PICKUP_DROP'; actorId: string; dropId: string; itemId: string }
  | { type: 'DROP_ITEM'; actorId: string; itemId: string; x: number; y: number; worldId?: string; quantity?: number; dropId?: string }
  | { type: 'PET_INTERACT'; actorId: string; petEntityId: string; absoluteGameMinutes?: number; heldItemId?: string }
  | { type: 'PET_REMEMBER'; actorId: string; petEntityId: string; memory: PetMemorySeed }
  | { type: 'PET_SET_HOME'; actorId: string; petEntityId: string; home: Partial<PetHomeAnchor> }
  | { type: 'PET_TRAVEL_DEPART'; actorId?: string; petEntityId: string; entryId: string; direction?: PetTravelDirection; absoluteGameMinutes?: number }
  | { type: 'PET_TRAVEL_RETURN'; actorId?: string; petEntityId: string; entryId: string; absoluteGameMinutes?: number }
  | { type: 'TILL_TILE'; actorId: string; tx: number; ty: number; worldId?: string; itemId?: string }
  | { type: 'WATER_TILE'; actorId: string; tx: number; ty: number; worldId?: string; itemId?: string }
  | { type: 'PLANT_CROP'; actorId: string; tx: number; ty: number; worldId?: string; itemId: string }
  | { type: 'HARVEST_CROP'; actorId: string; cropId: string; tx: number; ty: number; worldId?: string }
  | { type: 'CHOP_TREE'; actorId: string; treeId: string }
  | { type: 'PICK_FRUIT'; actorId: string; treeId: string }
  | { type: 'NEST_OCCUPY'; nestId: string; chickenId: string }
  | { type: 'NEST_RELEASE'; nestId: string; chickenId?: string }
  | { type: 'NEST_LAY_EGG'; nestId: string; chickenId?: string; atTime: number }
  | { type: 'NEST_COLLECT_EGG'; actorId: string; nestId: string }
  | { type: 'UPDATE_ENTITY_STATE'; entityId: string; kind?: WorldEntityKind; patch: Record<string, unknown> }
  | { type: 'UPDATE_TREE_STATE'; treeId: string; patch: Record<string, unknown> }
  | { type: 'UPDATE_NEST_STATE'; nestId: string; patch: Record<string, unknown> };

export interface WorldActionResult {
  ok: boolean;
  action: WorldAction;
  reason?: string;
  changedIds?: string[];
}

export interface WorldActionDispatcher {
  dispatchAction(action: WorldAction): WorldActionResult;
}

interface WorldActionEffects {
  onPlaceObject?: (action: Extract<WorldAction, { type: 'PLACE_OBJECT' }>) => WorldActionResult;
  onPlaceBuilding?: (action: Extract<WorldAction, { type: 'PLACE_BUILDING' }>) => WorldActionResult;
  onMoveBuilding?: (action: Extract<WorldAction, { type: 'MOVE_BUILDING' }>) => WorldActionResult;
  onRotateBuilding?: (action: Extract<WorldAction, { type: 'ROTATE_BUILDING' }>) => WorldActionResult;
  onRemoveBuilding?: (action: Extract<WorldAction, { type: 'REMOVE_BUILDING' }>) => WorldActionResult;
  onStartBuildingUpgrade?: (action: Extract<WorldAction, { type: 'START_BUILDING_UPGRADE' }>) => WorldActionResult;
  onStartBuildingRepair?: (action: Extract<WorldAction, { type: 'START_BUILDING_REPAIR' }>) => WorldActionResult;
  onCompleteBuildingJob?: (action: Extract<WorldAction, { type: 'COMPLETE_BUILDING_JOB' }>) => WorldActionResult;
  onPlaceHouse?: (action: Extract<WorldAction, { type: 'PLACE_HOUSE' }>) => WorldActionResult;
  onPlaceStorageChest?: (action: Extract<WorldAction, { type: 'PLACE_STORAGE_CHEST' }>) => WorldActionResult;
  onPlacePet?: (action: Extract<WorldAction, { type: 'PLACE_PET' }>) => WorldActionResult;
  onRemoveObject?: (action: Extract<WorldAction, { type: 'REMOVE_OBJECT' }>) => WorldActionResult;
  onPickupDrop?: (action: Extract<WorldAction, { type: 'PICKUP_DROP' }>) => WorldActionResult;
  onDropItem?: (action: Extract<WorldAction, { type: 'DROP_ITEM' }>) => WorldActionResult;
  onPetInteract?: (action: Extract<WorldAction, { type: 'PET_INTERACT' }>) => WorldActionResult;
  onPetRemember?: (action: Extract<WorldAction, { type: 'PET_REMEMBER' }>) => WorldActionResult;
  onPetSetHome?: (action: Extract<WorldAction, { type: 'PET_SET_HOME' }>) => WorldActionResult;
  onPetTravelDepart?: (action: Extract<WorldAction, { type: 'PET_TRAVEL_DEPART' }>) => WorldActionResult;
  onPetTravelReturn?: (action: Extract<WorldAction, { type: 'PET_TRAVEL_RETURN' }>) => WorldActionResult;
}

/**
 * Unified world mutation entrypoint.
 *
 * Systems can still own domain rules, but primary state-changing operations
 * should flow through dispatchAction/applyAction so logging/debug/sync can
 * later hook into one place.
 */
export class WorldActionSystem implements WorldActionDispatcher {
  private readonly history: WorldActionResult[] = [];

  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly farmSystem: FarmSystem,
    private readonly treeSystem: TreeSystem,
    private readonly nestStateSystem: NestStateSystem,
    private readonly effects: WorldActionEffects = {},
  ) {}

  dispatchAction(action: WorldAction): WorldActionResult {
    const result = this.applyAction(action);
    this.history.push(result);
    return result;
  }

  applyAction(action: WorldAction): WorldActionResult {
    switch (action.type) {
      case 'MOVE_ENTITY':
        this.worldStateManager.updateEntityPosition(action.entityId, action.x, action.y, action.worldId);
        return { ok: true, action, changedIds: [action.entityId] };
      case 'PLACE_OBJECT':
        return this.effects.onPlaceObject?.(action)
          ?? { ok: false, action, reason: 'PLACE_OBJECT effect adapter missing' };
      case 'PLACE_BUILDING':
        return this.effects.onPlaceBuilding?.(action)
          ?? { ok: false, action, reason: 'PLACE_BUILDING effect adapter missing' };
      case 'MOVE_BUILDING':
        return this.effects.onMoveBuilding?.(action)
          ?? { ok: false, action, reason: 'MOVE_BUILDING effect adapter missing' };
      case 'ROTATE_BUILDING':
        return this.effects.onRotateBuilding?.(action)
          ?? { ok: false, action, reason: 'ROTATE_BUILDING effect adapter missing' };
      case 'REMOVE_BUILDING':
        return this.effects.onRemoveBuilding?.(action)
          ?? { ok: false, action, reason: 'REMOVE_BUILDING effect adapter missing' };
      case 'START_BUILDING_UPGRADE':
        return this.effects.onStartBuildingUpgrade?.(action)
          ?? { ok: false, action, reason: 'START_BUILDING_UPGRADE effect adapter missing' };
      case 'START_BUILDING_REPAIR':
        return this.effects.onStartBuildingRepair?.(action)
          ?? { ok: false, action, reason: 'START_BUILDING_REPAIR effect adapter missing' };
      case 'COMPLETE_BUILDING_JOB':
        return this.effects.onCompleteBuildingJob?.(action)
          ?? { ok: false, action, reason: 'COMPLETE_BUILDING_JOB effect adapter missing' };
      case 'PLACE_HOUSE':
        return this.effects.onPlaceHouse?.(action)
          ?? { ok: false, action, reason: 'PLACE_HOUSE effect adapter missing' };
      case 'PLACE_STORAGE_CHEST':
        return this.effects.onPlaceStorageChest?.(action)
          ?? { ok: false, action, reason: 'PLACE_STORAGE_CHEST effect adapter missing' };
      case 'PLACE_PET':
        return this.effects.onPlacePet?.(action)
          ?? { ok: false, action, reason: 'PLACE_PET effect adapter missing' };
      case 'REMOVE_OBJECT':
        if (action.objectKind === 'nest') {
          this.nestStateSystem.applyRemoveNest(action.objectId);
          return { ok: true, action, changedIds: [action.objectId] };
        }
        if (this.effects.onRemoveObject) {
          return this.effects.onRemoveObject(action);
        }
        this.worldStateManager.unregisterObject(action.objectId);
        return { ok: true, action, changedIds: [action.objectId] };
      case 'PICKUP_DROP':
        return this.effects.onPickupDrop?.(action)
          ?? { ok: false, action, reason: 'PICKUP_DROP effect adapter missing' };
      case 'DROP_ITEM':
        return this.effects.onDropItem?.(action)
          ?? { ok: false, action, reason: 'DROP_ITEM effect adapter missing' };
      case 'PET_INTERACT':
        return this.effects.onPetInteract?.(action)
          ?? { ok: false, action, reason: 'PET_INTERACT effect adapter missing' };
      case 'PET_REMEMBER':
        return this.effects.onPetRemember?.(action)
          ?? { ok: false, action, reason: 'PET_REMEMBER effect adapter missing' };
      case 'PET_SET_HOME':
        return this.effects.onPetSetHome?.(action)
          ?? { ok: false, action, reason: 'PET_SET_HOME effect adapter missing' };
      case 'PET_TRAVEL_DEPART':
        return this.effects.onPetTravelDepart?.(action)
          ?? { ok: false, action, reason: 'PET_TRAVEL_DEPART effect adapter missing' };
      case 'PET_TRAVEL_RETURN':
        return this.effects.onPetTravelReturn?.(action)
          ?? { ok: false, action, reason: 'PET_TRAVEL_RETURN effect adapter missing' };
      case 'TILL_TILE':
        return this.farmSystem.applyTillTile(action.actorId, action.tx, action.ty, action.itemId, action.worldId)
          ? { ok: true, action, changedIds: [`${action.worldId ?? 'world:main'}:${action.tx},${action.ty}`] }
          : { ok: false, action, reason: 'Till tile failed' };
      case 'WATER_TILE':
        return this.farmSystem.applyWaterTile(action.actorId, action.tx, action.ty, action.itemId, action.worldId)
          ? { ok: true, action, changedIds: [`${action.worldId ?? 'world:main'}:${action.tx},${action.ty}`] }
          : { ok: false, action, reason: 'Water tile failed' };
      case 'PLANT_CROP':
        return this.farmSystem.applyPlantCrop(action.actorId, action.tx, action.ty, action.itemId, action.worldId)
          ? { ok: true, action, changedIds: [`${action.worldId ?? 'world:main'}:${action.tx},${action.ty}`] }
          : { ok: false, action, reason: 'Plant crop failed' };
      case 'HARVEST_CROP':
        return this.farmSystem.applyHarvestCrop(action.actorId, action.tx, action.ty, action.cropId, action.worldId)
          ? { ok: true, action, changedIds: [action.cropId] }
          : { ok: false, action, reason: 'Crop harvest failed' };
      case 'CHOP_TREE':
        return this.treeSystem.applyChopTree(action.treeId)
          ? { ok: true, action, changedIds: [action.treeId] }
          : { ok: false, action, reason: 'Tree chop failed' };
      case 'PICK_FRUIT':
        return this.treeSystem.applyHarvestFruit(action.treeId, action.actorId)
          ? { ok: true, action, changedIds: [action.treeId] }
          : { ok: false, action, reason: 'Fruit harvest failed' };
      case 'NEST_OCCUPY':
        return this.nestStateSystem.applyOccupyNest(action.nestId, action.chickenId)
          ? { ok: true, action, changedIds: [action.nestId, action.chickenId] }
          : { ok: false, action, reason: 'Nest occupy failed' };
      case 'NEST_RELEASE':
        return this.nestStateSystem.applyReleaseNest(action.nestId, action.chickenId)
          ? { ok: true, action, changedIds: [action.nestId] }
          : { ok: false, action, reason: 'Nest release failed' };
      case 'NEST_LAY_EGG':
        return this.nestStateSystem.applyLayEgg(action.nestId, action.atTime, action.chickenId)
          ? { ok: true, action, changedIds: [action.nestId] }
          : { ok: false, action, reason: 'Nest lay egg failed' };
      case 'NEST_COLLECT_EGG':
        return this.nestStateSystem.applyCollectEgg(action.nestId, action.actorId)
          ? { ok: true, action, changedIds: [action.nestId] }
          : { ok: false, action, reason: 'Nest egg collect failed' };
      case 'UPDATE_ENTITY_STATE':
        this.worldStateManager.patchEntity(action.entityId, action.patch as never);
        return { ok: true, action, changedIds: [action.entityId] };
      case 'UPDATE_TREE_STATE':
        this.worldStateManager.patchTreeState(action.treeId, action.patch as never);
        return { ok: true, action, changedIds: [action.treeId] };
      case 'UPDATE_NEST_STATE':
        this.worldStateManager.patchNestState(action.nestId, action.patch as never);
        return { ok: true, action, changedIds: [action.nestId] };
      default:
        return { ok: false, action, reason: 'Unhandled world action' };
    }
  }

  getHistory(): readonly WorldActionResult[] {
    return this.history;
  }
}
