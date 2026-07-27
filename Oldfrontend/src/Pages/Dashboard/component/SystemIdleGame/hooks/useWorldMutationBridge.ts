import { useEffect } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  useCompleteBuildingJobsMutation,
  usePlaceBuildingMutation,
  usePlaceStorageChestMutation,
  useRemoveBuildingMutation,
  useMoveBuildingMutation,
  useRotateBuildingMutation,
  useSpawnGolemMutation,
  useAwakenGolemMutation,
  useResolveBuildingAssemblyMutation,
  useConsolidateNpcSleepKnowledgeMutation,
  useStartBuildingRepairMutation,
  useStartBuildingUpgradeMutation,
  useAssignBuildingWorkersMutation,
  useStartBuildingConstructionMutation,
  useAddMaskRadiusMutation,
  useDropMaskRadiusMutation,
  useAddMaskProgressMutation,
  useSendPetTravelPhotoMutation,
  useClaimPetTravelPhotoMutation,
  useUpdateProfileAttributeMutation,
} from '../api';
import type { GameScene } from '../GameScene';
import { playBuildingAssemblyEffects } from '../features/building/assembly/BuildingAssemblyEffects';
import { gameBus, type GameEventMap } from '../shared/EventBus';
import { ATTRIBUTE_LABEL_BY_KEY } from '../../../../../shared/core/protagonistAttributeProgression';
import type { DialogState } from './useNpcChat';

type StoragePlacePayload = GameEventMap['game:storage_chest_place_requested'];
type BuildingPlacePayload = GameEventMap['game:building_place_requested'];
type BuildingMovePayload = GameEventMap['game:building_move_requested'];
type BuildingRotatePayload = GameEventMap['game:building_rotate_requested'];
type BuildingUpgradePayload = GameEventMap['game:building_upgrade_requested'];
type BuildingRepairPayload = GameEventMap['game:building_repair_requested'];
type BuildingJobsCompletePayload = GameEventMap['game:building_jobs_complete_requested'];
type BuildingWorkersAssignPayload = GameEventMap['game:building_workers_assign_requested'];
type BuildingWorkerArrivedPayload = GameEventMap['game:building_worker_arrived'];
type BuildingRemovePayload = GameEventMap['game:building_remove_requested'];
type BuildingAssemblyResolvePayload = GameEventMap['game:building_assembly_resolve_requested'];
type GolemAwakenPayload = GameEventMap['game:golem_awaken_requested'];
type GolemSpawnPayload = GameEventMap['game:golem_spawn_requested'];
type MaskAddPayload = GameEventMap['game:mask_add_requested'];
type MaskDropPayload = GameEventMap['game:mask_drop_requested'];
type MaskProgressAddPayload = GameEventMap['game:mask_progress_add_requested'];
type ProfileAttributeExpDeltaPayload = GameEventMap['profile:attribute_exp_delta_requested'];
type PetTravelSendPayload = GameEventMap['pet:travel_send_requested'];
type PetPhotoReturnPayload = GameEventMap['pet:photo_return_requested'];

interface UseWorldMutationBridgeOptions {
  sceneRef: RefObject<GameScene | null>;
  roomIdRef: RefObject<string | null | undefined>;
  setDialog: Dispatch<SetStateAction<DialogState>>;
  setStorageChestOpenId: Dispatch<SetStateAction<string | null>>;
}

function apiMessage(error: unknown, fallback: string): string {
  return (error as { data?: { message?: string } } | null)?.data?.message || fallback;
}

