/**
 * usePhaserBoot — Phaser 游戏实例的创建与销毁。
 *
 * 职责：
 *   · 创建 Phaser.Game，注入已保存的 GameSave 状态
 *   · 订阅 gameBus time:update（时间 HUD）和 game:ready（初始化数据加载）
 *   · 键盘快捷键（由 InputBindings 统一定义）
 *   · 每 30 s 自动存档 + advanceFarmTime + saveCreatures
 *   · ResizeObserver 让 canvas 跟随容器尺寸
 */

import { useEffect, useRef }  from 'react';
import Phaser                 from 'phaser';
import PhaserRaycaster        from 'phaser-raycaster';
import { useDispatch, useSelector } from 'react-redux';
import type { MutableRefObject, RefObject } from 'react';
import {
  useLazyGetGameCatalogsQuery,
  useLazyGetGameSaveQuery,
  useSaveGameSaveMutation,
  useUpdateProfileCoinsMutation,
} from '../../../../../api/profileStateRtkApi';
import { initSlotsFromInventory, restoreInventorySnapshot, restoreNpcInventoriesSnapshot, setGameSettings } from '../../../../../Redux/Features/gameSlice';
import { setWalletCoins } from '../../../../../Redux/Features/profileStateSlice';
import { patchWalletCoins } from '../../../../../Redux/Features/profileSlice';
import type { RootState } from '../../../../../Redux/store';
import type { GameInventoryItem, GameSettingsState, SlotItem } from '../../../../../Redux/Features/gameSlice';
import { gameBus }            from '../shared/EventBus';
import { GameScene }          from '../GameScene';
import { matchesKeyboardEventAction } from '../features/input/InputBindings';
import type { GameChest }     from '../../../../../Types/Profile';
import type { GameSaveV2 } from '../persistence/save/GameSaveTypes';
import { normalizeGameSave } from '../persistence/save/GameSaveMapper';
import { fetchStorylineRuntimePackages } from '../features/storyline';
import { toMinuteOfDay } from '../time/GameTime';

interface UsePhaserBootProps {
  /** Phaser canvas 容器 */
  containerRef:     RefObject<HTMLDivElement | null>;
  /** 共享场景 ref（由外层组件创建，boot 后填充） */
  sceneRef:         RefObject<GameScene | null>;
  /** 共享游戏实例 ref */
  gameRef:          RefObject<Phaser.Game | null>;
  /** chat 输入框是否打开（键盘逻辑需要读取） */
  chatOpenRef:      RefObject<boolean>;
  /** hotbar 当前槽位 ref（Q 键 drop 需要读取） */
  hotbarSlotsRef:   RefObject<({ itemId?: string } | null)[]>;
  savedGameSaveRef: RefObject<GameSaveV2 | null>;
  /** Current settings saved inside gameSave.worldStatus.settings. */
  gameSettingsRef:  RefObject<GameSettingsState>;
  gameInventoryRef: RefObject<GameInventoryItem[]>;
  backpackSlotsRef: RefObject<(SlotItem | null)[]>;
  /** auth token ref */
  tokenRef:         RefObject<string | null>;
  /** NPC 背包 ref */
  npcInventoriesRef:RefObject<Record<string, Record<string, number>>>;
  /** 联机 roomId ref */
  multiplayRoomIdRef: RefObject<string | null>;
  userId: string | null;
  username: string;
  /** 更新时间字符串（time:update 事件） */
  setTimeStr:       (ts: string) => void;
  /** 一天内当前分钟数（由 time:update.absoluteGameMinutes 派生）。 */
  setCurrentTimeMinute?: (minute: number) => void;
  /** 宝箱列表从 game:ready 加载后回调 */
  setAvailableChests: (chests: GameChest[]) => void;
  /** Q 键 drop 物品 */
}

