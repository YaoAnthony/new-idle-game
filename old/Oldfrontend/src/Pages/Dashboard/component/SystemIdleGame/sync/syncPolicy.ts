import type { WorldAction } from '../systems/WorldActionSystem';
import type { ProfileGameEventType } from '@timeplan-game/core/contracts/events/profileGameEvents';

export type SyncAuthority = 'ServerAuthoritative' | 'RoomBroadcast' | 'HostSnapshot' | 'LocalOnly';
export type SyncMode = 'server_authoritative' | 'room_broadcast' | 'host_snapshot' | 'local_only';
export type WorldSyncSource = 'local' | 'room' | 'server' | 'snapshot' | 'system';

export type SyncDomain =
  | 'inventory'
  | 'farm_tiles'
  | 'chest_spawn_open'
  | 'player_local_position'
  | 'remote_player_position'
  | 'drops'
  | 'trees'
  | 'placed_objects'
  | 'sleep_state'
  | 'chicken_state'
  | 'nest_state'
  | 'npc_memory'
  | 'npc_action_result'
  | 'pet_state'
  | 'day_cycle'
  | 'perception_result';

export interface SyncPolicyEntry {
  domain: SyncDomain;
  authority: SyncAuthority;
  syncMode: SyncMode;
  note: string;
}

export const WORLD_SYNC_POLICIES: Record<SyncDomain, SyncPolicyEntry> = {
  inventory: {
    domain: 'inventory',
    authority: 'ServerAuthoritative',
    syncMode: 'server_authoritative',
    note: 'Inventory is persisted and must reconcile with backend-confirmed pickup/use results.',
  },
  farm_tiles: {
    domain: 'farm_tiles',
    authority: 'ServerAuthoritative',
    syncMode: 'server_authoritative',
    note: 'Farm tile, crop, and farm-created drops are confirmed by backend mutations; room events include fromUserId so the initiating client can ignore its own server echo.',
  },
  chest_spawn_open: {
    domain: 'chest_spawn_open',
    authority: 'ServerAuthoritative',
    syncMode: 'server_authoritative',
    note: 'Chest spawn/open is granted by backend events and should not be locally invented.',
  },
  player_local_position: {
    domain: 'player_local_position',
    authority: 'RoomBroadcast',
    syncMode: 'room_broadcast',
    note: 'Local player position is owner-driven and broadcast to peers for visibility only.',
  },
  remote_player_position: {
    domain: 'remote_player_position',
    authority: 'RoomBroadcast',
    syncMode: 'room_broadcast',
    note: 'Remote player position is accepted from room events rather than backend persistence.',
  },
  drops: {
    domain: 'drops',
    authority: 'RoomBroadcast',
    syncMode: 'room_broadcast',
    note: 'Visible drop spawn/pickup events are synchronized at room scope.',
  },
  trees: {
    domain: 'trees',
    authority: 'RoomBroadcast',
    syncMode: 'room_broadcast',
    note: 'Tree chop state is visible world state and currently synchronized between peers.',
  },
  placed_objects: {
    domain: 'placed_objects',
    authority: 'LocalOnly',
    syncMode: 'local_only',
    note: 'Legacy PLACE_OBJECT remains local-only. BuildingSystem placement/move/rotate/remove/upgrade is server-confirmed through dedicated building actions and game_save_synced room updates.',
  },
  sleep_state: {
    domain: 'sleep_state',
    authority: 'RoomBroadcast',
    syncMode: 'room_broadcast',
    note: 'Sleep state/vote is coordinated between peers at room scope.',
  },
  chicken_state: {
    domain: 'chicken_state',
    authority: 'LocalOnly',
    syncMode: 'local_only',
    note: 'Chicken behavior is currently local simulation and periodically persisted for restore.',
  },
  nest_state: {
    domain: 'nest_state',
    authority: 'LocalOnly',
    syncMode: 'local_only',
    note: 'Nest occupancy/egg lifecycle is local simulation unless later promoted to shared state.',
  },
  npc_memory: {
    domain: 'npc_memory',
    authority: 'ServerAuthoritative',
    syncMode: 'server_authoritative',
    note: 'NPC memory and dispatch return content come from backend state.',
  },
  npc_action_result: {
    domain: 'npc_action_result',
    authority: 'ServerAuthoritative',
    syncMode: 'server_authoritative',
    note: 'LLM/chat/dispatch outcomes are backend-driven even if visuals execute locally.',
  },
  pet_state: {
    domain: 'pet_state',
    authority: 'HostSnapshot',
    syncMode: 'host_snapshot',
    note: 'Pet commands are relayed at room scope, then the room host periodically publishes an authoritative pet snapshot.',
  },
  day_cycle: {
    domain: 'day_cycle',
    authority: 'LocalOnly',
    syncMode: 'local_only',
    note: 'Day cycle tint/visual progression is local simulation, with room clock sync only as a convenience.',
  },
  perception_result: {
    domain: 'perception_result',
    authority: 'LocalOnly',
    syncMode: 'local_only',
    note: 'Perception results and formatted prompts are local derived data.',
  },
};

