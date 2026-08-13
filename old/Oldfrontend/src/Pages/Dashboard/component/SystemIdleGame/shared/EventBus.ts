/**
 * EventBus — typed publish/subscribe event bus for the idle game.
 *
 * Replaces the 20-callback GameCallbacks interface with a decoupled,
 * type-safe event system. Systems and entities emit events; React and
 * other systems subscribe without tight coupling.
 *
 * Event boundaries:
 * - gameBus is local, synchronous, and transient. It should wake UI/runtime
 *   systems, not become durable quest or world persistence.
 * - Backend SSE events are server-originated notifications and are parsed at
 *   the sync boundary before being applied.
 * - Multiplayer room events are schema-validated peer-visible actions before
 *   they enter this bus as `mp:game_event`.
 * - Authored storyline events are durable JSON/runtime sequences and only use
 *   gameBus for UI handoffs such as choices and save requests.
 *
 * Usage:
 *   // Emit from Phaser side:
 *   gameBus.emit('npc:speak', { text: '你好', npcName: '老李' });
 *
 *   // Subscribe from React side:
 *   const unsub = gameBus.on('npc:speak', ({ text, npcName }) => { ... });
 *   // Call unsub() to remove listener (e.g. in useEffect cleanup).
 */

import type { ToolType, FarmTileStateType } from '../types';
import type { ChestRewardItem, GameChest }  from '../../../../../Types/Profile';
import type { GameRuntimeProfileSnapshot, GameSaveV2 } from '../persistence/save/GameSaveTypes';
import type { GameEventType, RemoteGameEvent, WorldSnapshot, MultiplayRoomPlayer } from '../systems/MultiplaySystem';
import type { WorldAction, WorldActionResult } from '../systems/WorldActionSystem';
import type { DomainEvent } from '../world/actions/DomainEvent';
import type { WorldSyncSource } from '../sync/syncPolicy';
import type { WorldEntityKind, WorldObjectKind } from './worldStateTypes';
import type { NpcTradeStack } from '../features/npc/trade/NpcTradeTypes';
import type { AttributeKey } from '../../../../../shared/core/protagonistAttributeProgression';
import type {
  ClaimPetTravelPhotoRequest,
  MemoryAlbumEntry,
  SendPetTravelPhotoRequest,
} from '../features/pets/travel/PetTravelTypes';

export interface GameRuntimeSaveSnapshot {
  save: GameSaveV2;
  profile?: GameRuntimeProfileSnapshot;
}

export interface GameRestoreSaveResult {
  ok: boolean;
  reason?: string;
}

export interface MaskProgressAnimationState {
  level: number;
  progress: number;
  required: number;
}

export interface MaskProgressRewardAnimation {
  previousMaskProgress: MaskProgressAnimationState;
  maskProgress: MaskProgressAnimationState;
  previousMask?: { centerWorldId?: string; centerX?: number; centerY?: number; radius?: number; revealedCells?: string[] };
  mask?: { centerWorldId?: string; centerX?: number; centerY?: number; radius?: number; revealedCells?: string[] };
  previousConfiguration?: { maskProgressBarDisplay?: boolean };
  configuration?: { maskProgressBarDisplay?: boolean };
  levelUps?: number;
}

export interface WorldObjectHintRequest {
  objectId?: string;
  objectKind?: WorldObjectKind | WorldEntityKind | 'drop';
  x?: number;
  y?: number;
  label?: string;
  color?: number;
  panDurationMs?: number;
  highlightDurationMs?: number;
  holdMs?: number;
  restoreFollow?: boolean;
}

export interface WorldObjectHintResult {
  ok: boolean;
  objectId?: string;
  objectKind?: WorldObjectHintRequest['objectKind'];
  reason?: string;
}

export interface EntityActionSoundEvent {
  action?: string;
  soundId?: string;
  itemId?: string;
  actorId?: string;
  actorKind?: 'player' | 'remote_player' | 'npc' | 'mob' | 'pet' | 'creature' | 'object' | 'system' | (string & {});
  x?: number;
  y?: number;
  worldId?: string;
  audibleRadius?: number;
  volume?: number;
  minVolume?: number;
  rate?: number;
  tag?: string;
  source?: WorldSyncSource;
}

// ─── Event payload map ────────────────────────────────────────────────────────
export interface GameEventMap {
  // ── Time / Day cycle ──────────────────────────────────────────────────────
  /** Fired every frame (throttled to ~1s) with current game time + date. */
  'time:update':          { absoluteGameMinutes: number; timeStr: string; dateStr: string; dateTimeStr: string };
  /** Night was skipped by sleeping. */
  'day:night_skip':       { fromTime: string; toTime: string };
  /** Sleep vote count changed (for multiplayer "waiting for X players" UI). */
  'day:sleep_vote':       { sleeping: number; total: number };

