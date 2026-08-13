import { getGameItemDefinition } from '../catalog/GameRuntimeCatalog';
import { GameVisualAssets } from './GameVisualAssets';

export type GameVisual =
  | { mode: 'sheet'; textureKey: string; asset: string; x: number; y: number; w?: number; h?: number; fallbackTint?: number }
  | { mode: 'image'; textureKey: string; asset: string; fallbackTint?: number }
  | { mode: 'tint'; tint: number };

export interface PhaserPreloadEntry {
  kind: 'image' | 'spritesheet';
  textureKey: string;
  asset: string;
  frameWidth?: number;
  frameHeight?: number;
}

const TINTS: Record<string, number> = {
  'item/berry': 0xff4444,
  'item/animal_feed': 0xd9b46a,
  'item/storage/chest_basic': 0xb77a42,
  'item/pet/laoli_cat': 0xd9a066,
  'item/pet/cow': 0xe7c58e,
  'item/house/greenhouse_blueprint': 0x70b76c,
  'item/house/key': 0xf4c542,
  'item/material/log': 0x8b4513,
  'item/material/stone': 0x808080,
};

export const GAME_VISUALS: Record<string, GameVisual> = {
  'item/tool/watering_can': { mode: 'sheet', textureKey: 'tools', asset: GameVisualAssets.toolsUrl, x: 0, y: 0 },
  'item/tool/axe': { mode: 'sheet', textureKey: 'tools', asset: GameVisualAssets.toolsUrl, x: 16, y: 0 },
  'item/tool/scythe': { mode: 'sheet', textureKey: 'tools', asset: GameVisualAssets.toolsUrl, x: 32, y: 0 },
  'item/tool/shovel': { mode: 'sheet', textureKey: 'tools', asset: GameVisualAssets.toolsUrl, x: 48, y: 0 },
  'item/seed/wheat': { mode: 'sheet', textureKey: 'basic-plants', asset: GameVisualAssets.basicPlantsUrl, x: 0, y: 0 },
  'item/seed/tomato': { mode: 'sheet', textureKey: 'basic-plants', asset: GameVisualAssets.basicPlantsUrl, x: 0, y: 16 },
  'item/crop/wheat': { mode: 'sheet', textureKey: 'basic-plants', asset: GameVisualAssets.basicPlantsUrl, x: 80, y: 0 },
  'item/crop/tomato': { mode: 'sheet', textureKey: 'basic-plants', asset: GameVisualAssets.basicPlantsUrl, x: 80, y: 16 },
  'item/apple': { mode: 'sheet', textureKey: 'objects', asset: GameVisualAssets.objectsUrl, x: 32, y: 32 },
  'item/raspberry': { mode: 'sheet', textureKey: 'objects', asset: GameVisualAssets.objectsUrl, x: 48, y: 48 },
  'item/egg': { mode: 'sheet', textureKey: 'egg-nest', asset: GameVisualAssets.eggNestUrl, x: 0, y: 0 },
  'item/furniture/bed_green': { mode: 'sheet', textureKey: 'furniture', asset: GameVisualAssets.furnitureUrl, x: 0, y: 32 },
  'item/furniture/bed_blue': { mode: 'sheet', textureKey: 'furniture', asset: GameVisualAssets.furnitureUrl, x: 16, y: 32 },
  'item/furniture/bed_pink': { mode: 'sheet', textureKey: 'furniture', asset: GameVisualAssets.furnitureUrl, x: 32, y: 32 },
  'item/furniture/fence': { mode: 'image', textureKey: 'fence-03', asset: GameVisualAssets.fenceIconUrl, fallbackTint: 0x8b5a2b },
  'item/furniture/path': { mode: 'sheet', textureKey: 'paths', asset: GameVisualAssets.pathsUrl, x: 32, y: 48 },
  'item/furniture/storage_chest_basic': { mode: 'sheet', textureKey: 'chest', asset: GameVisualAssets.chestUrl, x: 0, y: 0, w: 48, h: 48, fallbackTint: 0xb77a42 },
  'item/furniture/daily_task_board': { mode: 'sheet', textureKey: 'daily-task-board-signs', asset: GameVisualAssets.signsSidesUrl, x: 112, y: 0, w: 16, h: 32, fallbackTint: 0xc49a6c },
  'item/golem_part/head': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 245, y: 170, w: 230, h: 190, fallbackTint: 0x879080 },
  'item/golem_part/body': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 615, y: 140, w: 330, h: 300, fallbackTint: 0x8c927f },
  'item/golem_part/left_arm': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 250, y: 555, w: 230, h: 360, fallbackTint: 0x777d6f },
  'item/golem_part/right_arm': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 1110, y: 90, w: 270, h: 410, fallbackTint: 0x777d6f },
  'item/golem_part/left_foot': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 660, y: 575, w: 220, h: 310, fallbackTint: 0x6f7568 },
  'item/golem_part/right_foot': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 1115, y: 585, w: 220, h: 300, fallbackTint: 0x6f7568 },
  'item/tool/flashlight': { mode: 'image', textureKey: 'flashlight', asset: GameVisualAssets.flashlightUrl, fallbackTint: 0xffe27a },
  'item/house/greenhouse_blueprint': { mode: 'image', textureKey: 'house-greenhouse-close', asset: GameVisualAssets.greenhouseCloseUrl, fallbackTint: 0x70b76c },
  'item/house/key': { mode: 'image', textureKey: 'house-key', asset: GameVisualAssets.houseKeyUrl, fallbackTint: 0xf4c542 },
  'item/pet/laoli_cat': { mode: 'tint', tint: TINTS['item/pet/laoli_cat'] },
  'item/pet/cow': { mode: 'tint', tint: TINTS['item/pet/cow'] },
  'house/greenhouse_step0': { mode: 'image', textureKey: 'house-greenhouse-step0', asset: GameVisualAssets.greenhouseStep0Url, fallbackTint: 0x8c7a55 },
  'house/greenhouse_step1': { mode: 'image', textureKey: 'house-greenhouse-step1', asset: GameVisualAssets.greenhouseStep1Url, fallbackTint: 0x8c7a55 },
  'house/greenhouse_step2': { mode: 'image', textureKey: 'house-greenhouse-step2', asset: GameVisualAssets.greenhouseStep2Url, fallbackTint: 0x8c7a55 },
  'house/greenhouse_step3': { mode: 'image', textureKey: 'house-greenhouse-step3', asset: GameVisualAssets.greenhouseStep3Url, fallbackTint: 0x8c7a55 },
  'house/greenhouse_step4': { mode: 'image', textureKey: 'house-greenhouse-step4', asset: GameVisualAssets.greenhouseStep4Url, fallbackTint: 0x8c7a55 },
  'house/greenhouse': { mode: 'image', textureKey: 'house-greenhouse-close', asset: GameVisualAssets.greenhouseCloseUrl, fallbackTint: 0x70b76c },
  'entity/golem/stone_sleep': { mode: 'sheet', textureKey: 'entity-golem-stone-wakeup', asset: GameVisualAssets.stoneGolemWakeupUrl, x: 97, y: 434, w: 344, h: 145, fallbackTint: 0x6f7470 },
  'entity/golem/stone_wakeup_0': { mode: 'sheet', textureKey: 'entity-golem-stone-wakeup', asset: GameVisualAssets.stoneGolemWakeupUrl, x: 97, y: 434, w: 344, h: 145, fallbackTint: 0x6f7470 },
  'entity/golem/stone_wakeup_1': { mode: 'sheet', textureKey: 'entity-golem-stone-wakeup', asset: GameVisualAssets.stoneGolemWakeupUrl, x: 509, y: 376, w: 345, h: 195, fallbackTint: 0x858873 },
  'entity/golem/stone_wakeup_2': { mode: 'sheet', textureKey: 'entity-golem-stone-wakeup', asset: GameVisualAssets.stoneGolemWakeupUrl, x: 957, y: 322, w: 273, h: 243, fallbackTint: 0x8d927a },
  'entity/golem/stone_awake': { mode: 'sheet', textureKey: 'entity-golem-stone-wakeup', asset: GameVisualAssets.stoneGolemWakeupUrl, x: 1379, y: 295, w: 277, h: 270, fallbackTint: 0x9a9f8f },
  'entity/golem/stone': { mode: 'sheet', textureKey: 'entity-golem-stone-wakeup', asset: GameVisualAssets.stoneGolemWakeupUrl, x: 1379, y: 295, w: 277, h: 270, fallbackTint: 0x9a9f8f },
  'entity/golem/part/head': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 245, y: 170, w: 230, h: 190, fallbackTint: 0x879080 },
  'entity/golem/part/body': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 615, y: 140, w: 330, h: 300, fallbackTint: 0x8c927f },
  'entity/golem/part/left_arm': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 250, y: 555, w: 230, h: 360, fallbackTint: 0x777d6f },
  'entity/golem/part/right_arm': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 1110, y: 90, w: 270, h: 410, fallbackTint: 0x777d6f },
  'entity/golem/part/left_foot': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 660, y: 575, w: 220, h: 310, fallbackTint: 0x6f7568 },
  'entity/golem/part/right_foot': { mode: 'sheet', textureKey: 'entity-golem-stone-part', asset: GameVisualAssets.stoneGolemPartUrl, x: 1115, y: 585, w: 220, h: 300, fallbackTint: 0x6f7568 },
  'item/berry': { mode: 'tint', tint: TINTS['item/berry'] },
  'item/animal_feed': { mode: 'tint', tint: TINTS['item/animal_feed'] },
  'item/storage/chest_basic': { mode: 'sheet', textureKey: 'chest', asset: GameVisualAssets.chestUrl, x: 0, y: 0, w: 48, h: 48, fallbackTint: 0xb77a42 },
  'item/material/log': { mode: 'tint', tint: TINTS['item/material/log'] },
  'item/material/stone': { mode: 'tint', tint: TINTS['item/material/stone'] },
};