export type WorldActionSyncCategory = 'server_confirm' | 'room_broadcast' | 'local_only';

export interface WorldActionSyncPolicy {
  actionType: WorldAction['type'];
  category: WorldActionSyncCategory;
  note: string;
}

export const WORLD_ACTION_SYNC_POLICIES: Record<WorldAction['type'], WorldActionSyncPolicy> = {
  MOVE_ENTITY: {
    actionType: 'MOVE_ENTITY',
    category: 'local_only',
    note: 'Movement is simulated locally; peer visibility still uses dedicated player_move room events.',
  },
  PLACE_OBJECT: {
    actionType: 'PLACE_OBJECT',
    category: 'local_only',
    note: 'Placed objects remain local until a shared placement authority is introduced.',
  },
  PLACE_BUILDING: {
    actionType: 'PLACE_BUILDING',
    category: 'server_confirm',
    note: 'Generic building placement consumes resources/items and must be confirmed by backend gameSave.',
  },
  MOVE_BUILDING: {
    actionType: 'MOVE_BUILDING',
    category: 'server_confirm',
    note: 'Building movement changes persistent footprint state and must be confirmed by backend gameSave.',
  },
  ROTATE_BUILDING: {
    actionType: 'ROTATE_BUILDING',
    category: 'server_confirm',
    note: 'Building rotation changes persistent orientation and must be confirmed by backend gameSave.',
  },
  REMOVE_BUILDING: {
    actionType: 'REMOVE_BUILDING',
    category: 'server_confirm',
    note: 'Building removal changes persistent world state and must be confirmed by backend gameSave.',
  },
  START_BUILDING_UPGRADE: {
    actionType: 'START_BUILDING_UPGRADE',
    category: 'server_confirm',
    note: 'Building upgrades spend resources and assign workers on the backend.',
  },
  START_BUILDING_REPAIR: {
    actionType: 'START_BUILDING_REPAIR',
    category: 'server_confirm',
    note: 'Building repairs spend resources and assign workers on the backend.',
  },
  COMPLETE_BUILDING_JOB: {
    actionType: 'COMPLETE_BUILDING_JOB',
    category: 'server_confirm',
    note: 'Building job completion advances persistent level/repair state on the backend.',
  },
  PLACE_HOUSE: {
    actionType: 'PLACE_HOUSE',
    category: 'server_confirm',
    note: 'House placement consumes a blueprint and must be confirmed by backend gameSave.',
  },
  PLACE_STORAGE_CHEST: {
    actionType: 'PLACE_STORAGE_CHEST',
    category: 'server_confirm',
    note: 'Storage chest placement consumes an item and must be confirmed by backend gameSave.',
  },
  PLACE_PET: {
    actionType: 'PLACE_PET',
    category: 'room_broadcast',
    note: 'Pet placement is relayed to peers, then reconciled by the host pet_state snapshot.',
  },
  REMOVE_OBJECT: {
    actionType: 'REMOVE_OBJECT',
    category: 'local_only',
    note: 'Object removal is currently local unless tied to a server- or room-authoritative object.',
  },
  PICKUP_DROP: {
    actionType: 'PICKUP_DROP',
    category: 'room_broadcast',
    note: 'Drop pickup is a visible room event and should be relayed to peers.',
  },
  DROP_ITEM: {
    actionType: 'DROP_ITEM',
    category: 'room_broadcast',
    note: 'Drop creation is visible shared state at room scope.',
  },
  PET_INTERACT: {
    actionType: 'PET_INTERACT',
    category: 'room_broadcast',
    note: 'Pet interaction changes needs and memory through PetSystem, then reconciles through host pet_state.',
  },
  PET_REMEMBER: {
    actionType: 'PET_REMEMBER',
    category: 'room_broadcast',
    note: 'Pet memories are pet entity metadata and are mirrored at room scope before host snapshot reconciliation.',
  },
  PET_SET_HOME: {
    actionType: 'PET_SET_HOME',
    category: 'room_broadcast',
    note: 'Pet home anchors are visible companion state and should be mirrored before host snapshot reconciliation.',
  },
  PET_TRAVEL_DEPART: {
    actionType: 'PET_TRAVEL_DEPART',
    category: 'room_broadcast',
    note: 'Pet travel departure is the visible companion event after backend album send succeeds.',
  },
  PET_TRAVEL_RETURN: {
    actionType: 'PET_TRAVEL_RETURN',
    category: 'room_broadcast',
    note: 'Pet travel return is the visible companion event after backend album unclaimed return appears.',
  },
  TILL_TILE: {
    actionType: 'TILL_TILE',
    category: 'server_confirm',
    note: 'Tilling should be confirmed by server-authoritative farm state.',
  },
  WATER_TILE: {
    actionType: 'WATER_TILE',
    category: 'server_confirm',
    note: 'Watering should be confirmed by server-authoritative farm state.',
  },
  PLANT_CROP: {
    actionType: 'PLANT_CROP',
    category: 'server_confirm',
    note: 'Planting should be confirmed by server-authoritative farm state.',
  },
  HARVEST_CROP: {
    actionType: 'HARVEST_CROP',
    category: 'server_confirm',
    note: 'Harvest resolves against server-authoritative farm state and drop creation.',
  },
  CHOP_TREE: {
    actionType: 'CHOP_TREE',
    category: 'room_broadcast',
    note: 'Tree chopping is a visible room-level world event.',
  },
  PICK_FRUIT: {
    actionType: 'PICK_FRUIT',
    category: 'local_only',
    note: 'Fruit picking is still local-only until tree fruit state is shared.',
  },
  NEST_OCCUPY: {
    actionType: 'NEST_OCCUPY',
    category: 'local_only',
    note: 'Nest occupancy is part of local chicken simulation.',
  },
  NEST_RELEASE: {
    actionType: 'NEST_RELEASE',
    category: 'local_only',
    note: 'Nest release is part of local chicken simulation.',
  },
  NEST_LAY_EGG: {
    actionType: 'NEST_LAY_EGG',
    category: 'local_only',
    note: 'Egg laying is currently local nest simulation.',
  },
  NEST_COLLECT_EGG: {
    actionType: 'NEST_COLLECT_EGG',
    category: 'local_only',
    note: 'Egg collection is local simulation plus server inventory persistence.',
  },
  UPDATE_ENTITY_STATE: {
    actionType: 'UPDATE_ENTITY_STATE',
    category: 'local_only',
    note: 'Generic entity patches are local unless a stronger authority path wraps them.',
  },
  UPDATE_TREE_STATE: {
    actionType: 'UPDATE_TREE_STATE',
    category: 'local_only',
    note: 'Generic tree patches are local until explicitly routed.',
  },
  UPDATE_NEST_STATE: {
    actionType: 'UPDATE_NEST_STATE',
    category: 'local_only',
    note: 'Generic nest patches are local until explicitly routed.',
  },
};

export type ServerPushType = ProfileGameEventType;

export const SERVER_PUSH_POLICIES: Record<ServerPushType, SyncPolicyEntry> = {
  game_chest_spawned: WORLD_SYNC_POLICIES.chest_spawn_open,
  farm_tile_updated: WORLD_SYNC_POLICIES.farm_tiles,
  npc_command: WORLD_SYNC_POLICIES.npc_action_result,
  pet_travel_photo_returned: WORLD_SYNC_POLICIES.pet_state,
};

export function getWorldSyncPolicy(domain: SyncDomain): SyncPolicyEntry {
  return WORLD_SYNC_POLICIES[domain];
}

export function getWorldActionSyncPolicy(action: Pick<WorldAction, 'type'>): WorldActionSyncPolicy {
  return WORLD_ACTION_SYNC_POLICIES[action.type];
}
