/**
 * Runs per-frame simulation, input, entity updates, and rendering sync.
 */
import { gameBus } from '../shared/EventBus';
import { GAME_MINUTES_PER_REAL_SECOND } from '../constants';
import { isAnyPhaserKeyJustDown } from '../features/input/InputBindings';

export function updateGameScene(scene: any, time: number, delta: number): void {
    const dt = delta / 1000;
    const minutesBeforeSimulation = scene.dayCycle?.absoluteGameMinutes;

    if (scene.idleRuntime) {
      scene.idleRuntime.updateSimulation({
        dtSeconds: dt,
        absoluteGameMinutes: scene.dayCycle?.absoluteGameMinutes ?? 0,
        timeMs: time,
        deltaMs: delta,
      });
    } else {
      // Fallback for tests or partial scene bootstraps.
      scene.dayCycle?.update(dt);
      scene.syncWorldStateMeta?.();
      scene.farmSystem?.update(scene.dayCycle?.absoluteGameMinutes ?? 0);
    }
    const minutesAfterSimulation = scene.dayCycle?.absoluteGameMinutes;
    const gameMinutesDelta = Number.isFinite(minutesBeforeSimulation) && Number.isFinite(minutesAfterSimulation)
      ? Math.max(0, Number(minutesAfterSimulation) - Number(minutesBeforeSimulation))
      : dt * GAME_MINUTES_PER_REAL_SECOND;
    scene.storylineRuntimeSystem?.update?.(scene.dayCycle?.absoluteGameMinutes ?? 0);

    // Emit time string to React HUD (max once per real second)
    if (time - scene._lastTimeEmit > 1000) {
      scene._lastTimeEmit = time;
      gameBus.emit('time:update', {
        absoluteGameMinutes:    scene.dayCycle.absoluteGameMinutes,
        timeStr:     scene.dayCycle.getTimeStr(),
        dateStr:     scene.dayCycle.getDateStr(),
        dateTimeStr: scene.dayCycle.getDateTimeStr(),
      });
    }

    if (isAnyPhaserKeyJustDown(scene._interactKeys ?? [])) {
      const nearestNpc = scene.npcSystem?.getNearestNameFromPlayer?.(220) ?? null;
      const interactionHandled = !scene._chatOpen ? Boolean(scene.triggerFInteract()) : false;
      const flashlightHandled = !scene._chatOpen && !interactionHandled && !nearestNpc
        ? Boolean(scene.playerSystem?.tryToggleFlashlight?.())
        : false;
      const player = scene.playerSystem?.getPlayer?.() ?? scene.player ?? null;
      console.log('[F-TRACE] interact key down', {
        chatOpen: Boolean(scene._chatOpen),
        nearestNpc,
        interactionHandled,
        flashlightHandled,
        player: player?.sprite ? {
          x: Math.round(player.sprite.x),
          y: Math.round(player.sprite.y),
          facing: player.facing,
          heldItemId: player.heldItemId,
          currentTool: player.currentTool,
        } : null,
      });
    }

    if (isAnyPhaserKeyJustDown(scene._dropKeys ?? []) && !scene._chatOpen) {
      scene._triggerQDrop();
    }

    scene.multiplayerWorldSystem?.update(time);
    scene.projectileSystem?.update(time, delta);

    // Player
    scene.playerSystem?.update(dt, gameMinutesDelta, scene._chatOpen);
    scene.furniturePlacementPreviewSystem?.update({ inputPaused: scene._chatOpen });
    scene.toolTargetPreviewSystem?.update({ inputPaused: scene._chatOpen });
    scene.mapTransitionSystem?.update?.(time);
    scene.actorWorldPresence?.syncVisibleNpcPositions?.();

    scene.syncDynamicEntityStates();
    scene.entitySystem?.updateAll?.({
      timeMs: time,
      deltaMs: delta,
      dtSeconds: dt,
      absoluteGameMinutes: scene.dayCycle?.absoluteGameMinutes ?? 0,
    });
    scene.npcSystem?.updateAI(dt, scene.dayCycle.absoluteGameMinutes, time, delta);

    scene.npcSystem?.updateActors(dt, scene.dayCycle.absoluteGameMinutes);
    scene.slimeSystem?.update?.(time, delta);
    scene.petSystem?.update?.(dt, scene.dayCycle.absoluteGameMinutes, time, delta);
    const playerPosition = scene.playerSystem?.getPosition?.() ?? null;
    if (playerPosition) scene.gameAudioSystem?.updateListenerPosition(playerPosition.x, playerPosition.y);
    scene.gameAudioSystem?.update(time);
    scene.pathDebugSystem?.update(scene.npcSystem?.all?.() ?? []);
    scene.collisionBlockers?.update?.();
    scene.templeMaskDebugSystem?.update?.();
    scene.treeSystem?.update(scene.dayCycle.absoluteGameMinutes);
    scene.creatureSystem?.update(
      scene.dayCycle.absoluteGameMinutes,
      delta,
      playerPosition,
    );
    scene.golemSystem?.update?.(time, delta);
    scene.buildingSystem?.update(playerPosition);
    scene.dropSystem?.update(time, delta, playerPosition);
    scene.gameLightingSystem?.update(
      time,
      scene.dayCycle.getCurrentMinute(),
    );
    scene.weather?.update?.(time, delta);
  
}
