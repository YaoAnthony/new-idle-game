import type Phaser from 'phaser';
import type { CreatureState } from '../../../../../../Redux/Features/gameSlice';
import type { Interactable } from '../../types';
import { ChickenStateSystem } from './ChickenStateSystem';
import type { ChickenView } from './ChickenView';
import { NestStateSystem } from './NestStateSystem';
import type { NestView } from './NestView';
import type { Pathfinder } from '../../systems/Pathfinder';
import type { RenderSyncSystem } from '../../rendering/RenderSyncSystem';
import type { EntitySystem } from '../../systems/EntitySystem';
import type { WorldActionDispatcher } from '../../systems/WorldActionSystem';
import type { WorldStateManager } from '../../shared/WorldStateManager';

export interface CreatureSystemOptions {
  scene: Phaser.Scene;
  worldStateManager: WorldStateManager;
  entitySystem: EntitySystem;
  renderSyncSystem: RenderSyncSystem;
  pathfinder: Pathfinder;
  registerNestLight: (nest: NestView, worldId?: string) => void;
  removeNestLight: (nestId: string) => void;
  unregisterInteractable: (obj: Interactable) => void;
  unregisterRuntimeObject: (target: object | null | undefined) => void;
}

/**
 * Owns animal and nest runtime lifecycle so the Phaser scene only wires it.
 */
export class CreatureSystem {
  readonly chickenGroup: Phaser.Physics.Arcade.Group;
  readonly chickenEntities: ChickenView[] = [];
  readonly nests: NestView[] = [];
  readonly chickenStateSystem: ChickenStateSystem;
  readonly nestStateSystem: NestStateSystem;

  private readonly chickenWaterSpots: [number, number][] = [];
  private nextChickenSequence = 1;
  private nextNestSequence = 1;

  constructor(private readonly options: CreatureSystemOptions) {
    this.chickenGroup = options.scene.physics.add.group();
    this.nestStateSystem = new NestStateSystem(
      options.scene,
      options.worldStateManager,
      (x, y) => {
        this.spawnChickenAt(x, y);
      },
    );
    this.chickenStateSystem = new ChickenStateSystem(
      options.scene,
      options.worldStateManager,
      this.nestStateSystem,
      this.chickenWaterSpots,
    );
  }

  nextChickenId(): string {
    let id = '';
    do {
      id = `chicken_${this.nextChickenSequence++}`;
    } while (this.chickenEntities.some((chicken) => chicken.id === id));
    return id;
  }

  nextNestId(): string {
    let id = '';
    do {
      id = `nest-${this.nextNestSequence++}`;
    } while (this.nests.some((nest) => nest.id === id));
    return id;
  }

  setActionDispatcher(dispatcher: WorldActionDispatcher | null): void {
    this.nestStateSystem.setActionDispatcher(dispatcher);
    this.chickenStateSystem.setActionDispatcher(dispatcher);
  }

  addColliders(obstacles: Phaser.Physics.Arcade.StaticGroup): void {
    const physics = this.options.scene.physics;
    physics.add.collider(this.chickenGroup, obstacles);
    physics.add.collider(this.chickenGroup, this.chickenGroup);
  }

  spawnChickenAt(x: number, y: number, id?: string, worldId?: string): ChickenView {
    const chickenId = id ?? this.nextChickenId();
    const existing = this.chickenEntities.find((chicken) => chicken.id === chickenId);
    if (existing) return existing;
    const chickenWorldId = worldId ?? (this.options.scene as any).getWorldIdAt?.(x, y) ?? 'world:main';

    const chicken = this.options.renderSyncSystem.spawnChicken(
      this.chickenGroup,
      this.options.pathfinder,
      chickenId,
      x,
      y,
      this.chickenEntities,
    );
    this.chickenStateSystem.registerChicken(chicken, {
      id: chickenId,
      x,
      y,
      worldId: chickenWorldId,
      facing: 'right',
      state: 'wandering',
      thirst: 0,
      growth: 0,
      nextThirstAtGameMinute: ((this.options.scene as any).dayCycle?.absoluteGameMinutes ?? 0) + Math.random() * 12.5 + 12.5,
      nextWanderAtGameMinute: 0,
      stopAtGameMinute: 0,
      actionUntilGameMinute: null,
      nestId: null,
      targetX: null,
      targetY: null,
      meta: { interactable: false },
    });
    this.options.entitySystem.register({
      id: chicken.id,
      kind: 'chicken',
      ref: chicken,
      x,
      y,
      worldId: chickenWorldId,
      meta: { interactable: false },
    });
    return chicken;
  }