  // ── Player ────────────────────────────────────────────────────────────────
  /** Active hotbar tool changed. */
  'player:tool_change':   { tool: ToolType };
  /** Player picked up a world item (add to inventory). */
  'player:item_pickup':   { itemKey: string; quantity: number };
  /** Player consumed an item (decrement inventory). */
  'player:consume_item':  { itemId: string; qty: number; action?: 'eat' | 'drop' | 'place' | 'consume'; previousHunger?: number };
  /** Player hunger changed. */
  'player:hunger_changed': { hunger: number; max: number };
  /** Player health changed. */
  'player:health_changed': { health: number; max: number; downed: boolean };

  // ── Pets / Travel photos ─────────────────────────────────────────────────
  /** Player pressed F near a pet — React opens the pet travel panel. */
  'pet:panel_requested': {
    petEntityId: string;
    petDefinitionId: string;
    species: string;
    displayName: string;
    worldId?: string;
    lifeStage?: string;
    color?: string;
    referenceImageDataUrl?: string | null;
    returnedEntryId?: string | null;
  };
  /** React should send a pet away and ask the backend for a travel photo. */
  'pet:travel_send_requested': SendPetTravelPhotoRequest;
  /** React should claim and show a returned pet photo. */
  'pet:photo_return_requested': ClaimPetTravelPhotoRequest & { entry?: MemoryAlbumEntry | null };
  /** Backend-confirmed pet travel state changed. */
  'pet:travel_changed': { petEntityId?: string; entry?: MemoryAlbumEntry | null; gameSave?: GameSaveV2 };

  // ── NPC ───────────────────────────────────────────────────────────────────
  /** NPC spoke — show speech bubble. */
  'npc:speak':             { text: string; npcName: string };
  /** World-space NPC speech that can be heard by nearby NPCs. */
  'dialogue:npc_spoke':    { npcName: string; text: string; x: number; y: number };
  /** Player speech heard by one NPC. React may ask the backend whether/how to reply. */
  'dialogue:player_heard': { npcName: string; text: string; distance: number; listenerCount: number; shouldReply: boolean };
  /** Player pressed E near an NPC — open chat input. */
  'npc:interact':          { npcName: string; initialValue?: string };
  /** Player pressed F near an NPC — open trade panel. */
  'npc:trade_requested':   { npcName: string };
  /** A backend-confirmed NPC trade completed. */
  'npc:trade_completed':   { npcName: string; playerItems: NpcTradeStack[]; npcItems: NpcTradeStack[]; playerCoins: number; npcInventory?: Record<string, number> };
  /** NPC is asking the player for confirmation before proceeding. */
  'npc:ask_confirm':       { npcName: string; question: string };
  /** NPC chopped a tree — Phaser should apply chop visuals. */
  'npc:chop_tree':         { npcName: string; treeId: string };
  /** NPC picked up a world item — update NPC inventory in Redux. */
  'npc:pickup_world_item': { npcName: string; itemId: string; qty: number };
  /** NPC dropped an item — update NPC inventory in Redux. */
  'npc:drop_item':         { npcName: string; itemId: string; qty: number; x?: number; y?: number; worldId?: string };
  /** NPC consumed an inventory item. */
  'npc:consume_item':      { npcName: string; itemId: string; qty: number };
  /** NPC health changed. */
  'npc:health_changed':    { npcName: string; health: number; max: number; downed: boolean };
  /** NPC left on a dispatch mission carrying these items. */
  'npc:dispatch':          { npcName: string; carriedItems: Record<string, number> };
  /** NPC returned from dispatch — React should call backend for story + rewards. */
  'npc:dispatch_return':   { npcName: string; carriedItems: Record<string, number> };
  /** NPC navigation failed before reaching a target. */
  'npc:navigation_failed':  { npcName: string; x: number; y: number; worldId?: string; targetX: number; targetY: number; targetWorldId?: string; reason: string };
  /** NPC daily planning finished and wrote a new blackboard day plan. */
  'npc:planning_completed': { npcId: string; absoluteGameMinutes: number };
  /**
   * React → Phaser: make a named NPC say something.
   * (Opposite direction — React fires this after async LLM call.)
   */
  'npc:say':               { npcName: string; text: string };