const ITEM_VISUAL_ALIASES: Record<string, string> = {
  fruit: 'item/apple',
  apple: 'item/apple',
  raspberry: 'item/raspberry',
  egg: 'item/egg',
  berry: 'item/berry',
  wheat_seed: 'item/seed/wheat',
  wheat: 'item/crop/wheat',
  tomato_seed: 'item/seed/tomato',
  tomato: 'item/crop/tomato',
  watering_can: 'item/tool/watering_can',
  axe: 'item/tool/axe',
  scythe: 'item/tool/scythe',
  shovel: 'item/tool/shovel',
  flashlight: 'item/tool/flashlight',
  bed_green: 'item/furniture/bed_green',
  bed_blue: 'item/furniture/bed_blue',
  bed_pink: 'item/furniture/bed_pink',
  bed_green_flipped: 'item/furniture/bed_green',
  bed_blue_flipped: 'item/furniture/bed_blue',
  bed_pink_flipped: 'item/furniture/bed_pink',
  fence: 'item/furniture/fence',
  path: 'item/furniture/path',
  storage_chest_basic: 'item/furniture/storage_chest_basic',
  daily_task_board: 'item/furniture/daily_task_board',
  golem_part_head: 'item/golem_part/head',
  golem_part_body: 'item/golem_part/body',
  golem_part_left_arm: 'item/golem_part/left_arm',
  golem_part_right_arm: 'item/golem_part/right_arm',
  golem_part_left_foot: 'item/golem_part/left_foot',
  golem_part_right_foot: 'item/golem_part/right_foot',
  animal_feed: 'item/animal_feed',
  house_blueprint_greenhouse: 'item/house/greenhouse_blueprint',
  pet_laoli_cat: 'item/pet/laoli_cat',
  pet_cow: 'item/pet/cow',
  log: 'item/material/log',
  stone: 'item/material/stone',
};

