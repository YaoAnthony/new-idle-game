/**
 * Builds the NPC action world adapter from scene systems.
 */
import { gameBus } from '../shared/EventBus';
import type { WorldContext } from '../actions/actor/ActionExecutor';
import type { ActorActionService } from '../actions/actor/ActorActionService';
import type { FarmActionKind, FarmActionTarget } from '../features/farming/FarmSystem';

type ActorActionRuntime = Pick<
  ActorActionService,
  'findFarmTarget' | 'performFarmAction' | 'executeKnowledgeSkill'
>;

export function createActorWorldContext(
  scene: any,
  actorActions: ActorActionRuntime | null | undefined = scene.actorActionService,
): WorldContext {
  return {
    findNearestTree: (x, y) => scene.treeSystem.findNearestTree(x, y),
    chopTreeById: (id) => scene.treeSystem.chopTreeById(id),
    findNearestFruitTree: (x, y) => scene.treeSystem.findNearestFruitTree(x, y),
    pickFruitById: (id, npcName) => scene.treeSystem.pickFruitById(id, npcName),
    rememberFoodSourcesForNpc: (npcName, foodSources, absoluteGameMinutes, source) =>
      scene.npcSystem?.rememberFoodSourcesForNpc?.(npcName, foodSources, absoluteGameMinutes, source ?? 'mcp') ?? false,
    findWorldItem: (itemId, worldId) => scene.dropSystem?.findViewByItem?.(itemId, worldId) ?? null,
    dropWorldItem: (x, y, itemId, npcName) => dropWorldItemForNpc(scene, x, y, itemId, npcName),
    claimWorldItem: (itemId, npcName, target) => claimWorldItemForNpc(scene, itemId, npcName, target),
    consumeNpcFood: (npcName, hungerMissing, preferredItemId) =>
      scene.npcSystem?.consumeFood?.(npcName, hungerMissing, preferredItemId) ?? null,
    getWorldIdAt: (x, y) => getSceneWorldId(scene, x, y),
    getNpcWorldId: (npcName) => {
      const resolved = scene.navigationService?.getNpcWorldId?.(npcName);
      if (resolved) return resolved;
      const npc = scene.npcSystem?.findByName?.(npcName) ?? null;
      return npc?.sprite ? getSceneWorldId(scene, npc.sprite.x, npc.sprite.y) : getSceneWorldId(scene, 0, 0);
    },
    navigateNpcToWorldPosition: (npcName, target, onArrive) => {
      const routed = scene.navigationService?.navigateNpcToWorldPosition?.(npcName, target, onArrive);
      if (routed) return true;
      const npc = scene.npcSystem?.findByName?.(npcName) ?? null;
      if (!npc?.navigateTo) return false;
      const currentWorldId = scene.navigationService?.getNpcWorldId?.(npcName)
        ?? (npc.sprite ? getSceneWorldId(scene, npc.sprite.x, npc.sprite.y) : getSceneWorldId(scene, 0, 0));
      if (target.worldId && target.worldId !== currentWorldId) return false;
      npc.navigateTo(target.x, target.y, onArrive);
      return true;
    },
    findFarmTarget: (action, x, y, maxRadiusCells, actorId, worldId) =>
      typeof actorActions?.findFarmTarget === 'function'
        ? actorActions.findFarmTarget(
          action,
          x,
          y,
          maxRadiusCells,
          actorId,
          worldId ?? (actorId ? scene.navigationService?.getNpcWorldId?.(actorId) : undefined),
        )
        : null,
    performFarmAction: (actorId, action, target, itemId) =>
      performFarmActionForActor(scene, actorActions, actorId, action, target, itemId),
    executeKnowledgeSkill: (npcName, skillId, origin, navigate, absoluteGameMinutes) =>
      executeKnowledgeSkillForNpc(scene, actorActions, npcName, skillId, origin, navigate, absoluteGameMinutes),
    canUseNpcKnowledgeSkill: (npcName, skillId) =>
      scene.npcSystem?.canUseKnowledgeSkill?.(npcName, skillId) ?? false,
    findNpcByName: (name) => scene.npcSystem?.findByName?.(name) ?? null,
    findConversationSpotForNpc: (sourceName, targetName) =>
      scene.npcSystem?.findConversationSpot?.(sourceName, targetName) ?? null,
    findHouseEntryTarget: (houseId, npcName) =>
      scene.buildingSystem?.findHouseEntryTarget(houseId, npcName) ?? null,
    enterHouseForNpc: (npcName, houseId) =>
      scene.buildingSystem?.enterHouseForNpc(npcName, houseId) ?? false,
    rememberHomeHouseForNpc: (npcName, houseId, absoluteGameMinutes) =>
      scene.buildingSystem?.rememberHomeHouseForNpc(npcName, houseId, absoluteGameMinutes) ?? false,
    learnNpcSkill: (npcName, skillId, absoluteGameMinutes, source) =>
      scene.npcSystem?.learnNpcSkill?.(npcName, skillId, source ?? 'mcp', absoluteGameMinutes) ?? false,
    assignFarmPlots: (npcName, skillId, plots, absoluteGameMinutes, source, desiredCropId) => {
      let ok = true;
      for (const plot of plots) {
        const result = scene.npcSystem?.claimFarmPlotForNpc?.({
          npcName,
          tx: plot.tx,
          ty: plot.ty,
          worldId: plot.worldId ?? getSceneWorldId(scene, plot.tx * 32 + 16, plot.ty * 32 + 16),
          absoluteGameMinutes,
          source: source ?? 'mcp',
          desiredCropId,
          skillId,
        });
        ok = Boolean(result?.ok) && ok;
      }
      return ok;
    },
  };
}

