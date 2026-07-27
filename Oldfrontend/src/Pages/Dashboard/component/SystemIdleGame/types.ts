/** Shared TypeScript interfaces for the idle game. */

import type { ChestRewardItem } from '../../../../Types/Profile';
import type { GameWeatherSetting } from '../../../../Redux/Features/gameSlice';
import type { NpcMindState } from './shared/worldStateTypes';

export type ToolType = 'empty' | 'water' | 'axe' | 'scythe';

// ─── Legacy world-state projection for feature restore compatibility ──────────
export interface BedSaveState  { id?: string; color: 'green' | 'blue' | 'pink'; x: number; y: number; worldId?: string }
export interface NestSaveState { x: number; y: number; worldId?: string; state: 'empty' | 'has_egg' }
export interface GameWorldSettingsState {
  timeMinute: number;
  weather: GameWeatherSetting;
  physicsDebug: boolean;
  sleepThreshold: number;
  agentBrainEnabled: boolean;
  fogOfWarEnabled?: boolean;
}
export interface GameWorldState {
  schemaVersion: 1;
  beds:  BedSaveState[];
  nests: NestSaveState[];
  npcMinds?: Record<string, NpcMindState>;
  settings?: GameWorldSettingsState;
}

// ─── General world-object interaction (F key) ─────────────────────────────────
/** Any object in the world that the player can interact with (F key). */
export interface Interactable {
  isNearPlayer(px: number, py: number, radius?: number): boolean;
  interact(): void;
  /** Optional: called every frame with player position to update proximity hints. */
  update?(px: number, py: number): void;
}
export type Direction = 'down' | 'up' | 'left' | 'right';

// ─── Hotbar ──────────────────────────────────────────────────────────────────
export interface HotbarSlotDef {
  tool:   ToolType;
  label:  string;
  /** source x in Basic tools and meterials.png (-1 = no icon) */
  iconX:  number;
  iconY:  number;
}

export const HOTBAR_DEFS: HotbarSlotDef[] = [
  { tool: 'empty',  label: '空手',  iconX: -1, iconY: -1 },
  { tool: 'water',  label: '水壶',  iconX:  0, iconY:  0 },  // tool icon 1 = water
  { tool: 'axe',    label: '斧头',  iconX: 16, iconY:  0 },  // tool icon 2 = axe
  { tool: 'scythe', label: '锄头',  iconX: 32, iconY:  0 },  // tool icon 3 = hoe
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
];

// ─── NPC Memory / AI ─────────────────────────────────────────────────────────
export interface NpcMemoryEntry {
  /** Unique identifier (UUID). */
  id:           string;
  absoluteGameMinutes:     number;
  text:         string;
  source:       'npc' | 'player' | 'event' | 'reflection';
  /** Poignancy / importance score 1-10 (higher = more important). */
  importance:   number;
  /** Extracted keywords for relevance scoring. */
  keywords:     string[];
  /** absoluteGameMinutes when this memory was last retrieved. */
  lastAccessed: number;
}

// ─── NPC Action System (extensible) ─────────────────────────────────────────

/**
 * Where the NPC should move to.  Resolved at execution time by ActionExecutor
 * so the LLM only outputs semantic targets, not raw pixel coordinates.
 */
export type ActionTarget =
  | { kind: 'coords';   x: number; y: number; worldId?: string }
  | { kind: 'named';    place: 'room' | 'door' | 'pond' | string; ref?: string; x?: number; y?: number; worldId?: string }
  | { kind: 'entity';   ref: 'player' | 'npc' }
  | { kind: 'relative'; dx: number; dy: number };

export type NpcActionType =
  | 'say' | 'move' | 'idle'              // core
  | 'emote'                               // future: animation key
  | 'water' | 'eat' | 'drink' | 'nuzzle' // future: tool / animal
  | 'pickup_item'                         // navigate to WorldItem, pick it up
  | 'drop_item'                           // drop item from NPC inventory to world
  | 'chop_tree'                           // navigate to tree and chop it
  | 'pick_fruit'                          // navigate to a ripe fruit tree and pick food
  | 'use_skill'                           // execute durable NPC knowledge skill
  | 'remember_food_sources'                // remember visible food source coordinates for future hunger
  | 'talk_with'                           // stand beside another NPC and face them while talking
  | 'enter_house'                         // walk to a house door on the active map
  | 'remember_home_house'                 // remember a house as this NPC's home
  | 'learn_npc_skill'                     // learn/enable a durable function skill
  | 'assign_farm_plot'                    // assign claimed farm plot refs to a skill
  | 'till_tile' | 'water_tile' | 'plant_crop' | 'harvest_crop'
  | 'ask_confirm'                         // ask player yes/no before proceeding
  | 'follow_player'                       // NPC follows the player continuously
  | 'stop_follow'                         // NPC stops following player
  | 'dispatch';                           // NPC goes on a mission, returns 10s later with loot+story