  // ── Farm ──────────────────────────────────────────────────────────────────
  /** Player performed a farming action (till, water, plant, harvest). */
  'farm:action':           { action: 'till' | 'water' | 'plant' | 'harvest'; worldId?: string; tx: number; ty: number; itemId?: string; actorId?: string };
  /** A farm tile's state changed (from server confirmation or remote peer). */
  'farm:tile_change':      { tx: number; ty: number; state: FarmTileStateType; cropId?: string };

  // ── World items ───────────────────────────────────────────────────────────
  /** A world item was spawned (for multiplayer relay and future persistence). */
  'world:item_spawned':    { itemId: string; quantity?: number; x: number; y: number; worldId?: string; spawnId: string; actorId?: string; source?: WorldSyncSource };
  /** A world item was picked up by the local player (for multiplayer relay). */
  'world:item_picked_up':  { dropId?: string; itemId: string; quantity?: number; x: number; y: number; worldId?: string; actorId?: string; source?: WorldSyncSource };
  /** A player-placed world object was created locally. */
  'world:object_placed':   { itemId: string; objectKind?: string; x: number; y: number; worldId?: string; actorId?: string };
  /** A world action was applied to WorldState/WorldGrid. */
  'world:action_applied':  { action: WorldAction; result: WorldActionResult; source: WorldSyncSource };
  /** Domain-level world event emitted after a world command resolves. */
  'world:domain_event':    DomainEvent;
  /** Request a camera pan + highlight for any known world object/entity/drop. */
  'world:object_hint_requested': WorldObjectHintRequest;
  /** Emitted after a world object hint request is handled. */
  'world:object_hint_result': WorldObjectHintResult;
  /** Local player movement snapshot that may need room broadcast. */
  'world:position_broadcast_requested': {
    x: number;
    y: number;
    worldId?: string;
    facing: 'up' | 'down' | 'left' | 'right';
    velX: number;
    velY: number;
    flashlightOn?: boolean;
  };
  /** Local sleep state changed and may need room broadcast. */
  'world:sleep_state_changed': { sleeping: boolean };

  // ── Entity action audio ───────────────────────────────────────────────────
  /** A spatial sound emitted by an actor or world entity after an action. */
  'entity:action_sound': EntityActionSoundEvent;

  // ── Chest ─────────────────────────────────────────────────────────────────
  /** Player opened a chest — show reward UI. */
  'chest:interact':        { chestId: string; rewards: { coins: number; items: ChestRewardItem[] }; chest?: GameChest };
  /** A world chest was spawned by an event. */
  'game:chest_spawned':    { chest: GameChest };

  // ── UI messages ───────────────────────────────────────────────────────────
  /** Show a transient HUD message to the local player. */
  'ui:show_message':       { text: string };
  /** Runtime requested the game shop modal to open. */
  'ui:game_shop_requested': { npcName?: string };
  /** Runtime requested an ESC content panel to open. */
  'ui:open_esc_content':    { action: 'system-tasks' | 'daily-tasks' | 'system-store' | 'lottery' | 'system-settings' | 'npc-data' };

  // ── Storyline runtime ─────────────────────────────────────────────────────
  /** Storyline runtime is asking React to present a choice UI; runtime has a fallback if no UI resolves it. */
  'storyline:choice_requested': {
    requestId: string;
    storylineId: string;
    eventId?: string;
    npcId?: string;
    prompt: string;
    choices: Array<{ id: string; label: string }>;
    timeoutMs?: number;
  };
  /** React resolved a storyline choice request. */
  'storyline:choice_resolved': {
    requestId: string;
    choiceId: string;
  };
  /** Runtime packages were loaded or refreshed; command catalog can rebuild dynamic storyline completions. */
  'storyline:runtime_loaded': {
    eventCount: number;
  };
  /** A timed storyline objective started. */
  'storyline:objective_started': { objectiveId: string; title?: string; dueAtGameMinute: number };
  /** A timed storyline objective completed. */
  'storyline:objective_completed': { objectiveId: string; title?: string; reason?: string };
  /** A timed storyline objective failed. */
  'storyline:objective_failed': { objectiveId: string; title?: string; reason?: string };
  /** A lore entry was revealed. */
  'storyline:lore_unlocked': { loreId: string; title: string; summary: string };
  /** A world-level storyline memory was added. */
  'storyline:world_memory_added': { memoryId: string; text: string; importance: number };

