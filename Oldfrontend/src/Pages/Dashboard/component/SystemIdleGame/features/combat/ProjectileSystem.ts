import Phaser from 'phaser';
import type { EntityRecord, EntitySystem } from '../../systems/EntitySystem';
import {
  getProjectileDefinition,
  type ProjectileDefinition,
} from './WeaponDefinitions';

export interface ProjectileSystemOptions {
  scene: Phaser.Scene;
  entitySystem: EntitySystem;
}

export interface ProjectileView {
  id: string;
  definition: ProjectileDefinition;
  readonly x: number;
  readonly y: number;
  destroy: () => void;
}

export interface ProjectileDamageHandler {
  damageEntity: (
    record: EntityRecord,
    amount: number,
    source: { x: number; y: number },
  ) => boolean;
}

interface ProjectileInstance {
  id: string;
  definition: ProjectileDefinition;
  view: ProjectileView;
  circle: Phaser.GameObjects.Arc;
  velocityX: number;
  velocityY: number;
  expiresAtMs: number;
}

/**
 * Owns short-lived projectile entities.
 *
 * Combat rules are intentionally not here yet; this module only gives weapons
 * a lifecycle adapter that can render, move, register, query, and expire
 * projectiles through EntitySystem.
 */
export class ProjectileSystem {
  private readonly projectiles = new Map<string, ProjectileInstance>();
  private damageHandler: ProjectileDamageHandler | null = null;
  private nextSequence = 1;

  constructor(private readonly options: ProjectileSystemOptions) {}

  setDamageHandler(handler: ProjectileDamageHandler | null): void {
    this.damageHandler = handler;
  }

  spawn(
    definitionId: string,
    x: number,
    y: number,
    direction: { x: number; y: number } = { x: 0, y: -1 },
  ): ProjectileView | null {
    const definition = getProjectileDefinition(definitionId);
    if (!definition) return null;

    const vector = normalizeVector(direction);
    const id = `projectile-${definition.id}-${this.nextSequence++}`;
    const circle = this.options.scene.add
      .circle(x, y, definition.radius, definition.color, 0.95)
      .setStrokeStyle(1, 0xffffff, 0.75)
      .setDepth(y + 120);

    const view: ProjectileView = {
      id,
      definition,
      get x() {
        return circle.x;
      },
      get y() {
        return circle.y;
      },
      destroy: () => this.destroyProjectile(id),
    };

    this.projectiles.set(id, {
      id,
      definition,
      view,
      circle,
      velocityX: vector.x * definition.speed,
      velocityY: vector.y * definition.speed,
      expiresAtMs: (this.options.scene.time?.now ?? 0) + definition.ttlMs,
    });
    this.options.entitySystem.register({
      id,
      kind: 'projectile',
      ref: view,
      x,
      y,
      tags: definition.tags,
      capabilities: definition.capabilities,
      bounds: { width: definition.radius * 2, height: definition.radius * 2 },
      meta: {
        definitionId: definition.id,
        damage: definition.damage,
      },
    });
    return view;
  }

  update(timeMs: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    for (const projectile of [...this.projectiles.values()]) {
      projectile.circle.x += projectile.velocityX * dt;
      projectile.circle.y += projectile.velocityY * dt;
      projectile.circle.setDepth(projectile.circle.y + 120);
      this.options.entitySystem.updatePosition(projectile.id, projectile.circle.x, projectile.circle.y);

      if (this.tryDamageTarget(projectile)) continue;

      if (timeMs >= projectile.expiresAtMs || !this.isInsideWorld(projectile.circle.x, projectile.circle.y)) {
        this.destroyProjectile(projectile.id);
      }
    }
  }

  destroyProjectile(id: string): void {
    const projectile = this.projectiles.get(id);
    if (!projectile) return;
    projectile.circle.destroy();
    this.options.entitySystem.unregister(id);
    this.projectiles.delete(id);
  }

  clear(): void {
    [...this.projectiles.keys()].forEach((id) => this.destroyProjectile(id));
  }

  private isInsideWorld(x: number, y: number): boolean {
    const bounds = this.options.scene.physics?.world?.bounds;
    if (!bounds) return true;
    return x >= bounds.x && y >= bounds.y && x <= bounds.right && y <= bounds.bottom;
  }

  private tryDamageTarget(projectile: ProjectileInstance): boolean {
    if (!this.damageHandler) return false;
    const hitRadius = projectile.definition.radius + 24;
    const hits = this.options.entitySystem.queryNear(
      projectile.circle.x,
      projectile.circle.y,
      hitRadius,
      (record) => record.kind === 'mob' && record.capabilities.has('damage'),
    );
    for (const hit of hits) {
      const damaged = this.damageHandler.damageEntity(hit, projectile.definition.damage, {
        x: projectile.circle.x,
        y: projectile.circle.y,
      });
      if (!damaged) continue;
      this.destroyProjectile(projectile.id);
      return true;
    }
    return false;
  }
}

function normalizeVector(vector: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || length <= 0.0001) return { x: 0, y: -1 };
  return { x: vector.x / length, y: vector.y / length };
}