export interface NpcAction {
  type:      NpcActionType;
  text?:     string;       // for 'say' / 'ask_confirm'
  target?:   ActionTarget; // for 'move' / 'chop_tree' etc.
  duration?: number;       // real seconds
  tool?:     string;       // future: 'watering_can' etc.
  emote?:    string;       // future: 'wave' | 'bow' etc.
  itemId?:   string;       // for 'pickup_item' / 'drop_item' / 'eat'
  treeId?:   string;       // for 'chop_tree' / 'pick_fruit'
  foodSources?: Array<{ id?: string; treeId?: string; x: number; y: number; worldId?: string; itemId?: string; label?: string }>; // for remember_food_sources
  houseId?:  string;       // for 'enter_house' / 'remember_home_house'
  roomId?:   string;       // legacy house/interior target hint; not used by the active Tiled map
  question?: string;       // for 'ask_confirm'
  skillId?:  string;       // for 'use_skill'
  plots?:    Array<{ worldId?: string; tx: number; ty: number }>; // for assign_farm_plot
  desiredCropId?: string | null; // for assign_farm_plot
  targetNpcName?: string;  // for 'talk_with'
  tx?:       number;       // for farm actions
  ty?:       number;       // for farm actions
}

/** Backend chat response — LLM decides both reply text and actions. */
export interface NpcChatResponse {
  reply:   string;
  actions: NpcAction[];
  mcp?: {
    enabled: boolean;
    toolCalls: Array<{
      name?: string;
      ok?: boolean;
      action?: NpcAction | null;
    }>;
  };
  routing?: {
    responder: 'local' | 'fast' | 'situated' | 'action' | string;
    intent: string;
    usedLlm: boolean;
    usedTools: boolean;
    memoryWrite: 'queued' | 'synced' | 'skipped' | string;
  };
}

/** SSE npc_command event payload — server can push NPC behavior at any time. */
export interface NpcCommandPayload {
  npcName:       string;
  actions:       NpcAction[];
  announcement?: string;
}

/** @deprecated Use NpcAction instead */
export type NpcPlannedAction = NpcAction;

export interface NpcPlan {
  actions: NpcAction[];
}

// ─── Scene ↔ React bridge ─────────────────────────────────────────────────────
export interface GameCallbacks {
  onTimeUpdate?: (absoluteGameMinutes: number, timeStr: string) => void;
  onNpcSpeak?:   (text: string, npcName: string)   => void;
  onToolChange?: (tool: ToolType)                  => void;
  /** Called when player presses E near an NPC */
  onInteract?:   (npcName: string)                 => void;
  /** Called once at the end of GameScene.create() — safe to access NPC entities */
  onGameReady?:  () => void;
  /** Called when player presses F near a chest — show reward UI */
  onChestInteract?: (chestId: string, rewards: { coins: number; items: ChestRewardItem[] }) => void;
  /** Returns the current auth token so Phaser entities can call authed APIs */
  getAuthToken?: () => string | null;
  /** Called when player picks up a world item (fruit, etc.) → add to inventory */
  onItemPickup?: (itemKey: string, quantity: number) => void;
  /**
   * Called when the player performs a farming action.
   * till = scythe on grass, water = watering_can on tilled tile,
   * plant = seed on tilled/watered tile, harvest = F on ready tile.
   */
  onFarmAction?: (
    action: 'till' | 'water' | 'plant' | 'harvest',
    tx: number,
    ty: number,
    itemId?: string,
  ) => void;
  /** NPC arrived and picked up a WorldItem — update NPC inventory in Redux */
  onNpcPickupWorldItem?: (npcName: string, itemId: string, qty: number) => void;
  /** NPC dropped an item from its inventory — update NPC inventory in Redux */
  onNpcDropItem?: (npcName: string, itemId: string, qty: number, x?: number, y?: number) => void;
  /** NPC is asking the player for confirmation before acting */
  onAskConfirm?: (npcName: string, question: string) => void;
  /** Called when NPC chops a tree — find the tree by ID and chop it in the scene */
  onNpcChopTree?: (npcName: string, treeId: string) => void;
  /** Returns current inventory of a named NPC (for /getInventory command) */
  getNpcInventory?: (npcName: string) => Record<string, number>;
  /** Called when local player picks up a WorldItem — for multiplay sync */
  onWorldItemPickedUp?: (itemId: string, x: number, y: number) => void;
  /** Emit a game event to multiplayer peers */
  onGameEvent?: (type: string, payload: Record<string, unknown>) => void;
  /**
   * Called when night is skipped via beds.
   * React can display a toast like "🌅 时间跳过至 06:00".
   */
  onNightSkip?: (fromTime: string, toTime: string) => void;
  /**
   * Called when sleep vote count changes (for optional sleep UI).
   * `sleeping` = current sleepers count, `total` = total players.
   */
  onSleepVoteChanged?: (sleeping: number, total: number) => void;
  /**
   * Called to display a transient message to the local player
   * (e.g. "💤 你已躺下..." or "🌞 现在还是白天").
   */
  onShowMessage?: (text: string) => void;
  /**
   * Called when the player places / uses a furniture item from their inventory.
   * React should decrement the item count by `qty`.
   */
  onConsumeItem?: (itemId: string, qty: number) => void;
  /** NPC left on a dispatch mission carrying these items (itemId → qty) */
  onNpcDispatch?: (npcName: string, carriedItems: Record<string, number>) => void;
  /** NPC returned from dispatch — React should call backend for story + give items */
  onNpcDispatchReturn?: (npcName: string, carriedItems: Record<string, number>) => void;
  /** Make a named NPC say something (from React land after async API call) */
  makeNpcSay?: (npcName: string, text: string) => void;
}

// ─── Farm tile ────────────────────────────────────────────────────────────────
export type FarmTileStateType =
  | 'tilled' | 'watered' | 'seeded' | 'growing' | 'ready' | 'harvested';
