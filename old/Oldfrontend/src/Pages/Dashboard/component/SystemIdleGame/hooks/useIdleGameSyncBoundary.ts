import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { FarmTile } from '../../../../../Redux/Features/gameSlice';
import { upsertFarmTile } from '../../../../../Redux/Features/gameSlice';
import { setProfile } from '../../../../../Redux/Features/profileSlice';
import type { RootState } from '../../../../../Redux/store';
import { gameBus } from '../shared/EventBus';
import type { GameScene } from '../GameScene';
import type { WorldAction, WorldActionResult } from '../systems/WorldActionSystem';
import type { GameChest } from '../../../../../Types/Profile';
import { getWorldActionSyncPolicy, type WorldSyncSource } from '../sync/syncPolicy';
import { parseProfileGameEvent } from '../sync/profileGameEventSchema';

interface UseIdleGameSyncBoundaryProps {
  sceneRef: RefObject<GameScene | null>;
  multiplayActiveRef: RefObject<boolean>;
  setAvailableChests: Dispatch<SetStateAction<GameChest[]>>;
  setNpcDialog: Dispatch<SetStateAction<{ visible: boolean; text: string; npcName: string }>>;
}

function isDrawableScene(scene: GameScene | null | undefined): scene is GameScene {
  const candidate = scene as any;
  const sys = candidate?.sys;
  return Boolean(
    candidate
    && candidate.add
    && candidate.time
    && candidate.cameras?.main
    && sys?.displayList
    && sys?.updateList
    && (typeof sys.isActive !== 'function' || sys.isActive()),
  );
}

export function applyServerChestSpawn(
  scene: GameScene | null,
  setAvailableChests: Dispatch<SetStateAction<GameChest[]>>,
  chest: GameChest,
): void {
  if (chest.opened) return;
  if (!isDrawableScene(scene)) return;
  let placedChest: GameChest | null = null;
  try {
    placedChest = scene.chestSystem?.addChest(chest) ?? null;
    if (!placedChest) throw new Error('chest_not_added');
  } catch (error) {
    console.warn('[Chest] applyServerChestSpawn addChest failed', { chest, error });
    return;
  }
  if (!placedChest) return;
  setAvailableChests((prev) => (
    prev.some((entry) => entry.id === placedChest.id) ? prev : [...prev, placedChest]
  ));
}

export function applyServerFarmTileUpdate(
  scene: GameScene | null,
  dispatch: Dispatch<any>,
  tile: FarmTile & { tx: number; ty: number; state: string },
): void {
  dispatch(upsertFarmTile(tile as FarmTile));
  const cropData = tile.cropId ? {
    cropId: tile.cropId,
    plantRow: (tile as any).plantRow ?? 0,
    numStages: (tile as any).numStages ?? 4,
    plantedAtGameMinute: (tile as any).plantedAtGameMinute,
    readyAtGameMinute: (tile as any).readyAtGameMinute,
  } : null;
  scene?.farmSystem?.updateTileState?.(tile.tx, tile.ty, tile.state, cropData, tile.worldId);
}

