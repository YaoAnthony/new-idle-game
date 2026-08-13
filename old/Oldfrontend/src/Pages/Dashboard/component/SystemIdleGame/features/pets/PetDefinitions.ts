import type {
  PetAnimationProfile,
  PetColor,
  PetDefinition,
  PetLifeStage,
  PetLifeState,
  PetPersonality,
  PetSpriteSheetDefinition,
} from './PetTypes';

export const DEFAULT_CAT_MOVEMENT = {
  homeRadius: 130,
  followRadius: 210,
  followStopRadius: 58,
  playerCuriosityRadius: 170,
  walkSpeed: 58,
  runSpeed: 72,
};

export const PET_DEFINITIONS: PetDefinition[] = [];

let runtimePetDefinitions: PetDefinition[] | null = null;

export function setRuntimePetDefinitions(definitions: PetDefinition[] | null | undefined): void {
  runtimePetDefinitions = Array.isArray(definitions)
    ? definitions.map(normalizeRuntimePetDefinition).filter(Boolean)
    : null;
}

export function getPetDefinitions(): PetDefinition[] {
  return runtimePetDefinitions !== null ? runtimePetDefinitions : PET_DEFINITIONS;
}

export function hasRuntimePetCatalogLoaded(): boolean {
  return runtimePetDefinitions !== null;
}

export function getPetDefinition(id: string | null | undefined): PetDefinition | null {
  if (!id) return null;
  return getPetDefinitions().find((definition) => definition.id === id || definition.displayName === id) ?? null;
}

export function getPetDefinitionByItemId(itemId: string | null | undefined): PetDefinition | null {
  if (!itemId) return null;
  return getPetDefinitions().find((definition) => definition.itemId === itemId) ?? null;
}

export function getDefaultPetDefinition(): PetDefinition | null {
  return getPetDefinitions()[0] ?? null;
}

export function resolvePetDefinition(input: {
  definitionId?: string;
  petId?: string;
  itemId?: string;
}): PetDefinition | null {
  return getPetDefinition(input.definitionId)
    ?? getPetDefinition(input.petId)
    ?? getPetDefinitionByItemId(input.itemId)
    ?? null;
}

function normalizeRuntimePetDefinition(input: PetDefinition): PetDefinition {
  return {
    ...input,
    species: ['cat', 'dog', 'cow', 'other'].includes(input.species) ? input.species : 'other',
    spriteKey: input.spriteKey ?? 'player',
    spriteSheets: normalizeSpriteSheets(input.spriteSheets),
    animationProfiles: normalizeAnimationProfiles(input.animationProfiles),
    defaultLifeStage: normalizeLifeStage(input.defaultLifeStage),
    defaultColor: normalizeColor(input.defaultColor, 'light'),
    colors: normalizeColors(input.colors),
    growth: {
      babyToAdultGameMinutes: Number.isFinite(Number(input.growth?.babyToAdultGameMinutes))
        ? Math.max(1, Number(input.growth?.babyToAdultGameMinutes))
        : undefined,
    },
    travel: normalizeTravelDefinition(input.travel),
    defaultLife: normalizeLife(input.defaultLife),
    defaultPersonality: normalizePersonality(input.defaultPersonality),
    scale: Number(input.scale ?? 1),
    defaultNeeds: {
      sleepiness: Number(input.defaultNeeds?.sleepiness ?? 30),
      curiosity: Number(input.defaultNeeds?.curiosity ?? 50),
      affection: Number(input.defaultNeeds?.affection ?? 50),
      comfort: Number(input.defaultNeeds?.comfort ?? 60),
    },
    movement: {
      homeRadius: Number(input.movement?.homeRadius ?? DEFAULT_CAT_MOVEMENT.homeRadius),
      followRadius: Number(input.movement?.followRadius ?? DEFAULT_CAT_MOVEMENT.followRadius),
      followStopRadius: Number(input.movement?.followStopRadius ?? DEFAULT_CAT_MOVEMENT.followStopRadius),
      playerCuriosityRadius: Number(input.movement?.playerCuriosityRadius ?? DEFAULT_CAT_MOVEMENT.playerCuriosityRadius),
      walkSpeed: Number(input.movement?.walkSpeed ?? DEFAULT_CAT_MOVEMENT.walkSpeed),
      runSpeed: Number(input.movement?.runSpeed ?? DEFAULT_CAT_MOVEMENT.runSpeed),
    },
    memorySeeds: Array.isArray(input.memorySeeds) ? input.memorySeeds : [],
  };
}