  // ── Multiplayer: incoming events from peers ───────────────────────────────
  /** Socket.IO room joined (host or guest). */
  'mp:room_joined':         { isHost: boolean; roomId: string; players: MultiplayRoomPlayer[] };
  /** A peer joined the room. */
  'mp:peer_joined':         { userId: string; displayName: string };
  /** A peer left the room. */
  'mp:peer_left':           { userId: string };
  /** A relay game_event arrived from a peer. */
  'mp:game_event':          RemoteGameEvent;
  /** Socket.IO error. */
  'mp:error':               { message: string };
  /** Host is requesting our world snapshot. */
  'mp:snapshot_requested':  Record<string, never>;
  /** We received a world snapshot from the host. */
  'mp:world_snapshot':      WorldSnapshot;
  /**
   * Phaser → MultiplaySystem relay.
   * Any system can emit this to have MultiplaySystem forward the event to peers.
   */
  'mp:relay':               { type: GameEventType; payload: Record<string, unknown> };
  /** Local player changed sleep state (for multiplayer sleep sync). */
  'mp:sleep_state':         { sleeping: boolean };

  // ── Game lifecycle ────────────────────────────────────────────────────────
  /** GameScene.create() finished — safe to access NPC entities. */
  'game:ready':             Record<string, never>;
  /** Runtime state changed in a way that should be persisted immediately. */
  'game:save_requested':    { reason: string };
  /** Runtime requested a saved game settings patch through the React boundary. */
  'game:settings_patch_requested': { fogOfWarEnabled?: boolean };
  /** Runtime requested backend-authoritative temple mask radius increase. */
  'game:mask_add_requested': { roomId?: string | null; amount: number; absoluteGameMinutes?: number };
  /** Runtime requested backend-authoritative temple mask radius decrease. */
  'game:mask_drop_requested': { roomId?: string | null; amount: number; absoluteGameMinutes?: number };
  /** Runtime requested backend-authoritative temple mask progress increase. */
  'game:mask_progress_add_requested': { roomId?: string | null; amount: number; absoluteGameMinutes?: number };
  /** Backend-confirmed temple mask state changed. */
  'game:mask_changed': { radius: number; mask?: { centerWorldId?: string; centerX?: number; centerY?: number; radius?: number; revealedCells?: string[] } };
  /** Backend-confirmed temple mask progress changed. */
  'game:mask_progress_changed': { level: number; progress: number; required: number; levelUps?: number };
  /** Backend-confirmed temple mask progress reward should play as a sequenced HUD animation. */
  'game:mask_progress_rewarded': MaskProgressRewardAnimation;
  /** HUD finished the progress/level animation and the world mask may visually expand. */
  'game:mask_progress_reveal_ready': { mask?: MaskProgressRewardAnimation['mask']; radius?: number };
  /** Runtime needs a current, fully bridged save snapshot including React-owned inventory/profile state. */
  'game:save_snapshot_requested': { reason: string; resolve: (snapshot: GameRuntimeSaveSnapshot | null) => void };
  /** Runtime asks React/Phaser boundary to restore a full game save/profile snapshot. */
  'game:restore_save_requested': { reason: string; save: GameSaveV2; profile?: GameRuntimeProfileSnapshot; persist?: boolean; onApplied?: (result: GameRestoreSaveResult) => void };
  /** React -> Phaser: latest local player game inventory snapshot. */
  'game:inventory_changed': { items: Array<{ itemId: string; quantity?: number }> };
  /** Phaser/runtime requested a backend-authoritative protagonist attribute EXP change. */
  'profile:attribute_exp_delta_requested': { attributeKey: AttributeKey; expDelta: number };
  /** Phaser/runtime requested backend-authoritative actor damage. */
  'game:actor_damage_requested': { roomId?: string | null; targetType: 'player' | 'npc'; targetId?: string; amount: number };
  /** Phaser/runtime requested backend-authoritative actor healing. */
  'game:actor_heal_requested': { roomId?: string | null; targetType: 'player' | 'npc'; targetId?: string; amount: number };
  /** React -> Phaser: play the bus arrival sequence for a newly unlocked NPC. */
  'game:npc_arrival_requested': { npcId: string; npcName?: string; reason?: string };
  /** Phaser -> React/systems: NPC bus arrival sequence has finished or failed. */
  'game:npc_arrival_completed': { npcId: string; npcName?: string; ok: boolean; reason?: string };
  /** Player requested deleting the current personal world save. */
  'game:save_delete_requested': { roomId?: string | null };
  /** World save delete finished or failed; autosave may resume only on failure because success reloads the runtime. */
  'game:save_delete_finished': { roomId?: string | null; ok: boolean };
  /** Phaser requested backend-atomic storage chest placement. */
  'game:storage_chest_place_requested': {
    roomId?: string | null;
    itemId: string;
    x: number;
    y: number;
    facing?: 'down' | 'left' | 'right';
    worldId?: string;
    placementProof: { requestedAtGameMinute: number; footprint: { x: number; y: number; w: number; h: number } };
  };
  /** Phaser requested backend-atomic generic building placement. */
  'game:building_place_requested': {
    roomId?: string | null;
    definitionId: string;
    itemId?: string;
    x: number;
    y: number;
    cellX?: number;
    cellY?: number;
    facing?: 'up' | 'down' | 'left' | 'right';
    worldId?: string;
    absoluteGameMinutes?: number;
  };
  /** Phaser/runtime requested backend-atomic building movement. */
  'game:building_move_requested': {
    roomId?: string | null;
    buildingId: string;
    x?: number;
    y?: number;
    cellX?: number;
    cellY?: number;
    worldId?: string;
    absoluteGameMinutes?: number;
  };
  /** Phaser/runtime requested backend-atomic building rotation. */
  'game:building_rotate_requested': {
    roomId?: string | null;
    buildingId: string;
    facing: 'up' | 'down' | 'left' | 'right';
    absoluteGameMinutes?: number;
  };
  /** Phaser/runtime requested backend-atomic building upgrade start. */
  'game:building_upgrade_requested': {
    roomId?: string | null;
    buildingId: string;
    absoluteGameMinutes?: number;
  };
  /** Phaser/runtime requested backend-atomic building repair start. */
  'game:building_repair_requested': {
    roomId?: string | null;
    buildingId: string;
    absoluteGameMinutes?: number;
  };
  /** Phaser/runtime requested completing due building jobs. */
  'game:building_jobs_complete_requested': {
    roomId?: string | null;
    absoluteGameMinutes: number;
  };
  /** Phaser/runtime requested idle golems to pick up planned construction jobs. */
  'game:building_workers_assign_requested': {
    roomId?: string | null;
    worldId?: string;
    absoluteGameMinutes: number;
  };
  /** A stone golem reached a planned building and can start construction. */
  'game:building_worker_arrived': {
    roomId?: string | null;
    buildingId: string;
    golemId: string;
    x?: number;
    y?: number;
    cellX?: number;
    cellY?: number;
    absoluteGameMinutes: number;
  };
  /** Phaser/runtime requested backend-atomic stone golem awaken/spawn. */
  'game:golem_awaken_requested': {
    roomId?: string | null;
    golemId?: string;
    x?: number;
    y?: number;
    cellX?: number;
    cellY?: number;
    worldId?: string;
    absoluteGameMinutes?: number;
  };
  /** Phaser/runtime requested backend-atomic dormant/awake stone golem spawn. */
  'game:golem_spawn_requested': {
    roomId?: string | null;
    golemId?: string;
    x?: number;
    y?: number;
    cellX?: number;
    cellY?: number;
    worldId?: string;
    state?: 'dormant' | 'awake';
    absoluteGameMinutes?: number;
  };
  /** Phaser/runtime requested backend-atomic building assembly resolution. */
  'game:building_assembly_resolve_requested': {
    roomId?: string | null;
    buildingIds?: string[];
    worldId?: string;
    absoluteGameMinutes?: number;
  };
  /** Phaser/runtime requested backend-atomic building removal. */
  'game:building_remove_requested': {
    roomId?: string | null;
    buildingId: string;
    refundItem?: boolean;
  };
  /** Phaser/runtime requested a React building panel for a persistent building. */
  'building:panel_open_requested': { roomId?: string | null; buildingId: string };
  /** Player opened a persistent storage chest. */
  'game:storage_chest_open_requested': { roomId?: string | null; chestId: string };
}

// ─── Type helpers ─────────────────────────────────────────────────────────────
export type EventKey = keyof GameEventMap;
type Handler<K extends EventKey> = (payload: GameEventMap[K]) => void;

// ─── EventBus class ───────────────────────────────────────────────────────────
export class EventBus {
  private listeners = new Map<EventKey, Set<Handler<EventKey>>>();

  /**
   * Subscribe to an event.
   * @returns An unsubscribe function — call it to remove the listener.
   */
  on<K extends EventKey>(event: K, handler: Handler<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as Handler<EventKey>);
    return () => {
      this.listeners.get(event)?.delete(handler as Handler<EventKey>);
    };
  }

  /** Emit an event to all subscribers. */
  emit<K extends EventKey>(event: K, payload: GameEventMap[K]): void {
    const handlers = [...(this.listeners.get(event) ?? [])];
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[GameEventBus] listener for "${String(event)}" failed`, error);
      }
    });
  }

  /** Remove all listeners (call on scene shutdown). */
  destroy(): void {
    this.listeners.clear();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
/**
 * Module-level singleton used by all Phaser systems and React components.
 * Phaser systems import this directly; React uses it inside useEffect.
 */
export const gameBus = new EventBus();