export function useIdleGameSyncBoundary({
  sceneRef,
  multiplayActiveRef,
  setAvailableChests,
  setNpcDialog,
}: UseIdleGameSyncBoundaryProps) {
  const dispatch = useDispatch();
  const currentProfile = useSelector((state: RootState) => state.profile.profile);

  useEffect(() => {
    const syncActionToRoom = (
      action: WorldAction,
      result: WorldActionResult,
      source: WorldSyncSource,
    ) => {
      if (!result.ok || source !== 'local' || !multiplayActiveRef.current) return;
      const policy = getWorldActionSyncPolicy(action);
      if (policy.category !== 'room_broadcast') return;

      switch (action.type) {
        case 'DROP_ITEM':
          gameBus.emit('mp:relay', {
            type: 'item_spawn',
            payload: {
              dropId: result.changedIds?.[0],
              itemId: action.itemId,
              quantity: action.quantity,
              x: action.x,
              y: action.y,
              worldId: action.worldId ?? sceneRef.current?.mapRuntimeManager?.getActiveWorldId?.(),
            },
          });
          return;
        case 'CHOP_TREE':
          gameBus.emit('mp:relay', {
            type: 'tree_chop',
            payload: { treeId: action.treeId },
          });
          return;
        case 'PLACE_PET':
          gameBus.emit('mp:relay', {
            type: 'pet_place',
            payload: {
              petEntityId: result.changedIds?.[0] ?? action.petEntityId,
              petDefinitionId: action.petDefinitionId,
              itemId: action.itemId,
              ownerNpcId: action.ownerNpcId,
              displayName: action.displayName,
              memories: action.memories,
              worldId: action.worldId ?? sceneRef.current?.mapRuntimeManager?.getActiveWorldId?.(),
              home: action.home,
              behavior: action.behavior,
              canSpeak: action.canSpeak,
              petColor: action.petColor,
              petLifeStage: action.petLifeStage,
              birthGameMinute: action.birthGameMinute,
              life: action.life,
              personality: action.personality,
              x: action.x,
              y: action.y,
            },
          });
          return;
        case 'PET_INTERACT':
          gameBus.emit('mp:relay', {
            type: 'pet_interact',
            payload: {
              petEntityId: action.petEntityId,
              actorId: action.actorId,
              absoluteGameMinutes: action.absoluteGameMinutes,
            },
          });
          return;
        case 'PET_REMEMBER':
          gameBus.emit('mp:relay', {
            type: 'pet_remember',
            payload: {
              petEntityId: action.petEntityId,
              actorId: action.actorId,
              memory: action.memory,
            },
          });
          return;
        case 'PET_SET_HOME':
          gameBus.emit('mp:relay', {
            type: 'pet_set_home',
            payload: {
              petEntityId: action.petEntityId,
              actorId: action.actorId,
              home: action.home,
            },
          });
          return;
        default:
          return;
      }
    };

    const unsubs = [
      gameBus.on('world:domain_event', (event) => {
        if (event.type !== 'world.action_applied') return;
        syncActionToRoom(event.action, event.result, event.source);
      }),
      gameBus.on('world:item_picked_up', ({ dropId, itemId, quantity, x, y, worldId, source }) => {
        if ((source ?? 'local') !== 'local' || !multiplayActiveRef.current) return;
        gameBus.emit('mp:relay', { type: 'item_claim', payload: { dropId, itemId, quantity, x, y, worldId } });
      }),
      gameBus.on('world:position_broadcast_requested', ({ x, y, worldId, facing, velX, velY, flashlightOn }) => {
        if (!multiplayActiveRef.current) return;
        gameBus.emit('mp:relay', {
          type: 'player_move',
          payload: { x, y, worldId, facing, velX, velY, flashlightOn },
        });
      }),
      gameBus.on('entity:action_sound', (event) => {
        if (!multiplayActiveRef.current) return;
        if (event.source && event.source !== 'local') return;
        gameBus.emit('mp:relay', {
          type: 'entity_sound',
          payload: { ...event, source: 'room' },
        });
      }),
      gameBus.on('world:sleep_state_changed', ({ sleeping }) => {
        if (!multiplayActiveRef.current) return;
        gameBus.emit('mp:relay', {
          type: 'player_sleep',
          payload: { sleeping },
        });
      }),
      gameBus.on('mp:game_event', (event) => {
        if (event.type === 'game_save_synced') {
          const incomingGenerationId = (event.payload.gameSave as any)?.saveMeta?.generationId;
          const currentGenerationId = (sceneRef.current?.initialGameSave as any)?.saveMeta?.generationId;
          if (incomingGenerationId && currentGenerationId && incomingGenerationId !== currentGenerationId) {
            window.location.reload();
            return;
          }
          sceneRef.current?.syncEventSaveData?.(event.payload.gameSave as any);
          if (currentProfile) {
            dispatch(setProfile({ ...currentProfile, gameSave: event.payload.gameSave as any }));
          }
          return;
        }
        const activeUserId = sceneRef.current?.getActiveUserId?.();
        if (activeUserId && event.fromUserId && String(event.fromUserId) === String(activeUserId)) return;
        sceneRef.current?.multiplayerWorldSystem?.applyRemoteEvent(event.type, event.payload);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [currentProfile, dispatch, multiplayActiveRef, sceneRef]);

  const handleSseMessage = useCallback((event: MessageEvent) => {
    const serverEvent = parseProfileGameEvent(event.data);
    if (!serverEvent) return;

    switch (serverEvent.type) {
      case 'game_chest_spawned':
        applyServerChestSpawn(sceneRef.current, setAvailableChests, serverEvent.chest);
        return;
      case 'farm_tile_updated':
        applyServerFarmTileUpdate(sceneRef.current, dispatch, serverEvent.tile);
        return;
      case 'npc_command':
        if (serverEvent.announcement) {
          setNpcDialog({
            visible: true,
            text: serverEvent.announcement,
            npcName: serverEvent.npcName,
          });
          setTimeout(() => {
            setNpcDialog((current) => (
              current.text === serverEvent.announcement
                ? { ...current, visible: false }
                : current
            ));
          }, 4000);
        }
        sceneRef.current?.npcSystem?.executeActions?.(serverEvent.npcName, serverEvent.actions);
        return;
      case 'pet_travel_photo_returned': {
        const returnResult = sceneRef.current?.dispatchWorldAction?.({
          type: 'PET_TRAVEL_RETURN',
          actorId: 'server',
          petEntityId: serverEvent.petEntityId,
          entryId: serverEvent.entryId,
          absoluteGameMinutes: serverEvent.entry.returnedAtGameMinute,
        } as any);
        if (!returnResult?.ok) {
          sceneRef.current?.syncEventSaveData?.(serverEvent.gameSave as any);
        }
        if (currentProfile) {
          dispatch(setProfile({ ...currentProfile, gameSave: serverEvent.gameSave as any }));
        }
        gameBus.emit('pet:travel_changed', {
          petEntityId: serverEvent.petEntityId,
          entry: serverEvent.entry,
          gameSave: serverEvent.gameSave,
        });
        gameBus.emit('ui:show_message', { text: `${serverEvent.entry.displayName || '小动物'}回来了。` });
        return;
      }
    }
  }, [currentProfile, dispatch, sceneRef, setAvailableChests, setNpcDialog]);

  return {
    handleSseMessage,
    applyServerFarmTileUpdate: (tile: FarmTile & { tx: number; ty: number; state: string }) =>
      applyServerFarmTileUpdate(sceneRef.current, dispatch, tile),
    applyServerChestSpawn: (chest: GameChest) =>
      applyServerChestSpawn(sceneRef.current, setAvailableChests, chest),
  };
}
