/**
 * Helpers for placing/removing world objects that still need scene-level access.
 */
import { ITEM_DEF_MAP } from '../entities/DropItem';
import { gameBus } from '../shared/EventBus';
import type { GameWorldState } from '../types';
import type { WorldState } from '../shared/worldStateTypes';

export function removeWorldItemsByIds(scene: any, ownedItemIds: string[]) : void {
    scene.dropSystem?.removeByItemIds?.(ownedItemIds);

}

export function placeEntityAt(scene: any, itemId: string, fx: number, fy: number, worldIdInput?: string) : boolean {
    const def = ITEM_DEF_MAP.get(itemId);
    if (!def || def.itemType !== 'placeable') return false;
    const worldId = resolvePlacementWorldId(scene, fx, fy, worldIdInput);

    if (def.placeEntity && isPlacementBlocked(scene, fx, fy, worldId)) {
      gameBus.emit('ui:show_message', { text: 'This spot is already occupied.' });
      return false;
    }

    switch (def.placeEntity) {
      case 'nest': {
        if (!scene.creatureSystem) return false;
        scene.creatureSystem.createNest(fx, fy, undefined, worldId);
        break;
      }
      case 'pet': {
        const pet = scene.petSystem?.placePetFromItem?.(itemId, fx, fy, { worldId }) ?? null;
        if (!pet) return false;
        break;
      }
      default:
        gameBus.emit('ui:show_message', { text: `${def.label} cannot be placed yet` });
        return false;
    }

    gameBus.emit('player:consume_item', { itemId, qty: 1, action: 'place' });
    gameBus.emit('world:object_placed', {
      itemId,
      objectKind: def.placeEntity,
      x: fx,
      y: fy,
      worldId,
      actorId: 'player',
    });
    return true;

}

export function _loadWorldState(scene: any, ws: GameWorldState | Partial<WorldState> | null | undefined) : void {
    scene.savingSystem.loadWorldState(ws);
    scene.gameLightingSystem?.refreshNestLights();

}

export function spawnInitialBushes(scene: any) : void {
    void scene;

}

export function spawnDecorations(scene: any) : void {
    void scene;

}

function resolvePlacementWorldId(scene: any, x: number, y: number, worldId?: string): string {
    return worldId
      ?? scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? scene.getWorldIdAt?.(x, y)
      ?? scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
}

function isPlacementBlocked(scene: any, x: number, y: number, worldId: string): boolean {
    const minDistance = 28;
    return Boolean(scene.buildingSystem?.hasBlockingBuildingNear?.(x, y, minDistance, worldId))
      || (scene.creatureSystem?.nests ?? []).some((nest: any) =>
        !nest.gone
        && ((scene.worldStateManager?.getNestState?.(nest.id)?.worldId ?? worldId) === worldId)
        && Math.hypot(nest.x - x, nest.y - y) < minDistance,
      )
      || Boolean(scene.petSystem?.hasBlockingPetNear?.(x, y, minDistance, worldId));
}
