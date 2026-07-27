/**
 * SystemIdleGame — Phaser 3 + React 游戏容器。
 *
 * 这里只负责：
 *   · 持有需要跨 hook 共享的 ref（sceneRef / gameRef / chatOpenRef）
 *   · 调用各领域 hook
 *   · 渲染 JSX
 *
 * 具体逻辑已拆分到 hooks/ 目录下各文件。
 */

import React, {
  useRef, useState, useCallback, useEffect, useMemo,
} from 'react';
import Phaser          from 'phaser';
import { motion } from 'motion/react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import { getPlayerMovementSpeed } from '@timeplan-game/core/protagonist/skillTree';
import type { AppDispatch, RootState } from '../../../../Redux/store';

import { setGameSettings, type GameSettingsState } from '../../../../Redux/Features/gameSlice';
import { setProfile } from '../../../../Redux/Features/profileSlice';
import { patchSystemLotteryPools, patchSystemProducts } from '../../../../Redux/Features/systemSlice';

import { GameScene }       from './GameScene';
import { registerGameSceneCommands } from './runtime/GameSceneCommands';
import {
  ChestRewardUI,
  ChatInput,
  DialogBox,
  Hotbar,
  HUD,
  MultiplayPanel,
  VitalBars,
} from './ui';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import { getEnv } from '../../../../config/env';
import { systemRtkApi, useLazyGetSystemListQuery } from '../../../../api/systemRtkApi';
import { gameBus } from './shared/EventBus';
import { MAX_ACTOR_HEALTH } from './shared/health';
import { matchesKeyboardEventAction, setActiveInputBindings, type InputBindingsState } from './features/input/InputBindings';
import { MINS_PER_DAY } from './time/GameTime';

// ── Custom hooks ─────────────────────────────────────────────────────────────
import { useGameAuth }      from './hooks/useGameAuth';
import { useHotbar }        from './hooks/useHotbar';
import { useNpcChat }       from './hooks/useNpcChat';
import { useChestManager }  from './hooks/useChestManager';
import { useIdleGameSyncBoundary } from './hooks/useIdleGameSyncBoundary';
import { useMultiplay }     from './hooks/useMultiplay';
import { useFarmActions }   from './hooks/useFarmActions';
import { usePhaserBoot }    from './hooks/usePhaserBoot';
import { useWorldMutationBridge } from './hooks/useWorldMutationBridge';
import { useHealthMutationBridge } from './hooks/useHealthMutationBridge';
import {
  useDeleteGameSaveMutation,
  useGetProfileStateQuery,
  useSaveGameSaveMutation,
  useUpdateProfileControlsMutation,
} from './api';
import { GameShopModal } from './components/GameShopModal';
import { StorageChestModal } from './components/StorageChestModal';
import { BackpackModal } from './components/BackpackModal';
import { BuildingPanel } from './components/BuildingPanel';
import { NpcTradeModal } from './components/NpcTradeModal';
import { GameSettingsModal } from './components/GameSettingsModal';
import { StorylineChoiceModal } from './components/StorylineChoiceModal';
import { PetTravelPanel, type PetTravelPanelState } from './features/pets/travel/PetTravelPanel';
import {
  GameEscCursor,
  GameEscContentModal,
  GameEscMenu,
  type GameEscMenuAction,
} from './components/GameEscMenu';
import type { CommandInfo } from './systems/CommandSystem';
import type { StoreProduct } from '../../../../Types/System';
import type { LotteryPool } from '../../../../Types/Lottery';
import { isMemberSystem } from '../../../../utils/systemRelationship';

// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_MISSION_UPDATE_TYPES = new Set([
  'mission_list_created',
  'mission_list_updated',
  'mission_list_deleted',
  'mission_node_created',
  'mission_node_updated',
]);

const SYSTEM_DAILY_UPDATE_TYPES = new Set([
  'daily_quest_settings_updated',
  'daily_quest_pool_updated',
  'daily_quest_completed',
]);

const SYSTEM_MEMBER_TASK_EVENT_TYPES = new Set([
  'member_accept_list',
  'member_start_task',
  'member_complete_task',
  'member_fail_task',
  'member_restart_task',
]);

const { backendUrl } = getEnv();

function clampTimeMinute(value: number): number {
  return Math.max(0, Math.min(MINS_PER_DAY - 1, Math.round(value)));
}

interface DebugOverlayState {
  visible: boolean;
  x: number;
  y: number;
  facing: string;
  areaId: string;
  fps: number;
}