export function getVisual(visualKey: string | null | undefined): GameVisual | null {
  if (!visualKey) return null;
  return GAME_VISUALS[visualKey] ?? null;
}

export function getItemVisualKey(itemId: string | null | undefined): string | null {
  if (!itemId) return null;
  const definition = getGameItemDefinition(itemId);
  return definition?.visualKey || definition?.image || ITEM_VISUAL_ALIASES[itemId] || `item/${itemId}`;
}

export function getItemVisual(itemId: string | null | undefined): GameVisual | null {
  const key = getItemVisualKey(itemId);
  return getVisual(key) ?? (key && TINTS[key] ? { mode: 'tint', tint: TINTS[key] } : null);
}

export function fallbackTintForVisualKey(visualKey: string | null | undefined): number {
  if (!visualKey) return 0xdddddd;
  const visual = getVisual(visualKey);
  if (visual?.mode === 'tint') return visual.tint;
  return visual?.fallbackTint ?? TINTS[visualKey] ?? 0xdddddd;
}

export function fallbackTintForItem(itemId: string | null | undefined): number {
  return fallbackTintForVisualKey(getItemVisualKey(itemId));
}

export function listPhaserPreloadEntries(): PhaserPreloadEntry[] {
  const entries = new Map<string, PhaserPreloadEntry>();
  for (const visual of Object.values(GAME_VISUALS)) {
    if (visual.mode === 'tint') continue;
    if (entries.has(visual.textureKey)) continue;
    entries.set(visual.textureKey, { kind: 'image', textureKey: visual.textureKey, asset: visual.asset });
  }
  return [...entries.values()];
}
