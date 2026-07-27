import Phaser from 'phaser';
import type { ActorCombatSystem, CombatDamageTarget, CombatSourcePoint } from '../combat';
import type { EntityRecord, EntitySystem } from '../../systems/EntitySystem';
import type { Pathfinder } from '../../systems/Pathfinder';
import { gameBus } from '../../shared/EventBus';
import { PathingComponent } from '../../shared/PathingComponent';
import type { EntityState, WorldState } from '../../shared/worldStateTypes';
import type { WorldStateManager } from '../../shared/WorldStateManager';
import {
  getSlimeDefinition,
  getSlimeDefinitions,
  isSlimeDefinitionId,
  type SlimeDefinition,
  type SlimeDefinitionId,
} from './MobDefinitions';

const SLIME_REPATH_MS = 750;
const SLIME_REPATH_TARGET_DISTANCE = 24;
const SLIME_NEAREST_REACHABLE_TARGET_RADIUS = 128;
const SLIME_DEATH_REMOVE_DELAY_MS = 160;

export interface SlimeSystemOptions {
  scene: Phaser.Scene;
  worldStateManager: WorldStateManager;
  entitySystem: EntitySystem;
  combatSystem: ActorCombatSystem;
  pathfinder: Pathfinder | null;
  getPlayerTarget: () => CombatDamageTarget | null;
  getNpcTargets: () => CombatDamageTarget[];
  getWorldIdAt: (x: number, y: number) => string;
  getObstacleGroup: () => Phaser.Physics.Arcade.StaticGroup | null;
  isPaused: () => boolean;
}

export interface SpawnSlimeOptions {
  id?: string;
  health?: number;
  worldId?: string;
  skipSave?: boolean;
}

export interface SlimeView {
  id: string;
  definition: SlimeDefinition;
  sprite: Phaser.Physics.Arcade.Sprite;
  readonly x: number;
  readonly y: number;
  getHealth: () => number;
  isDowned: () => boolean;
  destroy: () => void;
}

interface SlimeInstance {
  id: string;
  definition: SlimeDefinition;
  sprite: Phaser.Physics.Arcade.Sprite;
  worldId: string;
  pathing: PathingComponent;
  health: number;
  dying: boolean;
  lastRepathAtMs: number;
  lastPathTarget: { id: string; x: number; y: number } | null;
  lastAttackByTargetId: Map<string, number>;
  collider: Phaser.Physics.Arcade.Collider | null;
  view: SlimeView;
}

export class SlimeSystem {
  private readonly instances = new Map<string, SlimeInstance>();

  constructor(private readonly options: SlimeSystemOptions) {
    this.ensureAnimations();
  }

  canGenerate(definitionId: string): boolean {
    return isSlimeDefinitionId(definitionId);
  }

  spawn(definitionId: string, x: number, y: number, spawnOptions: SpawnSlimeOptions = {}): SlimeView | null {
    const definition = getSlimeDefinition(definitionId);
    if (!definition) return null;

    const id = spawnOptions.id ?? makeSlimeId(definition.id);
    if (this.instances.has(id)) this.removeSlime(id, { emitSave: false });
    const worldId = spawnOptions.worldId ?? this.options.getWorldIdAt(x, y);

    const sprite = this.options.scene.physics.add
      .sprite(x, y, definition.textureKey, 0)
      .setScale(definition.scale)
      .setCollideWorldBounds(true)
      .setDepth(y + 96);
    sprite.play(definition.animationKey);

    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(definition.body.width, definition.body.height);
    body.setOffset(definition.body.offsetX, definition.body.offsetY);

    const pathing = new PathingComponent(definition.speed, definition.reachDistance, this.options.pathfinder);
    const instance = {} as SlimeInstance;
    const view: SlimeView = {
      id,
      definition,
      sprite,
      get x() {
        return sprite.x;
      },
      get y() {
        return sprite.y;
      },
      getHealth: () => instance.health,
      isDowned: () => instance.health <= 0,
      destroy: () => this.removeSlime(id),
    };

    Object.assign(instance, {
      id,
      definition,
      sprite,
      worldId,
      pathing,
      health: normalizeSlimeHealth(spawnOptions.health ?? definition.maxHealth, definition.maxHealth),
      dying: false,
      lastRepathAtMs: 0,
      lastPathTarget: null,
      lastAttackByTargetId: new Map<string, number>(),
      collider: null,
      view,
    } satisfies SlimeInstance);

    const obstacles = this.options.getObstacleGroup();
    instance.collider = obstacles ? this.options.scene.physics.add.collider(sprite, obstacles) : null;
    this.instances.set(id, instance);
    this.registerRuntime(instance);

    if (!spawnOptions.skipSave) {
      gameBus.emit('game:save_requested', { reason: `mob:${id}:spawn` });
    }
    return view;
  }