  createNest(x: number, y: number, id = this.nextNestId(), worldId?: string): NestView {
    const nestWorldId = worldId ?? (this.options.scene as any).getWorldIdAt?.(x, y) ?? 'world:main';
    const nest = this.options.renderSyncSystem.createNest(id, x, y, this.nests, {
      getState: (nestId) => this.options.worldStateManager.getNestState(nestId),
      onInteract: (nestId) => this.nestStateSystem.handleInteract(nestId),
    });
    this.nestStateSystem.registerNest(nest, {
      id: nest.id,
      x,
      y,
      worldId: nestWorldId,
      state: 'empty',
      occupiedByChickenId: null,
      hasEgg: false,
      hatchAtGameMinute: null,
      laidAtGameMinute: null,
      removed: false,
    });
    this.options.entitySystem.register({
      id: nest.id,
      kind: 'nest',
      ref: nest,
      x,
      y,
      worldId: nestWorldId,
      tags: ['interactable'],
    });
    this.options.registerNestLight(nest, nestWorldId);
    return nest;
  }

  update(absoluteGameMinutes: number, deltaMs: number, playerPosition: { x: number; y: number } | null): void {
    this.chickenStateSystem.update(absoluteGameMinutes, deltaMs);
    this.chickenEntities.forEach((chicken) => {
      if (!chicken.sprite) return;
      const chickenWorldId = this.options.worldStateManager.getChickenState(chicken.id)?.worldId
        ?? (this.options.scene as any).getWorldIdAt?.(chicken.sprite.x, chicken.sprite.y)
        ?? 'world:main';
      this.options.entitySystem.updatePosition(
        chicken.id,
        chicken.sprite.x,
        chicken.sprite.y,
        chickenWorldId,
      );
    });
    if (playerPosition) {
      this.updateNests(playerPosition.x, playerPosition.y, absoluteGameMinutes);
    }
  }

  getCreatureStates(): CreatureState[] {
    return this.options.worldStateManager.getChickenStates().map((state) => ({
      creatureId: state.id,
      type: 'chicken',
      x: state.x,
      y: state.y,
      worldId: state.worldId,
      thirst: state.thirst,
      growth: state.growth,
      state: state.state as CreatureState['state'],
    }));
  }

  clearAll(): void {
    for (const chicken of [...this.chickenEntities]) {
      this.removeChickenView(chicken);
    }
    for (const nest of [...this.nests]) {
      this.removeNestView(nest);
    }
    this.nextChickenSequence = 1;
    this.nextNestSequence = 1;
  }

  restoreCreatures(saved: CreatureState[]): void {
    const savedIds = new Set(saved.map((savedState) => savedState.creatureId));
    for (const chicken of [...this.chickenEntities]) {
      if (!savedIds.has(chicken.id)) {
        this.removeChickenView(chicken);
      }
    }

    saved.forEach((savedState) => {
      const chicken = this.chickenEntities.find((entry) => entry.id === savedState.creatureId)
        ?? this.spawnChickenAt(savedState.x, savedState.y, savedState.creatureId, savedState.worldId);
      this.chickenStateSystem.restoreChickenState(chicken.id, {
        x: savedState.x,
        y: savedState.y,
        worldId: savedState.worldId,
        thirst: savedState.thirst,
        growth: savedState.growth,
        state: savedState.state,
      });
    });
  }

  private removeChickenView(chicken: ChickenView): void {
    chicken.destroy();
    this.chickenStateSystem.unregisterChickenView(chicken.id);
    this.options.worldStateManager.unregisterChickenState(chicken.id);
    this.options.entitySystem.unregister(chicken.id);
    const index = this.chickenEntities.indexOf(chicken);
    if (index >= 0) {
      this.chickenEntities.splice(index, 1);
    }
  }

  private removeNestView(nest: NestView): void {
    this.options.removeNestLight(nest.id);
    this.options.unregisterInteractable(nest);
    this.options.unregisterRuntimeObject(nest);
    this.options.entitySystem.unregister(nest.id);
    this.options.worldStateManager.unregisterNestState(nest.id);
    this.nestStateSystem.unregisterNestView(nest.id);
    nest.destroy();
    const index = this.nests.indexOf(nest);
    if (index >= 0) {
      this.nests.splice(index, 1);
    }
  }

  private updateNests(playerX: number, playerY: number, absoluteGameMinutes: number): void {
    this.nestStateSystem.update(absoluteGameMinutes, playerX, playerY);
    for (let i = this.nests.length - 1; i >= 0; i--) {
      const nest = this.nests[i];
      if (!nest.gone) continue;
      this.removeNestView(nest);
    }
  }
}
