import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_GAME_TIME_MINUTE, MINS_PER_DAY } from '../../Pages/Dashboard/component/SystemIdleGame/constants';
import type { UiLanguageSetting } from '../../i18n';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GameInventoryItem {
  itemId:       string;
  quantity:     number;
  instanceData?: {
    durability?: number | null;
    freshness?:  number | null;
    customMeta?: Record<string, unknown>;
  };
}

/** A single draggable item in a slot (backpack or hotbar). */
export interface SlotItem {
  itemId:   string;
  quantity: number;
  instanceData?: GameInventoryItem['instanceData'];
}

export type FarmTileState =
  | 'tilled' | 'watered' | 'seeded' | 'growing' | 'ready' | 'harvested';

export interface FarmTile {
  worldId?:      string;
  tx:           number;
  ty:           number;
  state:        FarmTileState;
  cropId?:      string | null;
  plantRow?:    number;
  numStages?:   number;
  plantedAtGameMinute?:   number | null;
  readyAtGameMinute?:     number | null;
  waterExpiresAtGameMinute?: number | null;
}

export type CreatureStateName =
  | 'wandering' | 'moving_to_water' | 'drinking' | 'moving_to_nest' | 'laying';

export interface CreatureState {
  creatureId: string;
  type:       'chicken';
  x:          number;
  y:          number;
  worldId?:   string;
  thirst:     number;
  growth:     number;
  state:      CreatureStateName;
}

// ── Slot zone references ───────────────────────────────────────────────────────
export type SlotZone = 'hotbar' | 'backpack';

export interface SlotRef {
  zone:  SlotZone;
  index: number;
}

export type GameWeatherSetting = 'clear' | 'rain' | 'storm' | 'fog';
export type MusicPlaybackMode = 'shuffle' | 'sequence' | 'repeat-one';

export interface GameSettingsState {
  timeMinute: number;
  weather: GameWeatherSetting;
  uiLanguage: UiLanguageSetting;
  masterVolume: number;
  audioEnabled: boolean;
  audioVolume: number;
  musicEnabled: boolean;
  musicVolume: number;
  musicPlaybackMode: MusicPlaybackMode;
  musicBackgroundPlayback: boolean;
  physicsDebug: boolean;
  pathLineEnabled: boolean;
  sleepThreshold: number;
  agentBrainEnabled: boolean;
  fogOfWarEnabled: boolean;
}

// ── Slice State ───────────────────────────────────────────────────────────────

export const HOTBAR_SIZE  = 10;
export const BACKPACK_SIZE = 40;

export interface GameReduxState {
  gameInventory: GameInventoryItem[];
  /** 10 hotbar slots — the in-game equipment bar */
  hotbarSlots:   (SlotItem | null)[];
  /** 40 backpack slots — the storage grid */
  backpackSlots: (SlotItem | null)[];
  farmTiles:     FarmTile[];
  creatures:     CreatureState[];
  /** NPC inventories — keyed by NPC name, value is itemId → quantity */
  npcInventories: Record<string, Record<string, number>>;
  settings: GameSettingsState;
}