  restoreFromWorldState(worldState: Partial<WorldState> | null | undefined): void {
    const slimeEntities = Object.values(worldState?.entities ?? {})
      .filter((entity): entity is EntityState => Boolean(entity && entity.kind === 'mob' && readSlimeDefinitionId(entity)));
    const desiredIds = new Set(slimeEntities.map((entity) => entity.id));

    for (const id of [...this.instances.keys()]) {
      if (!desiredIds.has(id)) this.removeSlime(id, { emitSave: false });
    }

    for (const entity of slimeEntities) {
      const definitionId = readSlimeDefinitionId(entity);
      if (!definitionId) continue;
      const definition = getSlimeDefinition(definitionId);
      if (!definition) continue;
      const health = normalizeSlimeHealth(entity.meta?.health, definition.maxHealth);
      if (health <= 0) {
        this.options.worldStateManager.unregisterEntity(entity.id);
        continue;
      }
      this.spawn(definition.id, entity.x, entity.y, {
        id: entity.id,
        health,
        worldId: entity.worldId,
        skipSave: true,
      });
    }
  }

  update(timeMs: number, deltaMs: number): void {
    if (this.options.isPaused()) {
      this.stopAll();
      return;
    }

    const dtSeconds = deltaMs / 1000;
    for (const instance of [...this.instances.values()]) {
      if (!instance.sprite.active) continue;
      if (instance.dying || instance.health <= 0) {
        this.stopInstance(instance);
        continue;
      }
      this.updateSlime(instance, timeMs, dtSeconds);
    }
  }

  damageSlime(id: string, amount: number, source?: CombatSourcePoint | null): number {
    const instance = this.instances.get(id);
    if (!instance || instance.dying || instance.health <= 0) return 0;
    return this.options.combatSystem.applyDamage({
      target: this.toDamageTarget(instance),
      amount,
      source,
    });
  }

  damageEntity(record: EntityRecord, amount: number, source?: CombatSourcePoint | null): boolean {
    if (record.kind !== 'mob') return false;
    return this.damageSlime(record.id, amount, source) > 0;
  }

  getViews(): SlimeView[] {
    return [...this.instances.values()].map((instance) => instance.view);
  }

  clearAll(): void {
    for (const id of [...this.instances.keys()]) this.removeSlime(id, { emitSave: false });
  }

  private updateSlime(instance: SlimeInstance, timeMs: number, dtSeconds: number): void {
    const target = this.findNearestTarget(instance);
    if (!target) {
      instance.pathing.clearNavigation();
      this.stopInstance(instance);
      this.syncRuntimeState(instance);
      return;
    }

    const distance = Phaser.Math.Distance.Between(instance.sprite.x, instance.sprite.y, target.sprite.x, target.sprite.y);
    if (distance <= instance.definition.contactRange) {
      this.tryContactDamage(instance, target, timeMs);
    }

    if (distance <= instance.definition.reachDistance) {
      this.stopInstance(instance);
    } else {
      if (this.shouldRepath(instance, target, timeMs)) this.repathToTarget(instance, target, timeMs);
      const status = instance.pathing.update(instance.sprite, this.options.scene);
      if (status === 'failed' || status === 'idle') {
        if (this.options.pathfinder) this.stopInstance(instance);
        else this.chaseDirectly(instance, target, dtSeconds);
      }
    }

    this.updateSpriteFacing(instance);
    this.syncRuntimeState(instance);
  }