export function usePhaserBoot({
  containerRef,
  sceneRef,
  gameRef,
  chatOpenRef,
  hotbarSlotsRef,
  savedGameSaveRef,
  gameSettingsRef,
  gameInventoryRef,
  backpackSlotsRef,
  tokenRef,
  npcInventoriesRef,
  multiplayRoomIdRef,
  userId,
  username,
  setTimeStr,
  setCurrentTimeMinute,
  setAvailableChests,
}: UsePhaserBootProps) {
  const dispatch = useDispatch();
  const walletCoins = useSelector((state: RootState) => {
    const profileCoins = Number((state.profile.profile as any)?.wallet?.coins);
    if (Number.isFinite(profileCoins)) return profileCoins;
    const runtimeCoins = Number(state.profileState.wallet?.coins);
    return Number.isFinite(runtimeCoins) ? runtimeCoins : 0;
  });
  const profileSnapshotRef = useRef({ wallet: { coins: Math.max(0, Math.floor(walletCoins)) } });

  const [fetchGameSave] = useLazyGetGameSaveQuery();
  const [fetchGameCatalogs] = useLazyGetGameCatalogsQuery();
  const [saveGameSave]  = useSaveGameSaveMutation();
  const [updateProfileCoins] = useUpdateProfileCoinsMutation();
  const saveDeleteInFlightRef = useRef(false);

  useEffect(() => {
    profileSnapshotRef.current = { wallet: { coins: Math.max(0, Math.floor(walletCoins)) } };
  }, [walletCoins]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const scene = new GameScene();
    if (savedGameSaveRef.current) {
      scene.setInitialGameSave(savedGameSaveRef.current, userId ?? 'player');
    }

    // ── gameBus 订阅 ──────────────────────────────────────────────────────
    let initialGameSaveLoaded = false;

    const buildCurrentGameSave = (): GameSaveV2 | null => {
      const s = sceneRef.current;
      if (!s || !initialGameSaveLoaded) return null;
      const roomId = multiplayRoomIdRef.current ?? undefined;
      return s.getGameSaveData({
        previousSave: savedGameSaveRef.current,
        roomId,
        userId,
        username,
        settings: gameSettingsRef.current,
        inventory: {
          gameInventory: gameInventoryRef.current,
          hotbarSlots: hotbarSlotsRef.current as (SlotItem | null)[],
          backpackSlots: backpackSlotsRef.current,
        },
        npcInventories: npcInventoriesRef.current,
      });
    };

    const saveCurrentGame = () => {
      const s = sceneRef.current;
      if (!s || !initialGameSaveLoaded) return;
      if (saveDeleteInFlightRef.current) {
        console.log('[SavingDelete][Autosave] skipped while delete is in flight');
        return;
      }
      const roomId = multiplayRoomIdRef.current ?? undefined;
      const gameSave = buildCurrentGameSave();
      if (!gameSave) return;
      const saveMeta = gameSave.saveMeta
        ?? savedGameSaveRef.current?.saveMeta
        ?? (s.initialGameSave as GameSaveV2 | null | undefined)?.saveMeta
        ?? null;
      saveGameSave({ gameSave, roomId, saveMeta })
        .unwrap()
        .then((result) => {
          savedGameSaveRef.current = result.gameSave;
          s.initialGameSave = result.gameSave;
        })
        .catch((error) => {
          const code = (error as any)?.data?.code || (error as any)?.error?.data?.code;
          if (code === 'generation_changed') {
            console.warn('[IdleGame] autosave skipped after world generation changed', error);
            fetchGameSave(roomId)
              .unwrap()
              .finally(() => window.location.reload())
              .catch(() => window.location.reload());
            return;
          }
          console.warn('[IdleGame] autosave failed', error);
        });
    };

    const unsubs = [
      // 时间 HUD — 显示完整日期+时间 ("2026-01-01 06:00")
      gameBus.on('time:update', ({ absoluteGameMinutes, dateTimeStr }) => {
        setTimeStr(dateTimeStr);
        setCurrentTimeMinute?.(toMinuteOfDay(absoluteGameMinutes));
      }),
      gameBus.on('game:save_delete_requested', ({ roomId }) => {
        saveDeleteInFlightRef.current = true;
        console.log('[SavingDelete][Autosave] paused for delete', { roomId });
      }),
      gameBus.on('game:save_delete_finished', ({ roomId, ok }) => {
        if (!ok) saveDeleteInFlightRef.current = false;
        console.log('[SavingDelete][Autosave] delete finished', { roomId, ok, paused: saveDeleteInFlightRef.current });
      }),
      gameBus.on('game:save_requested', () => saveCurrentGame()),
      gameBus.on('game:save_snapshot_requested', ({ resolve }) => {
        const snapshot = buildCurrentGameSave();
        resolve(snapshot ? {
          save: snapshot,
          profile: profileSnapshotRef.current,
        } : null);
      }),
      gameBus.on('game:restore_save_requested', ({ save, reason, profile, persist = true, onApplied }) => {
        const s = sceneRef.current;
        let didReport = false;
        const reportApplied = (result: { ok: boolean; reason?: string }) => {
          if (didReport) return;
          didReport = true;
          onApplied?.(result);
        };

        if (!s || !initialGameSaveLoaded) {
          reportApplied({ ok: false, reason: 'runtime_not_ready' });
          return;
        }

        try {
          const normalized = normalizeGameSave(save, { userId: userId ?? 'player', username });
          const activeUserId = userId ?? 'player';
          const playerSave = normalized.players[activeUserId] ?? Object.values(normalized.players)[0];
          const inventory = playerSave?.inventory ?? {
            gameInventory: [],
            hotbarSlots: Array(10).fill(null) as (SlotItem | null)[],
            backpackSlots: Array(40).fill(null) as (SlotItem | null)[],
          };

          gameInventoryRef.current = inventory.gameInventory;
          hotbarSlotsRef.current = inventory.hotbarSlots as ({ itemId?: string } | null)[];
          backpackSlotsRef.current = inventory.backpackSlots;
          dispatch(restoreInventorySnapshot(inventory));

          const npcInventories = Object.fromEntries(
            Object.values(normalized.worldStatus.npcs ?? {}).map((npc) => [
              npc.name || npc.id,
              npc.inventory ?? {},
            ]),
          );
          npcInventoriesRef.current = npcInventories;
          dispatch(restoreNpcInventoriesSnapshot(npcInventories));
          gameBus.emit('game:inventory_changed', { items: inventory.gameInventory });

          let checkpointWalletCoins: number | null = null;
          const checkpointCoins = Number(profile?.wallet?.coins);
          if (Number.isFinite(checkpointCoins)) {
            const coins = Math.max(0, Math.floor(checkpointCoins));
            checkpointWalletCoins = coins;
            profileSnapshotRef.current = { wallet: { coins } };
            dispatch(setWalletCoins(coins));
            dispatch(patchWalletCoins(coins));
          }

          savedGameSaveRef.current = normalized;
          (gameSettingsRef as MutableRefObject<GameSettingsState>).current = normalized.worldStatus.settings;
          dispatch(setGameSettings(normalized.worldStatus.settings));
          s.loadGameSaveData(normalized, activeUserId);
          s.gameLightingSystem?.setFogOfWarEnabled?.(normalized.worldStatus.settings.fogOfWarEnabled);
          s.gameAudioSystem?.applySettings?.(normalized.worldStatus.settings);

          const savedChests = Object.values(normalized.worldStatus.worlds)
            .flatMap((partition) => partition.entities.chests);
          setAvailableChests(savedChests.filter((chest) => !chest.opened) as GameChest[]);

          reportApplied({ ok: true });

          if (persist === false) {
            s.initialGameSave = normalized;
            return;
          }

          const saveMeta = normalized.saveMeta
            ?? savedGameSaveRef.current?.saveMeta
            ?? (s.initialGameSave as GameSaveV2 | null | undefined)?.saveMeta
            ?? null;
          saveGameSave({ gameSave: normalized, roomId: normalized.worldStatus.roomId, saveMeta })
            .unwrap()
            .then((result) => {
              savedGameSaveRef.current = result.gameSave;
              s.initialGameSave = result.gameSave;
              if (checkpointWalletCoins !== null) {
                updateProfileCoins({ amount: checkpointWalletCoins, operation: 'set' })
                  .unwrap()
                  .catch((error) => {
                    console.warn('[IdleGame] restore profile wallet failed', { reason, error });
                  });
              }
            })
            .catch((error) => {
              console.warn('[IdleGame] restore save persist failed', { reason, error });
            });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn('[IdleGame] restore save apply failed', { reason, error });
          reportApplied({ ok: false, reason: message });
        }
      }),

      // 场景就绪 → 连接 NPC 提供者 + 加载持久数据
      gameBus.on('game:ready', () => {
        console.log('[IdleGame] game:ready — 初始化 NPC 提供者并加载数据');
        scene.npcSystem?.setAuthProvider?.(() => tokenRef.current);
        scene.npcSystem?.setInventoryProvider?.(
          (name) => npcInventoriesRef.current[name] ?? {},
        );

        const loadRuntimeStorylines = async () => {
          try {
            const storylines = await fetchStorylineRuntimePackages(tokenRef.current);
            scene.loadStorylinePackages(storylines);
          } catch (error) {
            console.warn('[StorylineRuntime] failed to load runtime packages', error);
            scene.loadStorylinePackages([]);
          }
        };

        const loadRuntimeCatalogs = async () => {
          try {
            const catalogs = await fetchGameCatalogs(undefined).unwrap();
            scene.loadGameCatalogs(catalogs);
          } catch (error) {
            console.warn('[GameCatalog] failed to load runtime catalogs', error);
            scene.loadGameCatalogs(null);
          }
        };

        void (async () => {
          try {
            await loadRuntimeCatalogs();
            const result = await fetchGameSave(multiplayRoomIdRef.current ?? undefined).unwrap();
            const save = result.gameSave
              ? normalizeGameSave(result.gameSave, { userId: userId ?? 'player' })
              : null;
            if (save) {
              savedGameSaveRef.current = save;
              scene.loadGameSaveData(save, userId ?? 'player');

              const npcInventories = Object.fromEntries(
                Object.values(save.worldStatus.npcs ?? {}).map((npc) => [
                  npc.name || npc.id,
                  npc.inventory ?? {},
                ]),
              );
              npcInventoriesRef.current = npcInventories;
              dispatch(restoreNpcInventoriesSnapshot(npcInventories));

              const playerSave = save.players[userId ?? 'player'] ?? Object.values(save.players)[0];
              const inventory = playerSave?.inventory?.gameInventory ?? [];
              dispatch(initSlotsFromInventory(inventory));
              const owned = inventory.map((i: { itemId: string }) => i.itemId);
              scene.removeWorldItemsByIds(owned);

              const savedChests = Object.values(save.worldStatus.worlds)
                .flatMap((partition) => partition.entities.chests);
              const chests: GameChest[] = savedChests.filter((chest) => !chest.opened);
              setAvailableChests(chests);
            }
            initialGameSaveLoaded = true;
            await loadRuntimeStorylines();
          } catch (error) {
            console.warn('[IdleGame] failed to load initial game save', error);
            await loadRuntimeCatalogs();
            await loadRuntimeStorylines();
          }
        })();
      }),
    ];

    sceneRef.current = scene;

    // ── Phaser 初始化 ───────────────────────────────────────────────────────
    const config: Phaser.Types.Core.GameConfig & { disableVisibilityChange?: boolean } = {
      type:            Phaser.AUTO,
      width:           container.clientWidth  || 800,
      height:          container.clientHeight || 600,
      parent:          container,
      backgroundColor: '#12340e',
      pixelArt:        true,
      disableVisibilityChange: true,
      audio: {
        disableWebAudio: true,
      },
      physics: {
        default: 'arcade',
        arcade:  { gravity: { x: 0, y: 0 }, debug: false },
      },
      plugins: {
        scene: [
          {
            key:     'PhaserRaycaster',
            plugin:  PhaserRaycaster,
            mapping: 'raycasterPlugin',
          },
        ],
      },
      scene,
    };
    console.log('[IdleGame] 启动 Phaser。savedGameSave:', savedGameSaveRef.current);
    gameRef.current = new Phaser.Game(config);

    // ── 键盘快捷键 ──────────────────────────────────────────────────────────
    // openChat 委托给 GameScene.triggerInteract — 它会查找最近 NPC，
    // 如果范围内没人，就会发出 'ui:show_message' 而不是空打开 chat。
    // setChat / chatOpenRef / pauseInput 均由 useNpcChat 侧完成。
    const openChat = (initialValue: string) => {
      sceneRef.current?.triggerInteract(initialValue);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (chatOpenRef.current) return;

      if (matchesKeyboardEventAction(e, 'settings')) {
        e.preventDefault();
        gameBus.emit('ui:open_esc_content', { action: 'system-settings' });
        return;
      }
      if (matchesKeyboardEventAction(e, 'chat')) {
        e.preventDefault();
        openChat('');
        return;
      }
      if (matchesKeyboardEventAction(e, 'command')) {
        e.preventDefault();
        openChat('/');
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    // ── 自动存档（每 30 s）─────────────────────────────────────────────────
    const saveTimer = setInterval(saveCurrentGame, 30_000);

    // ── ResizeObserver ───────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight;
      if (w > 0 && h > 0) gameRef.current?.scale.resize(w, h);
    });
    ro.observe(container);

    // ── 清理 ─────────────────────────────────────────────────────────────────
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      clearInterval(saveTimer);
      ro.disconnect();
      unsubs.forEach(u => u());
      gameRef.current?.destroy(true);
      (gameRef as any).current  = null;
      (sceneRef as any).current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
