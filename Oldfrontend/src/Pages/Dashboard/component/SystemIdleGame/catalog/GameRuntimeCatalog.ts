import type {
  BuildingDefinition,
  FurnitureDefinition,
  GameCatalogPayload,
  GameItemDefinition,
  GameNpcDefinition,
  PetDefinition,
  StorageChestDefinition,
} from './GameCatalogTypes';
import { FALLBACK_GAME_CATALOG, FALLBACK_GAME_ITEMS } from './fallbackGameCatalog';

let runtimeCatalog: GameCatalogPayload | null = null;

function byId<T extends { id: string }>(entries: T[] | null | undefined): Record<string, T> {
  return Object.fromEntries((entries ?? []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
}

function normalizeItem(item: GameItemDefinition): GameItemDefinition {
  return {
    ...item,
    category: 'game',
    stackable: Boolean(item.stackable),
    maxStack: Number(item.maxStack || 1),
    visualKey: item.visualKey || item.image || `item/${item.id}`,
    capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
    tags: Array.isArray(item.tags) ? item.tags : [],
  };
}

export function loadGameCatalog(payload: GameCatalogPayload | null | undefined): void {
  runtimeCatalog = payload ?? null;
}

export function getGameCatalogSnapshot(): GameCatalogPayload {
  return runtimeCatalog ?? FALLBACK_GAME_CATALOG;
}

export function getGameItems(): Record<string, GameItemDefinition> {
  const runtimeItems = byId((runtimeCatalog?.items ?? []).map(normalizeItem));
  return {
    ...FALLBACK_GAME_ITEMS,
    ...runtimeItems,
  };
}

export function registerDynamicGameItems(items: GameItemDefinition[]): void {
  runtimeCatalog = {
    ...(runtimeCatalog ?? {}),
    items,
  };
}

export function getGameItemDefinition(itemId: string | null | undefined): GameItemDefinition | null {
  if (!itemId) return null;
  return getGameItems()[itemId] ?? null;
}

export function getNpcDefinitionById(id: string | null | undefined): GameNpcDefinition | null {
  if (!id) return null;
  return (runtimeCatalog?.npcs ?? []).find((entry) => entry.id === id || entry.name === id) ?? null;
}

export function getPetDefinition(id: string | null | undefined): PetDefinition | null {
  if (!id) return null;
  return (runtimeCatalog?.pets ?? []).find((entry) => entry.id === id || entry.displayName === id) ?? null;
}

export function getPetDefinitionByItemId(itemId: string | null | undefined): PetDefinition | null {
  if (!itemId) return null;
  return (runtimeCatalog?.pets ?? []).find((entry) => entry.itemId === itemId) ?? null;
}

export function getFurnitureDefinition(idOrItemId: string | null | undefined): FurnitureDefinition | null {
  if (!idOrItemId) return null;
  return (runtimeCatalog?.furniture ?? []).find((entry) =>
    entry.id === idOrItemId || entry.itemIds.includes(idOrItemId),
  ) ?? null;
}

export function getStorageChestDefinition(idOrItemId: string | null | undefined): StorageChestDefinition | null {
  if (!idOrItemId) return null;
  return (runtimeCatalog?.storageChests ?? []).find((entry) =>
    entry.id === idOrItemId || entry.itemId === idOrItemId,
  ) ?? null;
}

export function getBuildingDefinition(idOrItemId: string | null | undefined): BuildingDefinition | null {
  if (!idOrItemId) return null;
  return (runtimeCatalog?.buildings ?? FALLBACK_GAME_CATALOG.buildings ?? []).find((entry) =>
    entry.id === idOrItemId || entry.itemId === idOrItemId,
  ) ?? null;
}

export type {
  BuildingDefinition,
  FurnitureDefinition,
  GameCatalogPayload,
  GameItemDefinition,
  GameNpcDefinition,
  PetDefinition,
  StorageChestDefinition,
};
