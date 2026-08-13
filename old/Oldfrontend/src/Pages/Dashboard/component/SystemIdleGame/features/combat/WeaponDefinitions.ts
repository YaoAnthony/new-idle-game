export type ProjectileDefinitionId = 'debug_projectile';
export type WeaponDefinitionId = 'debug_blaster';

export interface ProjectileDefinition {
  id: ProjectileDefinitionId;
  label: string;
  speed: number;
  ttlMs: number;
  radius: number;
  color: number;
  damage: number;
  tags: string[];
  capabilities: string[];
}

export interface WeaponDefinition {
  id: WeaponDefinitionId;
  itemId: string;
  label: string;
  projectileId: ProjectileDefinitionId;
  cooldownMs: number;
  tags: string[];
  capabilities: string[];
}

export const PROJECTILE_DEFINITIONS: Record<ProjectileDefinitionId, ProjectileDefinition> = {
  debug_projectile: {
    id: 'debug_projectile',
    label: 'Debug projectile',
    speed: 220,
    ttlMs: 1800,
    radius: 6,
    color: 0xffd166,
    damage: 1,
    tags: ['projectile', 'debug', 'weapon'],
    capabilities: ['projectile', 'damage'],
  },
};

export const WEAPON_DEFINITIONS: Record<WeaponDefinitionId, WeaponDefinition> = {
  debug_blaster: {
    id: 'debug_blaster',
    itemId: 'debug_blaster',
    label: 'Debug blaster',
    projectileId: 'debug_projectile',
    cooldownMs: 300,
    tags: ['weapon', 'debug'],
    capabilities: ['weapon', 'ranged'],
  },
};

export function getProjectileDefinition(id: string): ProjectileDefinition | null {
  return PROJECTILE_DEFINITIONS[id as ProjectileDefinitionId] ?? null;
}

export function getWeaponDefinition(idOrItemId: string): WeaponDefinition | null {
  const direct = WEAPON_DEFINITIONS[idOrItemId as WeaponDefinitionId];
  if (direct) return direct;
  return Object.values(WEAPON_DEFINITIONS).find((definition) => definition.itemId === idOrItemId) ?? null;
}