function performFarmActionForActor(
  scene: any,
  actorActions: ActorActionRuntime | null | undefined,
  actorId: string,
  action: FarmActionKind,
  target: Pick<FarmActionTarget, 'tx' | 'ty' | 'cropId' | 'worldId'>,
  itemId?: string,
): boolean {
  if (typeof actorActions?.performFarmAction !== 'function') return false;

  const result = actorActions.performFarmAction(actorId, action, target, itemId);
  if (actorId !== 'player') {
    const targetX = target.tx * 32 + 16;
    const targetY = target.ty * 32 + 16;
    scene.npcSystem?.recordActionResult(actorId, scene.dayCycle?.absoluteGameMinutes ?? 0, {
      status: result.ok ? 'success' : 'failed',
      actionType: `farm_${action}`,
      reason: result.reason,
      targetX,
      targetY,
      worldId: target.worldId ?? getSceneWorldId(scene, targetX, targetY),
    });
  }
  return result.ok;
}

function executeKnowledgeSkillForNpc(
  scene: any,
  actorActions: ActorActionRuntime | null | undefined,
  npcName: string,
  skillId: string,
  origin: { x: number; y: number },
  navigate: (x: number, y: number, worldId?: string, onArrive?: () => void) => void,
  absoluteGameMinutes: number,
): boolean {
  if (scene.npcSystem?.canUseKnowledgeSkill?.(npcName, skillId) === false) {
    scene.npcSystem?.recordActionResult(npcName, absoluteGameMinutes, {
      status: 'failed',
      actionType: `skill_${skillId}`,
      reason: 'missing_parent_skill',
      x: origin.x,
      y: origin.y,
      worldId: getSceneWorldId(scene, origin.x, origin.y),
    });
    return false;
  }

  if (typeof actorActions?.executeKnowledgeSkill !== 'function') {
    scene.npcSystem?.recordActionResult(npcName, absoluteGameMinutes, {
      status: 'failed',
      actionType: `skill_${skillId}`,
      reason: 'actor_action_service_unavailable',
      x: origin.x,
      y: origin.y,
      worldId: getSceneWorldId(scene, origin.x, origin.y),
    });
    return false;
  }

  const ok = actorActions.executeKnowledgeSkill({
    actorId: npcName,
    skillId,
    originX: origin.x,
    originY: origin.y,
    originWorldId: scene.navigationService?.getNpcWorldId?.(npcName)
      ?? scene.actorWorldPresence?.getActorWorldId?.(npcName),
    absoluteGameMinutes,
    navigate,
  });
  scene.npcSystem?.recordActionResult(npcName, absoluteGameMinutes, {
    status: ok ? 'success' : 'failed',
    actionType: `skill_${skillId}`,
    reason: ok ? undefined : 'skill_target_not_found',
    x: origin.x,
    y: origin.y,
    worldId: getSceneWorldId(scene, origin.x, origin.y),
  });
  return ok;
}

function claimWorldItemForNpc(
  scene: any,
  itemId: string,
  npcName: string,
  target?: { x: number; y: number; worldId?: string },
): void {
  const drop = scene.dropSystem?.findNearestDropByItem?.(itemId, npcName, target);
  if (!drop) {
    console.warn(`[GameScene] claimWorldItem: item "${itemId}" not found in drops!`);
    return;
  }
  const result = scene.dispatchWorldAction({
    type: 'PICKUP_DROP',
    actorId: npcName,
    dropId: drop.id,
    itemId,
  });
  if (!result.ok) return;
  const quantity = drop.quantity ?? drop.stack?.quantity ?? 1;
  gameBus.emit('npc:pickup_world_item', { npcName, itemId, qty: quantity });
}

function dropWorldItemForNpc(scene: any, x: number, y: number, itemId: string, npcName: string): void {
  const result = scene.dispatchWorldAction({
    type: 'DROP_ITEM',
    actorId: npcName,
    itemId,
    x,
    y,
    worldId: scene.navigationService?.getNpcWorldId?.(npcName) ?? getSceneWorldId(scene, x, y),
  });
  if (!result.ok) return;
  gameBus.emit('npc:drop_item', {
    npcName,
    itemId,
    qty: 1,
    worldId: scene.navigationService?.getNpcWorldId?.(npcName) ?? getSceneWorldId(scene, x, y),
  });
}

function getSceneWorldId(scene: any, x: number, y: number): string {
  return scene.navigationService?.getWorldIdAt?.(x, y)
    ?? scene.currentMapDefinition?.ref?.worldId
    ?? 'world:main';
}