export function useWorldMutationBridge({
  sceneRef,
  roomIdRef,
  setDialog,
  setStorageChestOpenId,
}: UseWorldMutationBridgeOptions): void {
  const [placeStorageChest] = usePlaceStorageChestMutation();
  const [placeBuilding] = usePlaceBuildingMutation();
  const [moveBuilding] = useMoveBuildingMutation();
  const [rotateBuilding] = useRotateBuildingMutation();
  const [startBuildingUpgrade] = useStartBuildingUpgradeMutation();
  const [startBuildingRepair] = useStartBuildingRepairMutation();
  const [removeBuilding] = useRemoveBuildingMutation();
  const [completeBuildingJobs] = useCompleteBuildingJobsMutation();
  const [assignBuildingWorkers] = useAssignBuildingWorkersMutation();
  const [startBuildingConstruction] = useStartBuildingConstructionMutation();
  const [spawnGolem] = useSpawnGolemMutation();
  const [awakenGolem] = useAwakenGolemMutation();
  const [resolveBuildingAssembly] = useResolveBuildingAssemblyMutation();
  const [consolidateNpcSleepKnowledge] = useConsolidateNpcSleepKnowledgeMutation();
  const [addMaskRadius] = useAddMaskRadiusMutation();
  const [dropMaskRadius] = useDropMaskRadiusMutation();
  const [addMaskProgress] = useAddMaskProgressMutation();
  const [sendPetTravelPhoto] = useSendPetTravelPhotoMutation();
  const [claimPetTravelPhoto] = useClaimPetTravelPhotoMutation();
  const [updateProfileAttribute] = useUpdateProfileAttributeMutation();

  useEffect(() => {
    const withRoomId = <T extends { roomId?: string | null }>(payload: T): T & { roomId?: string } => ({
      ...payload,
      roomId: payload.roomId ?? roomIdRef.current ?? undefined,
    });

    const syncBuildingMutationResult = (result: { gameSave?: unknown; effects?: unknown[] }) => {
      sceneRef.current?.syncEventSaveData(result.gameSave as any);
      playBuildingAssemblyEffects(sceneRef.current, result.effects as any);
    };

    const dispatchPetTravelDepart = (payload: PetTravelSendPayload, entryId: string) => (
      sceneRef.current?.dispatchWorldAction?.({
        type: 'PET_TRAVEL_DEPART',
        actorId: 'player',
        petEntityId: payload.petEntityId,
        entryId,
        absoluteGameMinutes: payload.absoluteGameMinutes,
      } as any) ?? null
    );

    const placeStorage = async (payload: StoragePlacePayload) => {
      try {
        const result = await placeStorageChest(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Storage chest placement failed.'), npcName: 'System' });
      }
    };

    const placeGenericBuilding = async (payload: BuildingPlacePayload) => {
      try {
        const result = await placeBuilding(withRoomId(payload)).unwrap();
        syncBuildingMutationResult(result);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Building placement failed.'), npcName: 'System' });
      }
    };

    const completeBuildingJobsForTime = async (payload: BuildingJobsCompletePayload) => {
      try {
        const result = await completeBuildingJobs(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
      } catch (error) {
        console.warn('[Building] complete jobs failed', error);
      }
    };

    const assignIdleBuildingWorkers = async (payload: BuildingWorkersAssignPayload) => {
      try {
        const result = await assignBuildingWorkers(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
      } catch (error) {
        console.warn('[Building] assign workers failed', error);
      }
    };

    const startConstructionAtWorkerArrival = async (payload: BuildingWorkerArrivedPayload) => {
      try {
        const result = await startBuildingConstruction(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
      } catch (error) {
        console.warn('[Building] worker arrival failed', error);
      }
    };

    const moveGenericBuilding = async (payload: BuildingMovePayload) => {
      try {
        const result = await moveBuilding(withRoomId(payload)).unwrap();
        syncBuildingMutationResult(result);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Building move failed.'), npcName: 'System' });
      }
    };

    const rotateGenericBuilding = async (payload: BuildingRotatePayload) => {
      try {
        const result = await rotateBuilding(withRoomId(payload)).unwrap();
        syncBuildingMutationResult(result);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Building rotation failed.'), npcName: 'System' });
      }
    };

    const upgradeGenericBuilding = async (payload: BuildingUpgradePayload) => {
      try {
        const result = await startBuildingUpgrade(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Building upgrade failed.'), npcName: 'System' });
      }
    };

    const repairGenericBuilding = async (payload: BuildingRepairPayload) => {
      try {
        const result = await startBuildingRepair(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Building repair failed.'), npcName: 'System' });
      }
    };

    const removeGenericBuilding = async (payload: BuildingRemovePayload) => {
      try {
        const result = await removeBuilding(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Building removal failed.'), npcName: 'System' });
      }
    };

    const awakenStoneGolem = async (payload: GolemAwakenPayload) => {
      try {
        const result = await awakenGolem(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Stone golem generation failed.'), npcName: 'System' });
      }
    };

    const spawnStoneGolem = async (payload: GolemSpawnPayload) => {
      try {
        const result = await spawnGolem(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Stone golem spawn failed.'), npcName: 'System' });
      }
    };

    const addTempleMaskRadius = async (payload: MaskAddPayload) => {
      try {
        const result = await addMaskRadius(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
        gameBus.emit('game:mask_changed', { radius: result.mask.radius, mask: result.mask });
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Mask radius increase failed.'), npcName: 'System' });
      }
    };

    const dropTempleMaskRadius = async (payload: MaskDropPayload) => {
      try {
        const result = await dropMaskRadius(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
        gameBus.emit('game:mask_changed', { radius: result.mask.radius, mask: result.mask });
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Mask radius decrease failed.'), npcName: 'System' });
      }
    };

    const addTempleMaskProgress = async (payload: MaskProgressAddPayload) => {
      try {
        const result = await addMaskProgress(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
        gameBus.emit('game:mask_progress_rewarded', {
          previousMaskProgress: result.previousMaskProgress ?? { level: 0, progress: 0, required: 1 },
          maskProgress: result.maskProgress,
          previousMask: result.previousMask,
          mask: result.mask,
          previousConfiguration: result.previousMaskConfiguration,
          configuration: result.maskConfiguration,
          levelUps: result.levelUps,
        });
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Mask progress increase failed.'), npcName: 'System' });
      }
    };

    const updateProfileAttributeExp = async (payload: ProfileAttributeExpDeltaPayload) => {
      try {
        const result = await updateProfileAttribute({
          attributeKey: payload.attributeKey,
          expDelta: payload.expDelta,
        }).unwrap();
        const next = result.attributes[payload.attributeKey];
        const label = ATTRIBUTE_LABEL_BY_KEY[payload.attributeKey] ?? payload.attributeKey;
        const sign = payload.expDelta >= 0 ? '+' : '';
        gameBus.emit('ui:show_message', {
          text: `${label} EXP ${sign}${payload.expDelta}（Lv.${next?.level ?? '?'} / ${next?.exp ?? '?'} EXP）`,
        });
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Ability EXP update failed.'), npcName: 'System' });
      }
    };

    const resolveBuildingAssemblies = async (payload: BuildingAssemblyResolvePayload) => {
      try {
        const result = await resolveBuildingAssembly(withRoomId(payload)).unwrap();
        if (result.assemblies.length > 0) {
          syncBuildingMutationResult(result);
        }
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Building assembly failed.'), npcName: 'System' });
      }
    };

    const consolidateSleepKnowledge = async () => {
      const scene = sceneRef.current as any;
      const absoluteGameMinutes = scene?.getAbsoluteGameMinutes?.() ?? scene?.dayCycle?.absoluteGameMinutes ?? 0;
      try {
        const result = await consolidateNpcSleepKnowledge({
          roomId: roomIdRef.current ?? undefined,
          absoluteGameMinutes,
        }).unwrap();
        scene?.syncEventSaveData?.(result.gameSave as any);
        gameBus.emit('game:save_requested', { reason: 'npc:sleep_consolidation' });
      } catch (error) {
        console.warn('[NPC] sleep knowledge consolidation failed', error);
      }
    };

    const sendPetTravel = async (payload: PetTravelSendPayload) => {
      try {
        const result = await sendPetTravelPhoto(withRoomId(payload)).unwrap();
        const entryId = result.entry?.id
          ?? result.memoryAlbum?.pendingTravels?.find((item) => item.petEntityId === payload.petEntityId)?.entryId;
        const reason = result.reason || '';
        const isExistingReturn = reason === 'pet_return_unclaimed';
        const isExistingPending = reason === 'pet_travel_pending';
        const startedNewTravel = Boolean(result.pending && !isExistingPending);

        if (startedNewTravel && entryId) {
          dispatchPetTravelDepart(payload, entryId);
        } else if (isExistingReturn && entryId) {
          sceneRef.current?.dispatchWorldAction?.({
            type: 'PET_TRAVEL_RETURN',
            actorId: 'server',
            petEntityId: payload.petEntityId,
            entryId,
            absoluteGameMinutes: payload.absoluteGameMinutes,
          } as any);
        }
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
        gameBus.emit('pet:travel_changed', { petEntityId: payload.petEntityId, entry: result.entry ?? null, gameSave: result.gameSave });
        setDialog({ visible: false, text: '', npcName: '' });
        if (startedNewTravel) {
          gameBus.emit('ui:show_message', { text: `${payload.displayName || '小动物'}出门了。` });
        } else if (isExistingReturn) {
          gameBus.emit('ui:show_message', { text: `${payload.displayName || '小动物'}已经带照片回来了。` });
        } else if (isExistingPending) {
          gameBus.emit('ui:show_message', { text: `${payload.displayName || '小动物'}已经在路上了。` });
        }
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Pet travel photo failed.'), npcName: '相册' });
      }
    };

    const claimPetPhoto = async (payload: PetPhotoReturnPayload) => {
      try {
        const result = await claimPetTravelPhoto(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave as any);
        gameBus.emit('pet:travel_changed', { petEntityId: payload.petEntityId, entry: result.entry ?? null, gameSave: result.gameSave });
        gameBus.emit('ui:show_message', { text: '照片已经放进相册。' });
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Pet photo claim failed.'), npcName: '相册' });
      }
    };

    const unsubs = [
      gameBus.on('game:storage_chest_place_requested', placeStorage),
      gameBus.on('game:building_place_requested', placeGenericBuilding),
      gameBus.on('game:building_move_requested', moveGenericBuilding),
      gameBus.on('game:building_rotate_requested', rotateGenericBuilding),
      gameBus.on('game:building_upgrade_requested', upgradeGenericBuilding),
      gameBus.on('game:building_repair_requested', repairGenericBuilding),
      gameBus.on('game:building_jobs_complete_requested', completeBuildingJobsForTime),
      gameBus.on('game:building_workers_assign_requested', assignIdleBuildingWorkers),
      gameBus.on('game:building_worker_arrived', startConstructionAtWorkerArrival),
      gameBus.on('game:building_remove_requested', removeGenericBuilding),
      gameBus.on('game:building_assembly_resolve_requested', resolveBuildingAssemblies),
      gameBus.on('day:night_skip', consolidateSleepKnowledge),
      gameBus.on('game:golem_awaken_requested', awakenStoneGolem),
      gameBus.on('game:golem_spawn_requested', spawnStoneGolem),
      gameBus.on('game:mask_add_requested', addTempleMaskRadius),
      gameBus.on('game:mask_drop_requested', dropTempleMaskRadius),
      gameBus.on('game:mask_progress_add_requested', addTempleMaskProgress),
      gameBus.on('profile:attribute_exp_delta_requested', updateProfileAttributeExp),
      gameBus.on('pet:travel_send_requested', sendPetTravel),
      gameBus.on('pet:photo_return_requested', claimPetPhoto),
      gameBus.on('game:storage_chest_open_requested', ({ chestId }) => setStorageChestOpenId(chestId)),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [
    completeBuildingJobs,
    addMaskRadius,
    addMaskProgress,
    sendPetTravelPhoto,
    claimPetTravelPhoto,
    assignBuildingWorkers,
    dropMaskRadius,
    startBuildingConstruction,
    updateProfileAttribute,
    spawnGolem,
    awakenGolem,
    resolveBuildingAssembly,
    consolidateNpcSleepKnowledge,
    placeBuilding,
    placeStorageChest,
    moveBuilding,
    removeBuilding,
    rotateBuilding,
    roomIdRef,
    sceneRef,
    setDialog,
    setStorageChestOpenId,
    startBuildingRepair,
    startBuildingUpgrade,
  ]);
}
