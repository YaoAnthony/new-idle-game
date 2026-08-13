import { useEffect } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  useDamageGameActorMutation,
  useHealGameActorMutation,
} from '../api';
import type { GameScene } from '../GameScene';
import { gameBus, type GameEventMap } from '../shared/EventBus';
import type { DialogState } from './useNpcChat';

type ActorDamagePayload = GameEventMap['game:actor_damage_requested'];
type ActorHealPayload = GameEventMap['game:actor_heal_requested'];

interface UseHealthMutationBridgeOptions {
  sceneRef: RefObject<GameScene | null>;
  roomIdRef: RefObject<string | null | undefined>;
  setDialog: Dispatch<SetStateAction<DialogState>>;
}

function apiMessage(error: unknown, fallback: string): string {
  return (error as { data?: { message?: string } } | null)?.data?.message || fallback;
}

export function useHealthMutationBridge({
  sceneRef,
  roomIdRef,
  setDialog,
}: UseHealthMutationBridgeOptions): void {
  const [damageGameActor] = useDamageGameActorMutation();
  const [healGameActor] = useHealGameActorMutation();

  useEffect(() => {
    const withRoomId = <T extends { roomId?: string | null }>(payload: T): T & { roomId?: string } => ({
      ...payload,
      roomId: payload.roomId ?? roomIdRef.current ?? undefined,
    });

    const damage = async (payload: ActorDamagePayload) => {
      try {
        const result = await damageGameActor(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Damage failed.'), npcName: 'System' });
      }
    };

    const heal = async (payload: ActorHealPayload) => {
      try {
        const result = await healGameActor(withRoomId(payload)).unwrap();
        sceneRef.current?.syncEventSaveData(result.gameSave);
      } catch (error) {
        setDialog({ visible: true, text: apiMessage(error, 'Heal failed.'), npcName: 'System' });
      }
    };

    const unsubs = [
      gameBus.on('game:actor_damage_requested', damage),
      gameBus.on('game:actor_heal_requested', heal),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [damageGameActor, healGameActor, roomIdRef, sceneRef, setDialog]);
}