  private findNearestTarget(instance: SlimeInstance): CombatDamageTarget | null {
    const candidates = [
      this.options.getPlayerTarget(),
      ...this.options.getNpcTargets(),
    ].filter((target): target is CombatDamageTarget => Boolean(
      target
      && target.sprite?.active
      && !target.isDowned?.()
      && this.resolveTargetWorldId(target) === instance.worldId,
    ));

    let best: CombatDamageTarget | null = null;
    let bestDistanceSq = Infinity;
    for (const target of candidates) {
      const dx = target.sprite.x - instance.sprite.x;
      const dy = target.sprite.y - instance.sprite.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestDistanceSq) {
        best = target;
        bestDistanceSq = distanceSq;
      }
    }
    return best;
  }

  private shouldRepath(instance: SlimeInstance, target: CombatDamageTarget, timeMs: number): boolean {
    const last = instance.lastPathTarget;
    if (!last || last.id !== target.id) return true;
    if (timeMs - instance.lastRepathAtMs < SLIME_REPATH_MS) return false;
    if (!instance.pathing.isMoving()) return true;
    return Phaser.Math.Distance.Between(last.x, last.y, target.sprite.x, target.sprite.y) >= SLIME_REPATH_TARGET_DISTANCE;
  }

  private repathToTarget(instance: SlimeInstance, target: CombatDamageTarget, timeMs: number): void {
    instance.pathing.navigateToNearestReachable(
      instance.sprite.x,
      instance.sprite.y,
      target.sprite.x,
      target.sprite.y,
      SLIME_NEAREST_REACHABLE_TARGET_RADIUS,
    );
    instance.lastRepathAtMs = timeMs;
    instance.lastPathTarget = {
      id: target.id,
      x: target.sprite.x,
      y: target.sprite.y,
    };
    if (instance.pathing.status === 'failed') instance.pathing.clearNavigation();
  }

  private chaseDirectly(instance: SlimeInstance, target: CombatDamageTarget, dtSeconds: number): void {
    const body = instance.sprite.body as Phaser.Physics.Arcade.Body;
    const dx = target.sprite.x - instance.sprite.x;
    const dy = target.sprite.y - instance.sprite.y;
    const length = Math.hypot(dx, dy);
    if (length <= instance.definition.reachDistance || dtSeconds <= 0) {
      this.stopInstance(instance);
      return;
    }
    body.setVelocity(
      (dx / length) * instance.definition.speed,
      (dy / length) * instance.definition.speed,
    );
  }

  private tryContactDamage(instance: SlimeInstance, target: CombatDamageTarget, timeMs: number): void {
    const lastAttack = instance.lastAttackByTargetId.get(target.id) ?? -Infinity;
    if (timeMs - lastAttack < instance.definition.contactCooldownMs) return;
    const changed = this.options.combatSystem.applyDamage({
      target,
      amount: instance.definition.damage,
      source: { x: instance.sprite.x, y: instance.sprite.y },
    });
    if (changed > 0) instance.lastAttackByTargetId.set(target.id, timeMs);
  }

  private toDamageTarget(instance: SlimeInstance): CombatDamageTarget {
    return {
      id: instance.id,
      kind: 'mob',
      sprite: instance.sprite,
      damage: (amount) => this.applySlimeDamage(instance, amount),
      isDowned: () => instance.health <= 0,
      clearNavigation: () => {
        instance.pathing.clearNavigation();
        this.stopInstance(instance);
      },
    };
  }

  private applySlimeDamage(instance: SlimeInstance, amount: number): number {
    const before = instance.health;
    instance.health = normalizeSlimeHealth(before - Number(amount || 0), instance.definition.maxHealth);
    const changed = before - instance.health;
    if (changed <= 0) return 0;

    this.syncRuntimeState(instance);
    this.playSlimeHitSound(instance);
    gameBus.emit('game:save_requested', { reason: `mob:${instance.id}:damage` });
    if (instance.health <= 0) this.scheduleSlimeRemoval(instance);
    return changed;
  }

  private scheduleSlimeRemoval(instance: SlimeInstance): void {
    if (instance.dying) return;
    instance.dying = true;
    this.stopInstance(instance);
    const body = instance.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;
    this.syncRuntimeState(instance);
    this.options.scene.time.delayedCall(SLIME_DEATH_REMOVE_DELAY_MS, () => {
      this.removeSlime(instance.id, { reason: `mob:${instance.id}:defeated` });
    });
  }

  private registerRuntime(instance: SlimeInstance): void {
    const worldId = instance.worldId;
    const meta = this.buildMeta(instance);
    this.options.worldStateManager.registerEntity({
      id: instance.id,
      kind: 'mob',
      displayName: instance.definition.label,
      x: instance.sprite.x,
      y: instance.sprite.y,
      worldId,
      state: instance.health <= 0 ? 'downed' : 'active',
      meta,
    });
    this.options.entitySystem.register({
      id: instance.id,
      kind: 'mob',
      ref: instance.view,
      x: instance.sprite.x,
      y: instance.sprite.y,
      worldId,
      tags: ['mob', 'hostile', 'slime'],
      capabilities: ['damage', 'contact_damage', 'knockback'],
      bounds: {
        width: instance.definition.body.width * instance.definition.scale,
        height: instance.definition.body.height * instance.definition.scale,
      },
      meta,
    });
  }

  private syncRuntimeState(instance: SlimeInstance): void {
    const meta = this.buildMeta(instance);
    const worldId = instance.worldId;
    this.options.worldStateManager.updateEntityPosition(instance.id, instance.sprite.x, instance.sprite.y, worldId);
    this.options.worldStateManager.patchEntity(instance.id, {
      worldId,
      state: instance.health <= 0 ? 'downed' : 'active',
      meta,
    });
    this.options.entitySystem.updatePosition(instance.id, instance.sprite.x, instance.sprite.y, worldId);
    this.options.entitySystem.update(instance.id, { meta });
  }

  private buildMeta(instance: SlimeInstance): Record<string, unknown> {
    return {
      mobDefinitionId: instance.definition.id,
      worldId: instance.worldId,
      damage: instance.definition.damage,
      health: instance.health,
      maxHealth: instance.definition.maxHealth,
      hostile: true,
      downed: instance.health <= 0,
    };
  }

  private resolveTargetWorldId(target: CombatDamageTarget): string {
    return this.options.worldStateManager.getEntity(target.id)?.worldId
      ?? this.options.entitySystem.getRecord(target.id)?.worldId
      ?? this.options.getWorldIdAt(target.sprite.x, target.sprite.y);
  }

  private updateSpriteFacing(instance: SlimeInstance): void {
    const body = instance.sprite.body as Phaser.Physics.Arcade.Body;
    if (Math.abs(body.velocity.x) > 1) instance.sprite.setFlipX(body.velocity.x < 0);
    if (instance.sprite.anims.currentAnim?.key !== instance.definition.animationKey) {
      instance.sprite.play(instance.definition.animationKey);
    }
    instance.sprite.setDepth(instance.sprite.y + 96);
  }

  private playSlimeHitSound(instance: SlimeInstance): void {
    gameBus.emit('entity:action_sound', {
      action: 'hit',
      soundId: 'slime-hit',
      actorId: instance.id,
      actorKind: 'mob',
      x: instance.sprite.x,
      y: instance.sprite.y,
      worldId: instance.worldId,
      tag: `entity:slime:${instance.id}:hit`,
      volume: 0.44,
      rate: Phaser.Math.FloatBetween(0.92, 1.06),
      source: 'local',
    });
  }

  private stopAll(): void {
    for (const instance of this.instances.values()) this.stopInstance(instance);
  }

  private stopInstance(instance: SlimeInstance): void {
    const body = instance.sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.setVelocity(0, 0);
  }

  private removeSlime(
    id: string,
    options: { reason?: string; emitSave?: boolean } = {},
  ): void {
    const instance = this.instances.get(id);
    if (!instance) return;
    instance.pathing.clearNavigation();
    instance.collider?.destroy();
    instance.sprite.destroy();
    this.options.entitySystem.unregister(id);
    this.options.worldStateManager.unregisterEntity(id);
    this.instances.delete(id);
    if (options.emitSave !== false) {
      gameBus.emit('game:save_requested', { reason: options.reason ?? `mob:${id}:removed` });
    }
  }

  private ensureAnimations(): void {
    for (const definition of getSlimeDefinitions()) {
      if (this.options.scene.anims.exists(definition.animationKey)) continue;
      this.options.scene.anims.create({
        key: definition.animationKey,
        frames: this.options.scene.anims.generateFrameNumbers(definition.textureKey, { start: 0, end: 3 }),
        frameRate: 5,
        repeat: -1,
      });
    }
  }
}

function readSlimeDefinitionId(entity: EntityState): SlimeDefinitionId | null {
  const raw = entity.meta?.mobDefinitionId ?? entity.meta?.definitionId;
  return typeof raw === 'string' && isSlimeDefinitionId(raw) ? raw : null;
}

function normalizeSlimeHealth(value: unknown, maxHealth: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  const next = Number.isFinite(numeric) ? numeric : maxHealth;
  return Math.max(0, Math.min(maxHealth, Math.round(next)));
}

function makeSlimeId(definitionId: SlimeDefinitionId): string {
  return globalThis.crypto?.randomUUID?.()
    ? `mob-${definitionId}-${globalThis.crypto.randomUUID()}`
    : `mob-${definitionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
