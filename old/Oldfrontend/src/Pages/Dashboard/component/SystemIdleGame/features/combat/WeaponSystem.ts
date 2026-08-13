import type { ProjectileSystem, ProjectileView } from './ProjectileSystem';
import { getWeaponDefinition, type WeaponDefinition } from './WeaponDefinitions';

export interface WeaponSystemOptions {
  projectileSystem: ProjectileSystem;
}

export interface FireWeaponResult {
  ok: boolean;
  definition?: WeaponDefinition;
  projectile?: ProjectileView;
  reason?: string;
}

/**
 * Definition-driven weapon entry point.
 *
 * For now this is a debug seam: weapons resolve a definition and delegate their
 * visible runtime effect to ProjectileSystem. Damage, ownership, ammo, and
 * equipment can be added behind this interface later.
 */
export class WeaponSystem {
  constructor(private readonly options: WeaponSystemOptions) {}

  getDefinition(idOrItemId: string): WeaponDefinition | null {
    return getWeaponDefinition(idOrItemId);
  }

  canGenerate(idOrItemId: string): boolean {
    return Boolean(this.getDefinition(idOrItemId));
  }

  fire(
    idOrItemId: string,
    x: number,
    y: number,
    direction: { x: number; y: number },
  ): FireWeaponResult {
    const definition = this.getDefinition(idOrItemId);
    if (!definition) return { ok: false, reason: 'unknown_weapon' };

    const projectile = this.options.projectileSystem.spawn(definition.projectileId, x, y, direction);
    if (!projectile) return { ok: false, definition, reason: 'projectile_spawn_failed' };
    return { ok: true, definition, projectile };
  }
}
