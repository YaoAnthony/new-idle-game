import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useDispatch } from 'react-redux';
import {
  useLazyGetGameChestsQuery,
  useOpenChestMutation,
} from '../../../../../api/profileStateRtkApi';
import { setWalletCoins, setInventory } from '../../../../../Redux/Features/profileStateSlice';
import { patchWalletCoins } from '../../../../../Redux/Features/profileSlice';
import type { GameChest, ChestRewardItem } from '../../../../../Types/Profile';
import type { GameScene } from '../GameScene';
import { gameBus } from '../shared/EventBus';

export interface PendingChest {
  chestId: string;
  rewards: { coins: number; items: ChestRewardItem[] };
  chest?: GameChest;
}

function isStaleChestOpenError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (status !== 400 && status !== 404 && status !== 410) return false;
  const message = String((error as { data?: { message?: unknown } } | null)?.data?.message ?? '');
  return status === 404 || /already opened|not found/i.test(message);
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

export function useChestManager(
  sceneRef: RefObject<GameScene | null>,
  roomIdRef?: RefObject<string | null | undefined>,
) {
  const dispatch = useDispatch();
  const [availableChests, setAvailableChests] = useState<GameChest[]>([]);
  const availableChestsRef = useRef<GameChest[]>([]);
  const [pendingChest, setPendingChest] = useState<PendingChest | null>(null);
  const [fetchGameChests] = useLazyGetGameChestsQuery();
  const [openChestMutation] = useOpenChestMutation();
  const chestFocusIdxRef = useRef(0);

  availableChestsRef.current = availableChests;

  const getRoomId = useCallback(() => roomIdRef?.current ?? undefined, [roomIdRef]);

  const removeLocalChest = useCallback((chestId: string) => {
    setAvailableChests((prev) => prev.filter((chest) => chest.id !== chestId));
    const scene = sceneRef.current;
    const removeResult = isDrawableScene(scene) ? scene.dispatchWorldAction({
      type: 'REMOVE_OBJECT',
      actorId: 'player',
      objectId: chestId,
      objectKind: 'chest',
    }, 'server') : null;
    if (!removeResult?.ok) {
      if (isDrawableScene(scene)) scene.chestSystem?.removeChest(chestId);
    }
  }, [sceneRef]);

  const refreshChests = useCallback(() => {
    const roomId = getRoomId();
    fetchGameChests(roomId)
      .then((res) => {
        if (res.error) {
          console.warn('[Chest] refreshChests error result', res.error);
          return;
        }
        const chests: GameChest[] = (res.data?.chests ?? []).filter((chest) => !chest.opened);
        const scene = sceneRef.current;
        if (!isDrawableScene(scene)) {
          setAvailableChests([]);
          return;
        }
        const placedChests = scene.chestSystem?.loadChests(chests) ?? chests;
        setAvailableChests(placedChests);
      })
      .catch((error) => {
        console.warn('[Chest] refreshChests failed', error);
      });
  }, [fetchGameChests, getRoomId, sceneRef]);

  useEffect(() => {
    const unsubs = [
      gameBus.on('chest:interact', ({ chestId, rewards, chest }) => {
        setPendingChest({ chestId, rewards, chest });
      }),
      gameBus.on('game:chest_spawned', ({ chest }) => {
        if (!chest || chest.opened) return;
        const scene = sceneRef.current;
        if (!isDrawableScene(scene)) {
          refreshChests();
          return;
        }
        try {
          const placedChest = scene.chestSystem?.addChest(chest);
          if (!placedChest) throw new Error('chest_not_added');
          chest = placedChest;
        } catch (error) {
          console.warn('[Chest] addChest failed', { chest, error });
          refreshChests();
          return;
        }
        const exists = availableChestsRef.current.some((entry) => entry.id === chest.id);
        setAvailableChests((prev) => {
          if (prev.some((entry) => entry.id === chest.id)) return prev;
          return [...prev, chest];
        });
        if (!exists) {
          gameBus.emit('ui:show_message', { text: 'Reward chest landed on the island.' });
        }
      }),
      gameBus.on('world:object_hint_result', ({ ok, objectKind }) => {
        if (ok || objectKind !== 'chest') return;
        refreshChests();
      }),
      gameBus.on('game:ready', () => {
        refreshChests();
      }),
    ];
    const initialRefreshTimer = window.setTimeout(() => {
      refreshChests();
    }, 600);
    return () => {
      window.clearTimeout(initialRefreshTimer);
      unsubs.forEach((unsub) => unsub());
    };
  }, [refreshChests, sceneRef]);

  const handleChestHudClick = useCallback(() => {
    const list = availableChestsRef.current;
    if (!list.length) return;
    if (!isDrawableScene(sceneRef.current)) {
      refreshChests();
      return;
    }
    chestFocusIdxRef.current = chestFocusIdxRef.current % list.length;
    const chest = list[chestFocusIdxRef.current];
    gameBus.emit('world:object_hint_requested', {
      objectId: chest.id,
      objectKind: 'chest',
      x: chest.x,
      y: chest.y,
      label: 'Reward Chest',
    });
    chestFocusIdxRef.current++;
  }, [refreshChests, sceneRef]);

  const handleChestConfirm = useCallback(async () => {
    if (!pendingChest) return;
    const { chestId } = pendingChest;
    setPendingChest(null);

    try {
      const localChest = pendingChest.chest
        ?? availableChestsRef.current.find((chest) => chest.id === chestId)
        ?? null;
      const result = await openChestMutation({
        chestId,
        roomId: getRoomId(),
        localChest,
      }).unwrap();
      dispatch(setWalletCoins(result.wallet.coins));
      dispatch(patchWalletCoins(result.wallet.coins));
      dispatch(setInventory(result.inventory));
      removeLocalChest(chestId);
      refreshChests();
    } catch (error) {
      console.warn('[Chest] openChestMutation failed', { chestId, error });
      if (isStaleChestOpenError(error)) {
        removeLocalChest(chestId);
      }
      refreshChests();
    }
  }, [dispatch, getRoomId, openChestMutation, pendingChest, refreshChests, removeLocalChest]);

  return {
    availableChests,
    setAvailableChests,
    availableChestsRef,
    pendingChest,
    refreshChests,
    handleChestHudClick,
    handleChestConfirm,
    fetchGameChests,
  };
}
