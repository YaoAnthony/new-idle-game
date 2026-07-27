import type { GameSaveV2 } from '../persistence/save/GameSaveTypes';
import type { NpcMindDefaults } from './NpcPersonalityTags';
import { normalizeNpcMindDefaults } from './NpcPersonalityTags';
import { isReservedGameActorId } from './actorIds';

export const NPC_CATALOG_VERSION = 4;

export interface GameNpcDefinition {
  id: string;
  name: string;
  role: 'starter' | 'farmer' | 'carpenter' | 'merchant' | 'scholar' | 'rancher';
  title: string;
  description: string;
  tags?: string[];
  assets?: { avatar?: string };
  price: number;
  ownedByDefault?: boolean;
  spawnOffset: { x: number; y: number };
  spawnPoint?: { worldId?: string; x: number; y: number; facing?: 'up' | 'down' | 'left' | 'right' };
  behavior?: { movementPolicy?: 'free' | 'stationary' };
  vendor?: {
    shopKind?: string;
    rarityTier?: string;
    defaultInventory?: Array<{ itemId: string; quantity: number }>;
    restockPolicy?: Record<string, unknown>;
  };
  tint: number;
  aliases?: string[];
  enabled?: boolean;
  mindDefaults?: NpcMindDefaults;
}

export const GAME_NPC_CATALOG: GameNpcDefinition[] = [];

let runtimeNpcCatalog: GameNpcDefinition[] | null = null;

export function setRuntimeNpcCatalog(definitions: GameNpcDefinition[] | null | undefined): void {
  runtimeNpcCatalog = Array.isArray(definitions)
    ? definitions.map(normalizeRuntimeNpcDefinition).filter(Boolean)
    : null;
}

export function getGameNpcCatalog(): GameNpcDefinition[] {
  return runtimeNpcCatalog !== null ? runtimeNpcCatalog : GAME_NPC_CATALOG;
}

export function getDefaultUnlockedNpcIds(): string[] {
  return getGameNpcCatalog()
    .filter(npc => npc.ownedByDefault)
    .map(npc => npc.id);
}

export function normalizeUnlockedNpcIds(input?: string[] | null): string[] {
  const result = new Set<string>();
  if (Array.isArray(input)) {
    input.forEach(id => {
      if (id) result.add(String(id));
    });
  }
  return [...result];
}

export function getNpcDefinitionById(id: string): GameNpcDefinition | null {
  return getGameNpcCatalog().find(npc => npc.id === id || npc.name === id) ?? null;
}

export function getNpcDefinitionsForSave(save?: GameSaveV2 | null, catalogOverride?: GameNpcDefinition[] | null): GameNpcDefinition[] {
  const catalog = catalogOverride?.length ? catalogOverride : getGameNpcCatalog();
  const unlocked = normalizeUnlockedNpcIdsForCatalog(save?.worldStatus?.unlockedNpcs);
  const catalogDefinitions = unlocked
    .map(id => catalog.find(npc => npc.id === id || npc.name === id) ?? null)
    .filter((npc): npc is GameNpcDefinition => Boolean(npc));
  const knownNames = new Set(catalog.map(npc => npc.name));
  const knownIds = new Set(catalog.map(npc => npc.id));
  const customDefinitions = Object.values(save?.worldStatus?.npcs ?? {})
    .filter(npc => {
      if (!npc?.name) return false;
      if (knownNames.has(npc.name) || knownIds.has(npc.id)) return false;
      return !isReservedGameActorId(npc.id) && !isReservedGameActorId(npc.name);
    })
    .map((npc, index): GameNpcDefinition => ({
      id: npc.id || npc.name,
      name: npc.name,
      role: 'starter',
      title: npc.stressTest ? 'Stress Test' : 'Custom NPC',
      description: npc.stressTest ? 'Temporary NPC used for local load testing.' : 'NPC loaded from save data.',
      price: 0,
      spawnOffset: {
        x: (index + 1) * 32,
        y: 96,
      },
      tint: npc.stressTest ? 0xff77aa : 0xb6d7ff,
    }));
  return [...catalogDefinitions, ...customDefinitions];
}

function normalizeUnlockedNpcIdsForCatalog(input: string[] | null | undefined): string[] {
  const result = new Set<string>();
  if (Array.isArray(input)) {
    input.forEach(id => {
      if (id) result.add(String(id));
    });
  }
  return [...result];
}

function normalizeRuntimeNpcDefinition(input: GameNpcDefinition): GameNpcDefinition {
  return {
    ...input,
    tags: Array.isArray(input.tags) ? input.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : [],
    assets: normalizeNpcAssets(input.assets),
    price: Number(input.price || 0),
    spawnOffset: {
      x: Number(input.spawnOffset?.x || 0),
      y: Number(input.spawnOffset?.y || 0),
    },
    spawnPoint: input.spawnPoint && Number.isFinite(Number(input.spawnPoint.x)) && Number.isFinite(Number(input.spawnPoint.y))
      ? {
          worldId: input.spawnPoint.worldId || 'world:main',
          x: Number(input.spawnPoint.x),
          y: Number(input.spawnPoint.y),
          facing: normalizeFacing(input.spawnPoint.facing),
        }
      : undefined,
    behavior: input.behavior ? {
      movementPolicy: input.behavior.movementPolicy === 'stationary' ? 'stationary' : 'free',
    } : undefined,
    vendor: input.vendor ? {
      ...input.vendor,
      defaultInventory: Array.isArray(input.vendor.defaultInventory)
        ? input.vendor.defaultInventory
            .map((entry) => ({
              itemId: String(entry.itemId || ''),
              quantity: Math.max(0, Math.floor(Number(entry.quantity || 0))),
            }))
            .filter((entry) => entry.itemId && entry.quantity > 0)
        : [],
    } : undefined,
    tint: Number(input.tint ?? 0xb6d7ff),
    mindDefaults: normalizeNpcMindDefaults(input.mindDefaults),
  };
}

function normalizeNpcAssets(input: GameNpcDefinition['assets']): GameNpcDefinition['assets'] {
  if (!input || typeof input !== 'object') return undefined;
  const avatar = String(input.avatar || '').trim();
  return avatar ? { avatar } : undefined;
}

function normalizeFacing(input: unknown): 'up' | 'down' | 'left' | 'right' {
  return input === 'up' || input === 'left' || input === 'right' ? input : 'down';
}