const initialState: GameReduxState = {
  gameInventory:  [],
  hotbarSlots:    Array(HOTBAR_SIZE).fill(null),
  backpackSlots:  Array(BACKPACK_SIZE).fill(null),
  farmTiles:      [],
  creatures:      [],
  npcInventories: {},
  settings: {
    timeMinute:     DEFAULT_GAME_TIME_MINUTE,
    weather:        'clear',
    uiLanguage:     'system',
    masterVolume:   1,
    audioEnabled:   true,
    audioVolume:    0.6,
    musicEnabled:   true,
    musicVolume:    0.1,
    musicPlaybackMode: 'shuffle',
    musicBackgroundPlayback: true,
    physicsDebug:   false,
    pathLineEnabled: false,
    sleepThreshold: 0,
    agentBrainEnabled: true,
    fogOfWarEnabled: true,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Rebuild flat gameInventory from both slot arrays. */
function rebuildInventory(hotbar: (SlotItem | null)[], backpack: (SlotItem | null)[]): GameInventoryItem[] {
  const map = new Map<string, GameInventoryItem>();
  for (const s of [...hotbar, ...backpack]) {
    if (!s || s.quantity <= 0) continue;
    const key = slotKey(s);
    const existing = map.get(key);
    if (existing) existing.quantity += s.quantity;
    else map.set(key, { itemId: s.itemId, quantity: s.quantity, instanceData: s.instanceData });
  }
  return Array.from(map.values());
}

function slotKey(item: Pick<SlotItem, 'itemId' | 'instanceData'>): string {
  const meta = item.instanceData?.customMeta || {};
  const instanceId = meta.instanceId || meta.houseId;
  return instanceId ? `${item.itemId}:${String(instanceId)}` : item.itemId;
}

function inventoryToSlot(item: GameInventoryItem): SlotItem {
  return { itemId: item.itemId, quantity: item.quantity, instanceData: item.instanceData };
}

function clampTimeMinute(value: number): number {
  return Math.max(0, Math.min(MINS_PER_DAY - 1, Math.round(value)));
}

// ── Slice ─────────────────────────────────────────────────────────────────────

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    /**
     * Sync both raw inventory AND hotbar/backpack slots from a backend inventory array.
     * Use this instead of setGameInventory so hotbar display stays accurate.
     * Preserves existing slot positions where itemId matches; fills empties from new data.
     */
    setGameInventory(state, action: PayloadAction<GameInventoryItem[]>) {
      const incoming = action.payload;
      state.gameInventory = incoming;

      // Update quantities in existing slots (or null out slots whose item hit 0)
      for (const arr of [state.hotbarSlots, state.backpackSlots]) {
        for (let i = 0; i < arr.length; i++) {
          const slot = arr[i];
          if (!slot) continue;
          const updated = incoming.find(it => slotKey(it) === slotKey(slot));
          if (!updated || updated.quantity <= 0) {
            arr[i] = null;          // item gone — clear slot
          } else {
            arr[i] = inventoryToSlot(updated);
          }
        }
      }

      // Place any new items not yet in any slot
      for (const item of incoming) {
        if (item.quantity <= 0) continue;
        const inHotbar  = state.hotbarSlots.some(s => s && slotKey(s) === slotKey(item));
        const inBackpack = state.backpackSlots.some(s => s && slotKey(s) === slotKey(item));
        if (inHotbar || inBackpack) continue;
        // Slot it in first empty hotbar, then backpack
        const hi = state.hotbarSlots.findIndex(s => s === null);
        if (hi >= 0) { state.hotbarSlots[hi] = inventoryToSlot(item); continue; }
        const bi = state.backpackSlots.findIndex(s => s === null);
        if (bi >= 0) { state.backpackSlots[bi] = inventoryToSlot(item); }
      }
    },

    /**
     * Load inventory from backend into slots.
     * Priority: hotbar first (slots 0-9), then backpack.
     * Call this on game-ready after getGameInventory().
     */
    initSlotsFromInventory(state, action: PayloadAction<GameInventoryItem[]>) {
      state.gameInventory = action.payload;
      state.hotbarSlots   = Array(HOTBAR_SIZE).fill(null);
      state.backpackSlots = Array(BACKPACK_SIZE).fill(null);
      let hi = 0, bi = 0;
      for (const item of action.payload) {
        if (hi < HOTBAR_SIZE) {
          state.hotbarSlots[hi++] = inventoryToSlot(item);
        } else if (bi < BACKPACK_SIZE) {
          state.backpackSlots[bi++] = inventoryToSlot(item);
        }
      }
    },

    restoreInventorySnapshot(
      state,
      action: PayloadAction<{
        gameInventory: GameInventoryItem[];
        hotbarSlots: (SlotItem | null)[];
        backpackSlots: (SlotItem | null)[];
      }>,
    ) {
      state.gameInventory = action.payload.gameInventory;
      state.hotbarSlots = action.payload.hotbarSlots.slice(0, HOTBAR_SIZE);
      while (state.hotbarSlots.length < HOTBAR_SIZE) state.hotbarSlots.push(null);
      state.backpackSlots = action.payload.backpackSlots.slice(0, BACKPACK_SIZE);
      while (state.backpackSlots.length < BACKPACK_SIZE) state.backpackSlots.push(null);
    },

    restoreNpcInventoriesSnapshot(state, action: PayloadAction<Record<string, Record<string, number>>>) {
      state.npcInventories = action.payload || {};
    },

    /**
     * Pick up an item: hotbar first, then backpack (Minecraft style).
     * Stacks with existing slot of same itemId before claiming a new slot.
     */
    addItemToBackpack(state, action: PayloadAction<SlotItem>) {
      const { quantity } = action.payload;
      if (quantity === 0) return;
      const incomingKey = slotKey(action.payload);

      // 1. Stack in existing hotbar slot
      const hotbarStack = state.hotbarSlots.findIndex(s => s && slotKey(s) === incomingKey);
      if (hotbarStack >= 0) {
        state.hotbarSlots[hotbarStack]!.quantity += quantity;
        if (state.hotbarSlots[hotbarStack]!.quantity <= 0) {
          state.hotbarSlots[hotbarStack] = null;   // slot depleted — clear it
        }
        state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
        return;
      }

      // 2. Stack in existing backpack slot
      const packStack = state.backpackSlots.findIndex(s => s && slotKey(s) === incomingKey);
      if (packStack >= 0) {
        state.backpackSlots[packStack]!.quantity += quantity;
        if (state.backpackSlots[packStack]!.quantity <= 0) {
          state.backpackSlots[packStack] = null;   // slot depleted — clear it
        }
        state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
        return;
      }

      // Removing an item that is not present should not create a negative stack.
      if (quantity < 0) return;

      // 3. First empty hotbar slot
      const hotbarEmpty = state.hotbarSlots.findIndex(s => s === null);
      if (hotbarEmpty >= 0) {
        state.hotbarSlots[hotbarEmpty] = action.payload;
        state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
        return;
      }

      // 4. Overflow to backpack
      const packEmpty = state.backpackSlots.findIndex(s => s === null);
      if (packEmpty >= 0) {
        state.backpackSlots[packEmpty] = action.payload;
      }
      state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
    },

    setGameTimeMinute(state, action: PayloadAction<number>) {
      state.settings.timeMinute = clampTimeMinute(action.payload);
    },

    setGameSettings(state, action: PayloadAction<Partial<GameSettingsState>>) {
      const next = action.payload;
      if (typeof next.timeMinute === 'number') {
        state.settings.timeMinute = clampTimeMinute(next.timeMinute);
      }
      if (
        next.weather === 'clear'
        || next.weather === 'rain'
        || next.weather === 'storm'
        || next.weather === 'fog'
      ) {
        state.settings.weather = next.weather;
      }
      if (next.uiLanguage === 'system' || next.uiLanguage === 'zh' || next.uiLanguage === 'en') {
        state.settings.uiLanguage = next.uiLanguage;
      }
      if (typeof next.masterVolume === 'number') {
        state.settings.masterVolume = Math.max(0, Math.min(1, next.masterVolume));
      }
      if (typeof next.audioEnabled === 'boolean') {
        state.settings.audioEnabled = next.audioEnabled;
      }
      if (typeof next.audioVolume === 'number') {
        state.settings.audioVolume = Math.max(0, Math.min(1, next.audioVolume));
      }
      if (typeof next.musicEnabled === 'boolean') {
        state.settings.musicEnabled = next.musicEnabled;
      }
      if (typeof next.musicVolume === 'number') {
        state.settings.musicVolume = Math.max(0, Math.min(1, next.musicVolume));
      }
      if (
        next.musicPlaybackMode === 'shuffle'
        || next.musicPlaybackMode === 'sequence'
        || next.musicPlaybackMode === 'repeat-one'
      ) {
        state.settings.musicPlaybackMode = next.musicPlaybackMode;
      }
      if (typeof next.musicBackgroundPlayback === 'boolean') {
        state.settings.musicBackgroundPlayback = next.musicBackgroundPlayback;
      }
      if (typeof next.physicsDebug === 'boolean') {
        state.settings.physicsDebug = next.physicsDebug;
      }
      if (typeof next.pathLineEnabled === 'boolean') {
        state.settings.pathLineEnabled = next.pathLineEnabled;
      }
      if (typeof next.sleepThreshold === 'number') {
        state.settings.sleepThreshold = Math.max(0, Math.min(1, next.sleepThreshold));
      }
      if (typeof next.agentBrainEnabled === 'boolean') {
        state.settings.agentBrainEnabled = next.agentBrainEnabled;
      }
      if (typeof next.fogOfWarEnabled === 'boolean') {
        state.settings.fogOfWarEnabled = next.fogOfWarEnabled;
      }
    },

    setGameWeather(state, action: PayloadAction<GameWeatherSetting>) {
      state.settings.weather = action.payload;
    },

    setGamePhysicsDebug(state, action: PayloadAction<boolean>) {
      state.settings.physicsDebug = action.payload;
    },

    setGamePathLineEnabled(state, action: PayloadAction<boolean>) {
      state.settings.pathLineEnabled = action.payload;
    },

    setGameSleepThreshold(state, action: PayloadAction<number>) {
      state.settings.sleepThreshold = Math.max(0, Math.min(1, action.payload));
    },

    setGameAgentBrainEnabled(state, action: PayloadAction<boolean>) {
      state.settings.agentBrainEnabled = action.payload;
    },

    setGameFogOfWarEnabled(state, action: PayloadAction<boolean>) {
      state.settings.fogOfWarEnabled = action.payload;
    },

    /**
     * Move/swap items between any two slots (hotbar ↔ backpack, within same zone).
     * This is the drag-and-drop action.
     */
    moveSlot(state, action: PayloadAction<{ from: SlotRef; to: SlotRef }>) {
      const { from, to } = action.payload;
      const fromArr = from.zone === 'hotbar' ? state.hotbarSlots : state.backpackSlots;
      const toArr   = to.zone   === 'hotbar' ? state.hotbarSlots : state.backpackSlots;

      if (from.zone === to.zone && from.index === to.index) return; // same slot, no-op

      // Swap contents
      const temp          = toArr[to.index];
      toArr[to.index]     = fromArr[from.index];
      fromArr[from.index] = temp;

      state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
    },

    // ── Farm & creature actions (unchanged) ───────────────────────────────────

    upsertGameInventoryItem(state, action: PayloadAction<{ itemId: string; quantity: number }>) {
      const { itemId, quantity } = action.payload;
      const existing = state.gameInventory.find(i => i.itemId === itemId);
      if (existing) {
        existing.quantity = Math.max(0, existing.quantity + quantity);
        state.gameInventory = state.gameInventory.filter(i => i.quantity > 0);
      } else if (quantity > 0) {
        state.gameInventory.push({ itemId, quantity });
      }
    },

    setFarmTiles(state, action: PayloadAction<FarmTile[]>) {
      state.farmTiles = action.payload;
    },

    upsertFarmTile(state, action: PayloadAction<FarmTile>) {
      const tile = action.payload;
      const idx = state.farmTiles.findIndex(t => (t.worldId ?? 'world:main') === (tile.worldId ?? 'world:main') && t.tx === tile.tx && t.ty === tile.ty);
      if (idx >= 0) state.farmTiles[idx] = tile;
      else state.farmTiles.push(tile);
    },

    removeFarmTile(state, action: PayloadAction<{ worldId?: string; tx: number; ty: number }>) {
      const { worldId, tx, ty } = action.payload;
      state.farmTiles = state.farmTiles.filter(t => !((t.worldId ?? 'world:main') === (worldId ?? 'world:main') && t.tx === tx && t.ty === ty));
    },

    setCreatures(state, action: PayloadAction<CreatureState[]>) {
      state.creatures = action.payload;
    },

    // ── Hotbar slot management ─────────────────────────────────────────────────
    /** Remove the item from a specific hotbar slot (used by Q-drop). */
    clearHotbarSlot(state, action: PayloadAction<number>) {
      state.hotbarSlots[action.payload] = null;
      state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
    },

    // ── NPC inventory ──────────────────────────────────────────────────────────
    setNpcInventory(state, action: PayloadAction<{ npcName: string; inv: Record<string, number> }>) {
      state.npcInventories[action.payload.npcName] = action.payload.inv;
    },

    addItemToNpcInventory(state, action: PayloadAction<{ npcName: string; itemId: string; qty: number }>) {
      const { npcName, itemId, qty } = action.payload;
      if (!state.npcInventories[npcName]) state.npcInventories[npcName] = {};
      state.npcInventories[npcName][itemId] = (state.npcInventories[npcName][itemId] ?? 0) + qty;
    },

    removeItemFromNpcInventory(state, action: PayloadAction<{ npcName: string; itemId: string; qty: number }>) {
      const { npcName, itemId, qty } = action.payload;
      if (!state.npcInventories[npcName]) return;
      const current = state.npcInventories[npcName][itemId] ?? 0;
      const next = Math.max(0, current - qty);
      if (next === 0) {
        delete state.npcInventories[npcName][itemId];
      } else {
        state.npcInventories[npcName][itemId] = next;
      }
    },
  },
});

export const {
  setGameInventory,
  upsertGameInventoryItem,
  initSlotsFromInventory,
  restoreInventorySnapshot,
  restoreNpcInventoriesSnapshot,
  addItemToBackpack,
  setGameSettings,
  setGameTimeMinute,
  setGameWeather,
  setGamePhysicsDebug,
  setGamePathLineEnabled,
  setGameSleepThreshold,
  setGameAgentBrainEnabled,
  setGameFogOfWarEnabled,
  moveSlot,
  clearHotbarSlot,
  setFarmTiles,
  upsertFarmTile,
  removeFarmTile,
  setCreatures,
  setNpcInventory,
  addItemToNpcInventory,
  removeItemFromNpcInventory,
} = gameSlice.actions;

export default gameSlice.reducer;