const SystemIdleGame: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  // ── 跨 hook 共享的 refs ────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef     = useRef<GameScene | null>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  /** chat 输入框是否打开（键盘逻辑与 NpcChat 共用）。 */
  const chatOpenRef  = useRef(false);


  // ── 领域 hooks ────────────────────────────────────────────────────────────
  const auth = useGameAuth();

  const hotbar = useHotbar(sceneRef);

  const npcChat = useNpcChat(sceneRef, chatOpenRef);

  const multiplay = useMultiplay({
    sceneRef,
    tokenRef:         auth.tokenRef,
    myDisplayNameRef: auth.myDisplayNameRef,
    userId:           auth.userId,
  });

  const chests = useChestManager(sceneRef, multiplay.multiplayRoomIdRef);

  // 农田/物品 gameBus 订阅（无状态，副作用）
  useFarmActions(sceneRef, multiplay.multiplayRoomIdRef);

  const syncBoundary = useIdleGameSyncBoundary({
    sceneRef,
    multiplayActiveRef: multiplay.multiplayActiveRef,
    setAvailableChests: chests.setAvailableChests,
    setNpcDialog: npcChat.setDialog,
  });

  // ── 附加 UI 状态 ─────────────────────────────────────────────────────────
  const [currentTimeMinute, setCurrentTimeMinute] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [gameShopOpen, setGameShopOpen] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [escMenuOpen, setEscMenuOpen] = useState(false);
  const [escContentAction, setEscContentAction] = useState<GameEscMenuAction | null>(null);
  const escMenuOpenedAtRef = useRef(0);
  const [playerHunger, setPlayerHunger] = useState(20);
  const [playerHealth, setPlayerHealth] = useState(MAX_ACTOR_HEALTH);
  const [debugOverlay, setDebugOverlay] = useState<DebugOverlayState>({
    visible: false,
    x: 0,
    y: 0,
    facing: 'down',
    areaId: DEFAULT_WORLD_ID,
    fps: 0,
  });
  const [commandCatalog, setCommandCatalog] = useState<CommandInfo[]>([]);
  const [storageChestOpenId, setStorageChestOpenId] = useState<string | null>(null);
  const [buildingPanelId, setBuildingPanelId] = useState<string | null>(null);
  const [tradeNpcName, setTradeNpcName] = useState<string | null>(null);
  const [petTravelPanel, setPetTravelPanel] = useState<PetTravelPanelState | null>(null);
  /** Closest NPC name to player (refreshed @4Hz) — drives the talk-button label. */
  const [nearbyNpc, setNearbyNpc] = useState<string | null>(null);
  const gameInputBlockedByOverlay = Boolean(
    escMenuOpen
    || escContentAction
    || gameShopOpen
    || backpackOpen
    || gameSettingsOpen
    || storageChestOpenId
    || buildingPanelId
    || tradeNpcName
    || petTravelPanel
    || multiplay.multiplayOpen
    || chests.pendingChest
    || npcChat.storylineChoice
  );

  useEffect(() => {
    if (npcChat.chat.open) return;
    chatOpenRef.current = gameInputBlockedByOverlay;
    if (gameInputBlockedByOverlay) {
      sceneRef.current?.pauseInput();
    } else {
      sceneRef.current?.resumeInput();
    }
  }, [gameInputBlockedByOverlay, npcChat.chat.open]);

  useWorldMutationBridge({
    sceneRef,
    roomIdRef: multiplay.multiplayRoomIdRef,
    setDialog: npcChat.setDialog,
    setStorageChestOpenId,
  });

  useHealthMutationBridge({
    sceneRef,
    roomIdRef: multiplay.multiplayRoomIdRef,
    setDialog: npcChat.setDialog,
  });

  const openEscContentAction = useCallback((action: GameEscMenuAction) => {
    setEscMenuOpen(false);
    setGameShopOpen(false);
    setBackpackOpen(false);
    setGameSettingsOpen(false);
    setStorageChestOpenId(null);
    setTradeNpcName(null);
    multiplay.setMultiplayOpen(false);
    setEscContentAction(action);
  }, [multiplay.setMultiplayOpen]);

  const openLotteryContent = useCallback(() => {
    openEscContentAction('lottery');
  }, [openEscContentAction]);

  const openGameShopContent = useCallback(() => {
    setEscMenuOpen(false);
    setEscContentAction(null);
    setBackpackOpen(false);
    setGameSettingsOpen(false);
    setStorageChestOpenId(null);
    setTradeNpcName(null);
    multiplay.setMultiplayOpen(false);
    setGameShopOpen(true);
  }, [multiplay.setMultiplayOpen]);

  const closeGameShopContent = useCallback(() => {
    setGameShopOpen(false);
    chatOpenRef.current = false;
    sceneRef.current?.resumeInput();
  }, []);

  const closeNpcTrade = useCallback(() => {
    setTradeNpcName(null);
    chatOpenRef.current = false;
    sceneRef.current?.resumeInput();
  }, []);

  useEffect(() => {
    const offTrade = gameBus.on('npc:trade_requested', ({ npcName }) => {
      const name = npcName || sceneRef.current?.npcSystem?.getNearestNameFromPlayer?.(220) || null;
      console.log('[F-TRACE] React npc:trade_requested', { npcName, resolvedName: name });
      if (!name) return;
      setEscMenuOpen(false);
      setEscContentAction(null);
      setGameShopOpen(false);
      setBackpackOpen(false);
      setGameSettingsOpen(false);
      setStorageChestOpenId(null);
      setBuildingPanelId(null);
      setPetTravelPanel(null);
      multiplay.setMultiplayOpen(false);
      npcChat.setChat({ open: false, npcName: '', initialValue: '' });
      setTradeNpcName(name);
      chatOpenRef.current = true;
      sceneRef.current?.pauseInput();
    });
    return () => offTrade();
  }, [multiplay.setMultiplayOpen, npcChat.setChat]);

  useEffect(() => {
    const offGameShop = gameBus.on('ui:game_shop_requested', () => {
      openGameShopContent();
      chatOpenRef.current = true;
      sceneRef.current?.pauseInput();
    });
    return () => offGameShop();
  }, [openGameShopContent]);

  useEffect(() => {
    const offBuildingPanel = gameBus.on('building:panel_open_requested', ({ buildingId }) => {
      setEscMenuOpen(false);
      setEscContentAction(null);
      setGameShopOpen(false);
      setBackpackOpen(false);
      setGameSettingsOpen(false);
      setStorageChestOpenId(null);
      setTradeNpcName(null);
      setPetTravelPanel(null);
      multiplay.setMultiplayOpen(false);
      setBuildingPanelId(buildingId);
      chatOpenRef.current = true;
      sceneRef.current?.pauseInput();
    });
    return () => offBuildingPanel();
  }, [multiplay.setMultiplayOpen]);

  const closePetTravelPanel = useCallback((options?: { acknowledgeReturnedPhoto?: boolean }) => {
    if (options?.acknowledgeReturnedPhoto && petTravelPanel?.returnedEntryId) {
      gameBus.emit('pet:photo_return_requested', {
        roomId: multiplay.multiplayRoomId,
        worldId: petTravelPanel.worldId || DEFAULT_WORLD_ID,
        petEntityId: petTravelPanel.petEntityId,
        entryId: petTravelPanel.returnedEntryId,
        absoluteGameMinutes: sceneRef.current?.getAbsoluteGameMinutes?.() ?? 0,
      });
    }
    setPetTravelPanel(null);
    chatOpenRef.current = false;
    sceneRef.current?.resumeInput();
  }, [multiplay.multiplayRoomId, petTravelPanel]);

  useEffect(() => {
    const offPetPanel = gameBus.on('pet:panel_requested', (payload) => {
      setEscMenuOpen(false);
      setEscContentAction(null);
      setGameShopOpen(false);
      setBackpackOpen(false);
      setGameSettingsOpen(false);
      setStorageChestOpenId(null);
      setBuildingPanelId(null);
      setTradeNpcName(null);
      multiplay.setMultiplayOpen(false);
      setPetTravelPanel(payload);
      chatOpenRef.current = true;
      sceneRef.current?.pauseInput();
    });
    return () => offPetPanel();
  }, [multiplay.setMultiplayOpen]);

  useEffect(() => {
    const offOpenEscContent = gameBus.on('ui:open_esc_content', ({ action }) => {
      openEscContentAction(action);
      setBuildingPanelId(null);
      chatOpenRef.current = true;
      sceneRef.current?.pauseInput();
    });
    return () => offOpenEscContent();
  }, [openEscContentAction]);

  useEffect(() => {
    const id = setInterval(() => {
      setNearbyNpc(sceneRef.current?.npcSystem?.getNearestNameFromPlayer?.(220) ?? null);
    }, 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const scene = sceneRef.current as any;
      const visible = Boolean(scene?.playerDebugOverlayEnabled ?? scene?.physicsDebugEnabled);
      if (!visible || !scene) {
        setDebugOverlay((current) => (
          current.visible ? { ...current, visible: false } : current
        ));
        return;
      }

      const position = scene.playerSystem?.getPosition?.() ?? { x: 0, y: 0 };
      const player = scene.playerSystem?.getPlayer?.() ?? scene.player ?? null;
      const next: DebugOverlayState = {
        visible: true,
        x: Math.round(position.x),
        y: Math.round(position.y),
        facing: player?.facing ?? 'down',
        areaId: scene.getWorldIdAt?.(position.x, position.y)
          ?? scene.currentMapDefinition?.ref?.worldId
          ?? DEFAULT_WORLD_ID,
        fps: Math.round(Number(scene.game?.loop?.actualFps ?? 0)),
      };

      setDebugOverlay((current) => (
        current.visible === next.visible
        && current.x === next.x
        && current.y === next.y
        && current.facing === next.facing
        && current.areaId === next.areaId
        && current.fps === next.fps
          ? current
          : next
      ));
    }, 120);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const offHunger = gameBus.on('player:hunger_changed', ({ hunger }) => {
      setPlayerHunger(hunger);
    });
    const offHealth = gameBus.on('player:health_changed', ({ health }) => {
      setPlayerHealth(health);
    });
    const offReady = gameBus.on('game:ready', () => {
      setPlayerHunger(sceneRef.current?.playerSystem?.getHunger?.() ?? 20);
      setPlayerHealth(sceneRef.current?.playerSystem?.getHealth?.() ?? MAX_ACTOR_HEALTH);
    });
    return () => {
      offHunger();
      offHealth();
      offReady();
    };
  }, []);

  // ── 存档快捷 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() !== 'b') return;
      if (npcChat.chat.open) return;
      if (gameShopOpen || gameSettingsOpen || storageChestOpenId || buildingPanelId || tradeNpcName) return;

      event.preventDefault();
      setBackpackOpen(open => !open);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buildingPanelId, gameSettingsOpen, gameShopOpen, npcChat.chat.open, storageChestOpenId, tradeNpcName]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() !== 'p') return;
      if (event.repeat) return;
      if (npcChat.chat.open || buildingPanelId || tradeNpcName || petTravelPanel) return;

      event.preventDefault();
      openGameShopContent();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buildingPanelId, npcChat.chat.open, openGameShopContent, tradeNpcName]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() !== 'j') return;
      if (event.repeat) return;
      if (npcChat.chat.open || buildingPanelId || tradeNpcName) return;

      event.preventDefault();
      openEscContentAction('system-tasks');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buildingPanelId, npcChat.chat.open, openEscContentAction, petTravelPanel, tradeNpcName]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      if (event.key.toLowerCase() !== 'n') return;
      if (event.repeat) return;
      if (npcChat.chat.open || buildingPanelId || tradeNpcName || petTravelPanel) return;

      event.preventDefault();
      openEscContentAction('npc-data');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buildingPanelId, npcChat.chat.open, openEscContentAction, tradeNpcName]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      if (!matchesKeyboardEventAction(event, 'profilePanel')) return;
      if (event.repeat) return;
      if (npcChat.chat.open || buildingPanelId || tradeNpcName || petTravelPanel) return;

      event.preventDefault();
      openEscContentAction('profile-panel');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buildingPanelId, npcChat.chat.open, openEscContentAction, petTravelPanel, tradeNpcName]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      if (event.key !== 'F3') return;
      if (event.repeat) return;
      if (npcChat.chat.open || buildingPanelId || tradeNpcName) return;

      event.preventDefault();
      openLotteryContent();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [buildingPanelId, npcChat.chat.open, openLotteryContent, petTravelPanel, tradeNpcName]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditableTarget(event.target)) return;
      if (event.key !== 'Escape') return;
      if (event.repeat) return;
      if (npcChat.chat.open) return;

      event.preventDefault();

      if (tradeNpcName) {
        closeNpcTrade();
        return;
      }
      if (buildingPanelId) {
        setBuildingPanelId(null);
        chatOpenRef.current = false;
        sceneRef.current?.resumeInput();
        return;
      }
      if (petTravelPanel) {
        closePetTravelPanel({ acknowledgeReturnedPhoto: true });
        return;
      }
      if (escContentAction) {
        setEscContentAction(null);
        chatOpenRef.current = false;
        sceneRef.current?.resumeInput();
        return;
      }
      if (backpackOpen) {
        setBackpackOpen(false);
        return;
      }
      if (gameSettingsOpen) {
        setGameSettingsOpen(false);
        return;
      }
      if (gameShopOpen) {
        setGameShopOpen(false);
        return;
      }
      if (storageChestOpenId) {
        setStorageChestOpenId(null);
        return;
      }
      if (multiplay.multiplayOpen) {
        multiplay.setMultiplayOpen(false);
        return;
      }

      if (escMenuOpen) {
        if (Date.now() - escMenuOpenedAtRef.current < 420) return;
        setEscMenuOpen(false);
        return;
      }

      escMenuOpenedAtRef.current = Date.now();
      setEscMenuOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    backpackOpen,
    buildingPanelId,
    escContentAction,
    escMenuOpen,
    gameSettingsOpen,
    gameShopOpen,
    multiplay.multiplayOpen,
    multiplay.setMultiplayOpen,
    npcChat.chat.open,
    petTravelPanel,
    storageChestOpenId,
    tradeNpcName,
    closeNpcTrade,
    closePetTravelPanel,
  ]);

  const rawGameSettings = useSelector((s: RootState) => s.game.settings);
  useGetProfileStateQuery(undefined, { skip: !auth.userId });
  const profileControls = useSelector((s: RootState) => s.profileState.controls);
  const profileSkillTree = useSelector((s: RootState) => s.profileState.skillTree);
  const playerMovementSpeed = useMemo(() => getPlayerMovementSpeed(profileSkillTree), [profileSkillTree]);
  const gameInventory = useSelector((s: RootState) => s.game.gameInventory);
  const backpackSlots = useSelector((s: RootState) => s.game.backpackSlots);
  const gameInventoryRef = useRef(gameInventory);
  const backpackSlotsRef = useRef(backpackSlots);
  gameInventoryRef.current = gameInventory;
  backpackSlotsRef.current = backpackSlots;
  useEffect(() => {
    gameBus.emit('game:inventory_changed', { items: gameInventory });
  }, [gameInventory]);
  const gameSettings: GameSettingsState = {
    ...rawGameSettings,
    masterVolume: typeof rawGameSettings.masterVolume === 'number' ? rawGameSettings.masterVolume : 1,
    audioEnabled: rawGameSettings.audioEnabled !== false,
    audioVolume: typeof rawGameSettings.audioVolume === 'number' ? rawGameSettings.audioVolume : 0.6,
    musicEnabled: rawGameSettings.musicEnabled !== false,
    musicVolume: typeof rawGameSettings.musicVolume === 'number' ? rawGameSettings.musicVolume : 0.1,
    musicPlaybackMode: rawGameSettings.musicPlaybackMode ?? 'shuffle',
    musicBackgroundPlayback: rawGameSettings.musicBackgroundPlayback !== false,
    uiLanguage: rawGameSettings.uiLanguage === 'zh' || rawGameSettings.uiLanguage === 'en' ? rawGameSettings.uiLanguage : 'system',
    pathLineEnabled: Boolean(rawGameSettings.pathLineEnabled),
    agentBrainEnabled: rawGameSettings.agentBrainEnabled !== false,
  };
  const gameSettingsRef = useRef(gameSettings);
  gameSettingsRef.current = gameSettings;

  const [saveGameSave] = useSaveGameSaveMutation();
  const [deleteGameSave] = useDeleteGameSaveMutation();
  const [updateProfileControls] = useUpdateProfileControlsMutation();
  const currentProfileForSaveDelete = useSelector((s: RootState) => s.profile.profile);
  useEffect(() => {
    setActiveInputBindings(profileControls);
    sceneRef.current?.applyInputBindings?.();
  }, [profileControls]);

  useEffect(() => {
    sceneRef.current?.playerSystem?.setMovementSpeed?.(playerMovementSpeed);
    sceneRef.current?.player?.setMovementSpeed?.(playerMovementSpeed);
  }, [playerMovementSpeed]);

  const handleControlsChange = useCallback(async (controls: InputBindingsState) => {
    setActiveInputBindings(controls);
    sceneRef.current?.applyInputBindings?.();
    await updateProfileControls({ controls }).unwrap();
  }, [updateProfileControls]);

  const handleSave = useCallback(async () => {
    if (!sceneRef.current) return;
    setIsSaving(true);
    try {
      const roomId = multiplay.multiplayRoomIdRef.current ?? undefined;
      const gameSave = sceneRef.current.getGameSaveData({
        previousSave: savedGameSaveRef.current,
        roomId,
        userId: auth.userId,
        username: auth.myDisplayName,
        settings: gameSettingsRef.current,
        inventory: {
          gameInventory: gameInventoryRef.current,
          hotbarSlots: hotbar.hotbarSlotsRef.current as any,
          backpackSlots: backpackSlotsRef.current,
        },
        npcInventories: npcChat.npcInventoriesRef.current,
      });
      const saveMeta = gameSave.saveMeta
        ?? savedGameSaveRef.current?.saveMeta
        ?? (sceneRef.current.initialGameSave as typeof gameSave | null | undefined)?.saveMeta
        ?? null;
      const result = await saveGameSave({ gameSave, roomId, saveMeta }).unwrap();
      savedGameSaveRef.current = result.gameSave;
      if (sceneRef.current) sceneRef.current.initialGameSave = result.gameSave;
      gameBus.emit('ui:show_message', { text: '保存成功。' });
    }
    catch (error) {
      console.warn('[IdleGame] manual save failed', error);
      gameBus.emit('ui:show_message', { text: '保存失败，请稍后再试。' });
    }
    finally { setIsSaving(false); }
  }, [auth.myDisplayName, auth.userId, hotbar.hotbarSlotsRef, multiplay.multiplayRoomIdRef, npcChat.npcInventoriesRef, saveGameSave]);

  const handleGameSettingsChange = useCallback((patch: Partial<GameSettingsState>) => {
    const nextSettings: GameSettingsState = {
      ...gameSettingsRef.current,
      ...patch,
    };
    dispatch(setGameSettings(nextSettings));

    const scene = sceneRef.current;
    if (typeof patch.timeMinute === 'number') {
      setCurrentTimeMinute(clampTimeMinute(nextSettings.timeMinute));
      scene?.commands?.execute(`/time set ${nextSettings.timeMinute}`);
    }
    if (patch.weather) scene?.commands?.execute(`/weather ${nextSettings.weather}`);
    if (typeof patch.physicsDebug === 'boolean') scene?.commands?.execute(`/debug ${nextSettings.physicsDebug ? 'on' : 'off'}`);
    if (typeof patch.pathLineEnabled === 'boolean') scene?.commands?.execute(`/pathline ${nextSettings.pathLineEnabled ? 'on' : 'off'}`);
    if (typeof patch.sleepThreshold === 'number') scene?.commands?.execute(`/sleep threshold ${nextSettings.sleepThreshold}`);
    if (typeof patch.agentBrainEnabled === 'boolean') scene?.commands?.execute(`/agent brain ${nextSettings.agentBrainEnabled ? 'on' : 'off'}`);
    if (typeof patch.fogOfWarEnabled === 'boolean') scene?.gameLightingSystem?.setFogOfWarEnabled?.(nextSettings.fogOfWarEnabled);
    if (
      typeof patch.masterVolume === 'number'
      || typeof patch.audioEnabled === 'boolean'
      || typeof patch.audioVolume === 'number'
      || typeof patch.musicEnabled === 'boolean'
      || typeof patch.musicVolume === 'number'
      || typeof patch.musicPlaybackMode === 'string'
      || typeof patch.musicBackgroundPlayback === 'boolean'
    ) {
      scene?.gameAudioSystem?.applySettings(nextSettings);
    }

    window.setTimeout(() => {
      gameBus.emit('game:save_requested', { reason: 'settings:game' });
    }, 0);
  }, [dispatch]);

  useEffect(() => {
    const unsubscribe = gameBus.on('game:settings_patch_requested', (patch) => {
      handleGameSettingsChange(patch);
    });
    return unsubscribe;
  }, [handleGameSettingsChange]);

  useEffect(() => {
    const unsubscribe = gameBus.on('game:mask_progress_reveal_ready', ({ mask, radius }) => {
      const nextRadius = Math.max(0, Number(radius ?? mask?.radius ?? 0));
      gameBus.emit('game:mask_changed', { radius: nextRadius, mask });
    });
    return unsubscribe;
  }, []);

  const handleNextMusicTrack = useCallback(() => {
    sceneRef.current?.gameAudioSystem?.nextMusicTrack();
  }, []);

  useEffect(() => {
    const unsubscribe = gameBus.on('game:save_delete_requested', async ({ roomId }) => {
      console.log('[SavingDelete][UI] event received', {
        roomId,
        currentProfileUserId: (currentProfileForSaveDelete as any)?.user ?? null,
        currentSaveMeta: (currentProfileForSaveDelete as any)?.gameSave?.saveMeta ?? null,
      });
      setIsSaving(true);
      try {
        console.log('[SavingDelete][UI] DELETE mutation start', { roomId });
        const result = await deleteGameSave({ roomId }).unwrap();
        console.log('[SavingDelete][UI] DELETE mutation success', {
          roomId,
          resultRoomId: result.gameSave?.worldStatus?.roomId,
          saveMeta: result.saveMeta ?? result.gameSave?.saveMeta ?? null,
          saveVersion: result.gameSave?.saveVersion,
        });
        if (currentProfileForSaveDelete) {
          dispatch(setProfile({
            ...currentProfileForSaveDelete,
            wallet: result.wallet,
            gameSave: result.gameSave,
          } as typeof currentProfileForSaveDelete));
        }
        npcChat.setDialog({
          visible: true,
          text: '世界存档已删除，正在载入新世界。',
          npcName: 'System',
        });
        setIsSaving(false);
        console.log('[SavingDelete][UI] reload scheduled after delete', {
          roomId,
          generationId: result.saveMeta?.generationId ?? result.gameSave?.saveMeta?.generationId,
        });
        gameBus.emit('game:save_delete_finished', { roomId, ok: true });
        window.setTimeout(() => window.location.reload(), 150);
      } catch (error) {
        console.log('[SavingDelete][UI] DELETE mutation failed', { roomId, error });
        gameBus.emit('game:save_delete_finished', { roomId, ok: false });
        const message = (error as { data?: { message?: string } })?.data?.message
          ?? '删除存档失败。';
        npcChat.setDialog({ visible: true, text: message, npcName: 'System' });
        setIsSaving(false);
      }
    });
    return unsubscribe;
  }, [currentProfileForSaveDelete, deleteGameSave, dispatch, npcChat.setDialog]);

  // ── 从 Redux 获取存档 + username ─────────────────────────────────────────
  const profile       = useSelector((s: RootState) => s.profile);
  const userState     = useSelector((s: RootState) => s.user.user);
  const systems       = useSelector((s: RootState) => s.system.systems);
  const selectedSystemId = useSelector((s: RootState) => s.system.selectedSystemId);
  const selectedSystem = useMemo(
    () => systems.find((system) => system._id === selectedSystemId && isMemberSystem(system)) || null,
    [systems, selectedSystemId]
  );
  const activeSelectedSystemId = selectedSystem ? selectedSystemId : null;
  const savedGameSave = useSelector((s: RootState) => s.profile.profile?.gameSave ?? null);
  const maskRadius = Math.max(0, Math.floor(Number(savedGameSave?.worldStatus?.temple?.fog?.radius || 0)));
  const maskProgressSource = savedGameSave?.worldStatus?.temple?.maskProgress;
  const maskProgressLevel = Math.max(0, Math.floor(Number(maskProgressSource?.level || 0)));
  const maskProgressRequired = Math.max(1, Math.floor(Number(maskProgressSource?.required || maskProgressLevel + 1)));
  const maskProgress = {
    level: maskProgressLevel,
    progress: Math.max(0, Math.min(maskProgressRequired, Number(maskProgressSource?.progress || 0))),
    required: maskProgressRequired,
  };
  const maskProgressBarDisplay = savedGameSave?.worldStatus?.configuration?.maskProgressBarDisplay === true;
  const savedGameSaveRef = useRef(savedGameSave);
  savedGameSaveRef.current = savedGameSave;
  const username = (profile as any)?.profile?.user?.username ?? '';
  const menuPlayerName = username || userState?.username || auth.myDisplayName || '玩家';
  const menuAvatarUrl = (profile as any)?.profile?.user?.image_url || userState?.image_url || '';
  const menuWalletCoins = Number((profile as any)?.profile?.wallet?.coins || 0);
  const [triggerGetSystemList] = useLazyGetSystemListQuery();
  // Current task HUD polling is disabled for now. System task updates already
  // arrive through the system SSE streams below, and the old 5s polling made
  // backend logs noisy while the in-game task panel is being redesigned.
  const activeSystemTasks: [] = [];

  const handleSystemRealtimeMessage = useCallback((event: MessageEvent) => {
    if (!activeSelectedSystemId) return;

    try {
      const payload = JSON.parse(event.data);
      const type = payload?.type as string | undefined;
      if (!type || type === 'connected') return;

      const eventSystemId = payload.systemId ? String(payload.systemId) : activeSelectedSystemId;
      if (eventSystemId !== activeSelectedSystemId) return;

      if (SYSTEM_MISSION_UPDATE_TYPES.has(type)) {
        void triggerGetSystemList();
        dispatch(systemRtkApi.util.invalidateTags([{ type: 'MemberTasks', id: eventSystemId }, 'SystemList']));
        return;
      }

      if (SYSTEM_MEMBER_TASK_EVENT_TYPES.has(type)) {
        dispatch(systemRtkApi.util.invalidateTags([{ type: 'MemberTasks', id: eventSystemId }]));
        return;
      }

      if (SYSTEM_DAILY_UPDATE_TYPES.has(type)) {
        dispatch(systemRtkApi.util.invalidateTags([{ type: 'DailyQuests', id: eventSystemId }]));
        return;
      }

      if (type === 'store_products_updated') {
        if (Array.isArray(payload.storeProducts)) {
          dispatch(patchSystemProducts({
            systemId: eventSystemId,
            storeProducts: payload.storeProducts as StoreProduct[],
          }));
        } else {
          void triggerGetSystemList();
        }
        dispatch(systemRtkApi.util.invalidateTags(['SystemList', { type: 'System', id: eventSystemId }]));
        return;
      }

      if (type === 'lottery_pools_updated') {
        if (Array.isArray(payload.lotteryPools)) {
          dispatch(patchSystemLotteryPools({
            systemId: eventSystemId,
            lotteryPools: payload.lotteryPools as LotteryPool[],
          }));
        } else {
          void triggerGetSystemList();
        }
        dispatch(systemRtkApi.util.invalidateTags(['SystemList', { type: 'System', id: eventSystemId }]));
        return;
      }

      if (type === 'system_deleted') {
        void triggerGetSystemList();
        setEscContentAction(null);
        setEscMenuOpen(false);
      }
    } catch (error) {
      console.error('[IdleGame] system realtime SSE parse error', error);
    }
  }, [activeSelectedSystemId, dispatch, triggerGetSystemList]);

  const handleEscMenuAction = useCallback((action: GameEscMenuAction) => {
    if (action === 'game-shop') {
      openGameShopContent();
      return;
    }
    if (action === 'multiplay') {
      setEscMenuOpen(false);
      multiplay.setMultiplayOpen(true);
      return;
    }
    if (action === 'backpack') {
      setEscMenuOpen(false);
      setBackpackOpen(true);
      return;
    }
    if (action === 'game-settings') {
      setEscMenuOpen(false);
      setGameSettingsOpen(true);
      return;
    }

    openEscContentAction(action);
  }, [multiplay.setMultiplayOpen, openEscContentAction, openGameShopContent]);

  const applyGameSettings = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const settings = gameSettingsRef.current;

    scene.commands?.execute(`/weather ${settings.weather}`);
    scene.commands?.execute(`/debug ${settings.physicsDebug ? 'on' : 'off'}`);
    scene.commands?.execute(`/pathline ${settings.pathLineEnabled ? 'on' : 'off'}`);
    scene.commands?.execute(`/sleep threshold ${settings.sleepThreshold}`);
    scene.commands?.execute(`/agent brain ${settings.agentBrainEnabled ? 'on' : 'off'}`);
    scene.gameLightingSystem?.setFogOfWarEnabled?.(settings.fogOfWarEnabled);
    scene.gameAudioSystem?.applySettings(settings);
  }, []);

  const refreshCommandCatalog = useCallback(() => {
    const scene = sceneRef.current;
    if (scene?.commands) registerGameSceneCommands(scene);
    setCommandCatalog(scene?.commands?.listCommands?.() ?? []);
  }, []);

  useEffect(() => {
    const handleReady = () => {
      applyGameSettings();
      sceneRef.current?.playerSystem?.setMovementSpeed?.(playerMovementSpeed);
      sceneRef.current?.player?.setMovementSpeed?.(playerMovementSpeed);
      refreshCommandCatalog();
    };
    const unsubscribeReady = gameBus.on('game:ready', handleReady);
    const unsubscribeStorylines = gameBus.on('storyline:runtime_loaded', refreshCommandCatalog);
    handleReady();
    return () => {
      unsubscribeReady();
      unsubscribeStorylines();
    };
  }, [applyGameSettings, playerMovementSpeed, refreshCommandCatalog]);

  useEffect(() => {
    if (gameSettingsOpen || npcChat.chat.open) refreshCommandCatalog();
  }, [gameSettingsOpen, npcChat.chat.open, refreshCommandCatalog]);

  useEffect(() => {
    const syncMusicVisibility = () => {
      sceneRef.current?.gameAudioSystem?.syncMusicBackgroundPlayback();
    };
    document.addEventListener('visibilitychange', syncMusicVisibility);
    window.addEventListener('focus', syncMusicVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncMusicVisibility);
      window.removeEventListener('focus', syncMusicVisibility);
    };
  }, []);


  // ── Phaser 启动（包含 game:ready 数据加载、键盘、自动存档） ───────────────
  usePhaserBoot({
    containerRef,
    sceneRef,
    gameRef,
    chatOpenRef,
    hotbarSlotsRef:    hotbar.hotbarSlotsRef,
    savedGameSaveRef,
    gameSettingsRef,
    gameInventoryRef,
    backpackSlotsRef,
    tokenRef:          auth.tokenRef,
    npcInventoriesRef: npcChat.npcInventoriesRef,
    userId:            auth.userId,
    username:          auth.myDisplayName,
    multiplayRoomIdRef: multiplay.multiplayRoomIdRef,
    setTimeStr:       () => undefined,
    setCurrentTimeMinute,
    setAvailableChests: chests.setAvailableChests,
  });

  // ── SSE：服务器推送宝箱生成 / 农田更新 / NPC 命令 ────────────────────────
  const sseUrl = auth.accessToken
    ? `/api/profile/game/events?token=${encodeURIComponent(auth.accessToken)}`
    : null;
  const systemUpdatesSseUrl = activeSelectedSystemId && auth.accessToken
    ? `${backendUrl}/system/${activeSelectedSystemId}/updates/events?token=${encodeURIComponent(auth.accessToken)}`
    : null;
  const systemTaskSseUrl = activeSelectedSystemId && auth.accessToken
    ? `${backendUrl}/system/${activeSelectedSystemId}/tasks/events?token=${encodeURIComponent(auth.accessToken)}`
    : null;

  useSSEWithReconnect({
    url: sseUrl,
    onMessage: syncBoundary.handleSseMessage,
  });

  useSSEWithReconnect({
    url: systemUpdatesSseUrl,
    enabled: Boolean(systemUpdatesSseUrl),
    onMessage: handleSystemRealtimeMessage,
  });

  useSSEWithReconnect({
    url: systemTaskSseUrl,
    enabled: Boolean(systemTaskSseUrl),
    onMessage: handleSystemRealtimeMessage,
  });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0d1f08' }}>
      {/* Phaser canvas */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }} />

      {/* HUD */}
      <HUD
        isSaving={isSaving}
        username={username}
        onSave={handleSave}
        showHints={!npcChat.dialog.visible && !npcChat.chat.open}
        maskRadius={maskRadius}
        maskProgress={maskProgress}
        maskProgressBarDisplay={maskProgressBarDisplay}
      />

      {debugOverlay.visible && (
        <div
          aria-label="player debug overlay"
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 1000,
            padding: '7px 9px',
            border: '2px solid #44aa44',
            borderRadius: 4,
            background: 'rgba(5, 12, 8, 0.88)',
            color: '#c7ff9f',
            fontFamily: '"Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.45,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 0 0 1px #163d16, 3px 3px 0 rgba(0,0,0,0.45)',
          }}
        >
          <div>{`x: ${debugOverlay.x} y: ${debugOverlay.y} facing: ${debugOverlay.facing}`}</div>
          <div>{`areaId: ${debugOverlay.areaId}`}</div>
          <div>{`fps: ${debugOverlay.fps}`}</div>
        </div>
      )}

      {false && !npcChat.chat.open && !npcChat.dialog.visible && (
        <button
          type="button"
          onClick={openGameShopContent}
          style={{
            position: 'absolute',
            top: 88,
            right: 16,
            zIndex: 210,
            border: '2px solid var(--px-border-gold)',
            borderRadius: 6,
            background: 'var(--px-surface2)',
            color: 'var(--px-gold)',
            padding: '7px 12px',
            fontSize: 13,
            fontFamily: '"Courier New", monospace',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          NPC 商店
        </button>
      )}

      {chests.availableChests.length > 0 && (
        <button
          onClick={chests.handleChestHudClick}
          title={`有 ${chests.availableChests.length} 个箱子在地图上\n点击定位`}
          style={{
            position:     'absolute',
            top:          48,
            left:         10,
            zIndex:       200,
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            background:   '#1a1208',
            border:       '2px solid #c8a850',
            borderRadius: 8,
            padding:      '5px 9px',
            boxShadow:    '0 0 10px #c8a85066',
            animation:    'chestPulse 1.8s ease-in-out infinite',
            cursor:       'pointer',
            userSelect:   'none',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>🎁</span>
          {chests.availableChests.length > 1 && (
            <span style={{
              fontSize:      11,
              fontFamily:    '"Courier New", monospace',
              color:         '#ffe57a',
              fontWeight:    'bold',
              letterSpacing: 0.5,
            }}>
              ×{chests.availableChests.length}
            </span>
          )}
        </button>
      )}
      <style>{`
        @keyframes chestPulse {
          0%,100% { box-shadow: 0 0 6px #c8a85066; }
          50%      { box-shadow: 0 0 16px #ffe57aaa; border-color: #ffe57a; }
        }
      `}</style>

      {/* NPC 对话框 */}
      <DialogBox
        visible={npcChat.dialog.visible}
        npcName={npcChat.dialog.npcName}
        text={npcChat.dialog.text}
      />

      <motion.div
        key="gameplay-hud"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: 0, zIndex: 200, pointerEvents: 'none' }}
      >
        {/* 对话按钮 — 动态显示最近 NPC 名字；附近无人时按钮变灰但仍可点击（点击会提示） */}
        {!npcChat.chat.open && !npcChat.dialog.visible && (
          <button
            onClick={() => sceneRef.current?.triggerInteract()}
            style={{
              position:      'absolute',
              bottom:        90,
              right:         16,
              zIndex:        200,
              background:    nearbyNpc ? '#4a3500' : '#2a1f00',
              color:         nearbyNpc ? '#fffde8' : '#9a8866',
              border:        `2px solid ${nearbyNpc ? '#c8a850' : '#6a5530'}`,
              borderRadius:  6,
              padding:       '6px 18px',
              fontSize:      13,
              fontFamily:    '"Courier New", monospace',
              cursor:        'pointer',
              letterSpacing: 0.5,
              pointerEvents: 'auto',
            }}
          >
            {nearbyNpc ? `💬 [Enter] 和${nearbyNpc}对话` : '💬 附近没有人'}
          </button>
        )}

        {/* 快捷栏 */}
        <VitalBars hunger={playerHunger} health={playerHealth} />
        <div style={{ pointerEvents: 'auto' }}>
          <Hotbar
            selected={hotbar.selectedSlot}
            onChange={hotbar.handleSlotChange}
            hotbarSlots={hotbar.hotbarSlots}
          />
        </div>
      </motion.div>

      {/* NPC 聊天输入框 */}
      {npcChat.chat.open && (
        <ChatInput
          npcName={npcChat.chat.npcName}
          initialValue={npcChat.chat.initialValue}
          commands={commandCatalog}
          onSend={npcChat.handleSendMessage}
          onCancel={npcChat.handleCancelChat}
        />
      )}

      {/* 宝箱奖励弹窗 */}
      {chests.pendingChest && (
        <ChestRewardUI
          rewards={chests.pendingChest.rewards}
          onConfirm={chests.handleChestConfirm}
        />
      )}

      {npcChat.storylineChoice && (
        <StorylineChoiceModal
          choice={npcChat.storylineChoice}
          onSelect={npcChat.handleStorylineChoiceSelect}
        />
      )}

      {/* 联机面板 */}
      <MultiplayPanel
        isOpen={multiplay.multiplayOpen}
        onToggle={() => multiplay.setMultiplayOpen(o => !o)}
        onClose={() => multiplay.setMultiplayOpen(false)}
        showToggle={false}
        status={multiplay.multiplayStatus}
        roomId={multiplay.multiplayRoomId}
        peerInfo={multiplay.multiplayPeer}
        error={multiplay.multiplayError}
        onHost={multiplay.handleMultiplayHost}
        onJoin={multiplay.handleMultiplayJoin}
        onDisconnect={multiplay.handleMultiplayDisconnect}
      />

      <GameEscMenu
        open={escMenuOpen}
        playerName={menuPlayerName}
        avatarUrl={menuAvatarUrl}
        walletCoins={menuWalletCoins}
        systems={systems}
        selectedSystemId={selectedSystemId}
        activeTasks={activeSystemTasks}
        onClose={() => setEscMenuOpen(false)}
        onAction={handleEscMenuAction}
      />

      <GameEscContentModal
        open={Boolean(escContentAction)}
        action={escContentAction}
        profile={(profile as any)?.profile ?? null}
        playerName={menuPlayerName}
        avatarUrl={menuAvatarUrl}
        systems={systems}
        selectedSystemId={selectedSystemId}
        roomId={multiplay.multiplayRoomId}
        sceneRef={sceneRef}
        onClose={() => {
          setEscContentAction(null);
          chatOpenRef.current = false;
          sceneRef.current?.resumeInput();
        }}
        onOpenAction={setEscContentAction}
      />

      <GameEscCursor active />

      <GameSettingsModal
        open={gameSettingsOpen}
        settings={gameSettings}
        controls={profileControls}
        currentTimeMinute={currentTimeMinute ?? gameSettings.timeMinute}
        commands={commandCatalog}
        onChange={handleGameSettingsChange}
        onControlsChange={handleControlsChange}
        onNextMusicTrack={handleNextMusicTrack}
        onClose={() => setGameSettingsOpen(false)}
      />

      <GameShopModal
        open={gameShopOpen}
        roomId={multiplay.multiplayRoomId}
        onClose={closeGameShopContent}
      />

      {/* NPC 确认弹窗 */}
      <StorageChestModal
        open={Boolean(storageChestOpenId)}
        chestId={storageChestOpenId}
        roomId={multiplay.multiplayRoomId}
        sceneRef={sceneRef}
        onClose={() => setStorageChestOpenId(null)}
      />

      <BuildingPanel
        open={Boolean(buildingPanelId)}
        buildingId={buildingPanelId}
        sceneRef={sceneRef}
        onClose={() => {
          setBuildingPanelId(null);
          chatOpenRef.current = false;
          sceneRef.current?.resumeInput();
        }}
      />

      <PetTravelPanel
        open={Boolean(petTravelPanel)}
        pet={petTravelPanel}
        roomId={multiplay.multiplayRoomId}
        absoluteGameMinutes={savedGameSave?.worldStatus?.time?.absoluteGameMinutes ?? 0}
        onClose={closePetTravelPanel}
      />

      <BackpackModal
        open={backpackOpen}
        onClose={() => setBackpackOpen(false)}
      />

      {tradeNpcName && (
        <NpcTradeModal
          open
          npcName={tradeNpcName}
          roomId={multiplay.multiplayRoomId}
          sceneRef={sceneRef}
          onClose={closeNpcTrade}
        />
      )}

      {npcChat.npcConfirm && (
        <div style={{
          position:     'absolute',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%, -50%)',
          zIndex:       300,
          background:   '#1a120a',
          border:       '2px solid #c8a850',
          borderRadius: 8,
          padding:      '18px 24px',
          minWidth:     220,
          boxShadow:    '0 4px 24px #0008',
          textAlign:    'center',
          fontFamily:   '"Courier New", monospace',
          color:        '#fffde8',
        }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5 }}>
            💬 {npcChat.npcConfirm.question}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={npcChat.handleNpcConfirmYes}
              style={{
                background: '#2d5a1b', color: '#d4f0a0',
                border: '1px solid #6ab03a', borderRadius: 4,
                padding: '5px 18px', cursor: 'pointer', fontSize: 13,
                fontFamily: 'inherit',
              }}
            >✓ 确认</button>
            <button
              onClick={npcChat.handleNpcConfirmNo}
              style={{
                background: '#5a1b1b', color: '#f0a0a0',
                border: '1px solid #b03a3a', borderRadius: 4,
                padding: '5px 18px', cursor: 'pointer', fontSize: 13,
                fontFamily: 'inherit',
              }}
            >✗ 取消</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemIdleGame;