function normalizeTravelDefinition(input: PetDefinition['travel']): PetDefinition['travel'] {
  const source = input && typeof input === 'object' ? input : {};
  const requiredProvisions = normalizeProvisionRules(source.requiredProvisions);
  const rawPreferred = Array.isArray(source.preferredProvisions) ? source.preferredProvisions : [];
  const preferredProvisions = normalizeProvisionRules(rawPreferred).map((rule, index) => {
    const rawRule = rawPreferred[index] as { weightBonus?: unknown } | undefined;
    return {
      ...rule,
      weightBonus: Number.isFinite(Number(rawRule?.weightBonus))
        ? Number(rawRule?.weightBonus)
        : undefined,
    };
  });
  return {
    requiredProvisions,
    preferredProvisions,
  };
}

function normalizeProvisionRules(input: unknown): Array<{ slot?: string; itemId: string; quantity: number }> {
  if (!Array.isArray(input)) return [];
  return input
    .map((rule) => {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null;
      const source = rule as Record<string, unknown>;
      const itemId = String(source.itemId || '').trim();
      const quantity = Number(source.quantity);
      if (!itemId || !Number.isFinite(quantity) || quantity <= 0) return null;
      const slot = String(source.slot || '').trim();
      return {
        ...(slot ? { slot } : {}),
        itemId,
        quantity: Math.max(1, Math.floor(quantity)),
      };
    })
    .filter((rule): rule is { slot?: string; itemId: string; quantity: number } => Boolean(rule));
}

function normalizeLifeStage(value: unknown): PetLifeStage {
  return value === 'baby' || value === 'adult' ? value : 'adult';
}

function normalizeColor(value: unknown, fallback: PetColor | 'random'): PetColor | 'random' {
  return value === 'brown' || value === 'green' || value === 'pink' || value === 'purple' || value === 'light' || value === 'random'
    ? value
    : fallback;
}

function normalizeColors(input: unknown): PetColor[] {
  const values = Array.isArray(input) ? input.map((item) => normalizeColor(item, 'light')).filter((item): item is PetColor => item !== 'random') : [];
  return values.length ? [...new Set(values)] : ['light'];
}

function normalizeLife(input: PetLifeState | undefined): PetLifeState {
  return {
    hunger: clampPercent(input?.hunger ?? 72),
    energy: clampPercent(input?.energy ?? 72),
    health: clampPercent(input?.health ?? 86),
    happiness: clampPercent(input?.happiness ?? 58),
  };
}

function normalizePersonality(input: PetPersonality | undefined): PetPersonality {
  return {
    boldness: clampUnit(input?.boldness ?? 0.35),
    curiosity: clampUnit(input?.curiosity ?? 0.5),
    sociability: clampUnit(input?.sociability ?? 0.45),
    calmness: clampUnit(input?.calmness ?? 0.55),
  };
}

function normalizeSpriteSheets(input: PetSpriteSheetDefinition[] | undefined): PetSpriteSheetDefinition[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((sheet) => ({
      lifeStage: normalizeLifeStage(sheet?.lifeStage),
      color: normalizeColor(sheet?.color, 'light') as PetColor,
      textureKey: String(sheet?.textureKey || ''),
    }))
    .filter((sheet) => Boolean(sheet.textureKey));
}

function normalizeAnimationProfiles(input: PetAnimationProfile[] | undefined): PetAnimationProfile[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((profile) => ({
      lifeStage: normalizeLifeStage(profile?.lifeStage),
      clips: profile?.clips && typeof profile.clips === 'object' ? profile.clips : {},
    }))
    .filter((profile) => Object.keys(profile.clips).length > 0);
}

function clampPercent(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function clampUnit(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
