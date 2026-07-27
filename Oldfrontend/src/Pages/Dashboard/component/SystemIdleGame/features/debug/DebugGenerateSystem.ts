import type { GameChest } from '../../../../../../Types/Profile';
import { ITEM_DEF_MAP } from '../../entities/DropItem';
import { getPetDefinition, getPetDefinitionByItemId, getPetDefinitions } from '../pets/PetDefinitions';
import type { PetColor, PetLifeStage } from '../pets/PetTypes';
import { gameBus } from '../../shared/EventBus';
import { resolveBuildingPlacementForItem } from '../building/placement/BuildingPlacementResolver';

export interface DebugGenerateSystemOptions {
  scene: any;
}

/**
 * Debug-only generation entry point.
 *
 * Commands parse text; this module owns the debug dispatch to feature systems
 * so GameSceneCommands does not become another entity owner.
 */
export class DebugGenerateSystem {
  constructor(private readonly options: DebugGenerateSystemOptions) {}

  generateFromCommandArgs(args: string[]): string {
    const parsed = parseGenerateArgs(args);
    if (!parsed) return 'Usage: /generate <entity> [color] [baby|adult] [dx dy]';
    const point = this.resolvePlayerOffset(parsed.dx, parsed.dy);
    if (!point) return 'Player is not ready';
    return this.generateAt(parsed.entityId, point.x, point.y, parsed.petOptions);
  }

  generateFromPlayerOffset(rawEntityId: string, dx: number, dy: number): string {
    const point = this.resolvePlayerOffset(dx, dy);
    if (!point) return 'Player is not ready';
    return this.generateAt(rawEntityId, point.x, point.y);
  }

  generateRewardChestInFront(coins: number, useRandomPlacement: boolean): string {
    const scene = this.options.scene;
    const point = this.getPointInFrontOfPlayer();
    if (!point) return 'Player is not ready';

    const chest: GameChest = {
      id: makeChestId(),
      x: point.x,
      y: point.y,
      rewards: {
        coins,
        items: [],
      },
      opened: false,
      createdAt: scene.dayCycle?.absoluteGameMinutes ?? 0,
    };
    const placedChest = scene.chestSystem?.addChest(chest, {
      placement: useRandomPlacement ? 'random' : 'safe',
    });
    if (!placedChest) return 'Could not place reward chest';
    gameBus.emit('game:chest_spawned', { chest: placedChest });
    gameBus.emit('game:save_requested', { reason: `debug:chest:${placedChest.id}` });
    return `Spawned ${useRandomPlacement ? 'random ' : ''}reward chest`;
  }

  generateAt(rawEntityId: string, x: number, y: number, petOptions: { petColor?: PetColor; petLifeStage?: PetLifeStage } = {}): string {
    const scene = this.options.scene;
    const entityId = normalizeGeneratedId(rawEntityId);
    const building = resolveBuildingPlacementForItem(entityId);

    if (building) {
      const worldId = scene.getWorldIdAt?.(x, y) ?? scene.mapRuntimeManager?.getActiveWorldId?.() ?? 'world:main';
      const requested = scene.buildingSystem?.requestPlacement?.(building.definitionId, building.itemId, { x, y, worldId }) ?? false;
      if (!requested) return `Could not generate building ${entityId}`;
      return `Requested building ${building.definitionId} at ${x}, ${y}`;
    }

    if (entityId === 'golem' || entityId === 'stone_golem') {
      const worldId = scene.getWorldIdAt?.(x, y) ?? scene.mapRuntimeManager?.getActiveWorldId?.() ?? 'world:main';
      gameBus.emit('game:golem_spawn_requested', {
        golemId: `debug-golem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        x,
        y,
        worldId,
        state: 'dormant',
        absoluteGameMinutes: scene.dayCycle?.absoluteGameMinutes ?? 0,
      });
      return `Requested dormant stone golem at ${x}, ${y}`;
    }

    if (scene.slimeSystem?.canGenerate?.(entityId)) {
      const slime = scene.slimeSystem.spawn(entityId, x, y, { skipSave: true });
      if (!slime) return `Could not generate ${entityId}`;
      requestDebugSave(entityId);
      return `Generated ${slime.definition.label} ${slime.id} at ${x}, ${y}`;
    }

    if (entityId === 'nest') {
      if (!scene.creatureSystem) return 'Creature system is not ready';
      const nest = scene.creatureSystem.createNest(x, y);
      requestDebugSave(entityId);
      return `Generated nest ${nest.id} at ${x}, ${y}`;
    }

    if (entityId === 'chicken') {
      if (!scene.creatureSystem) return 'Creature system is not ready';
      const chicken = scene.creatureSystem.spawnChickenAt(x, y);
      requestDebugSave(entityId);
      return `Generated chicken ${chicken.id} at ${x}, ${y}`;
    }

    if (entityId === 'chest') {
      const chest: GameChest = {
        id: makeChestId(),
        x,
        y,
        rewards: {
          coins: 100,
          items: [],
        },
        opened: false,
        createdAt: scene.dayCycle?.absoluteGameMinutes ?? 0,
      };
      const placedChest = scene.chestSystem?.addChest(chest, { placement: 'safe' });
      if (!placedChest) return 'Could not place reward chest';
      gameBus.emit('game:chest_spawned', { chest: placedChest });
      requestDebugSave(entityId);
      return `Generated reward chest at ${placedChest.x}, ${placedChest.y}`;
    }

    if (entityId === 'debug_projectile') {
      const projectile = scene.projectileSystem?.spawn?.(entityId, x, y, this.getPlayerFacingVector());
      if (!projectile) return 'Could not generate debug projectile';
      return `Generated debug projectile ${projectile.id} at ${x}, ${y}`;
    }

    if (scene.weaponSystem?.canGenerate?.(entityId)) {
      const playerPosition = this.getPlayerPosition();
      if (!playerPosition) return 'Player is not ready';
      const direction = { x: x - playerPosition.x, y: y - playerPosition.y };
      const result = scene.weaponSystem.fire(entityId, playerPosition.x, playerPosition.y, direction);
      if (!result.ok) return `Could not fire ${entityId}: ${result.reason ?? 'unknown error'}`;
      return `Fired ${result.definition?.label ?? entityId}`;
    }

    if (!isExplicitDropId(rawEntityId)) {
      const petDefinition = getPetDefinition(entityId) ?? getPetDefinitionByItemId(entityId);
      if (petDefinition) {
        const result = scene.dispatchWorldAction?.({
          type: 'PLACE_PET',
          actorId: 'debug',
          itemId: petDefinition.itemId,
          petDefinitionId: petDefinition.id,
          petColor: petOptions.petColor,
          petLifeStage: petOptions.petLifeStage,
          birthGameMinute: scene.dayCycle?.absoluteGameMinutes ?? 0,
          x,
          y,
          worldId: scene.getWorldIdAt?.(x, y),
          home: {
            x,
            y,
            worldId: scene.getWorldIdAt?.(x, y),
          },
        });
        if (!result?.ok) return `Could not generate pet ${petDefinition.id}`;
        requestDebugSave(`pet:${petDefinition.id}`);
        const variant = [petOptions.petColor, petOptions.petLifeStage].filter(Boolean).join(' ');
        return `Generated ${variant ? `${variant} ` : ''}${petDefinition.displayName} at ${x}, ${y}`;
      }
    }

    const dropItemId = normalizeDropItemId(entityId);
    const itemDef = ITEM_DEF_MAP.get(dropItemId);
    if (itemDef) {
      const result = scene.dispatchWorldAction?.({
        type: 'DROP_ITEM',
        actorId: 'debug',
        itemId: dropItemId,
        x,
        y,
      });
      if (!result?.ok) return `Could not generate item ${dropItemId}`;
      requestDebugSave(`drop:${dropItemId}`);
      return `Generated ${itemDef.label ?? dropItemId} drop at ${x}, ${y}`;
    }

    return `Unknown generated entity: ${rawEntityId}`;
  }

  private resolvePlayerOffset(dx: number, dy: number): { x: number; y: number } | null {
    const scene = this.options.scene;
    const base = this.getPlayerPosition();
    if (!base) return null;

    const maxX = Math.max(32, Number(scene.currentMapDefinition?.worldWidth ?? scene.physics?.world?.bounds?.width ?? base.x));
    const maxY = Math.max(32, Number(scene.currentMapDefinition?.worldHeight ?? scene.physics?.world?.bounds?.height ?? base.y));
    return {
      x: Math.round(clamp(base.x + dx, 32, maxX - 32)),
      y: Math.round(clamp(base.y + dy, 32, maxY - 32)),
    };
  }

  private getPlayerPosition(): { x: number; y: number } | null {
    const scene = this.options.scene;
    const position = scene.playerSystem?.getPosition?.();
    if (position) return position;
    const sprite = scene.player?.sprite;
    return sprite ? { x: sprite.x, y: sprite.y } : null;
  }

  private getPointInFrontOfPlayer(distance = 96): { x: number; y: number } | null {
    const scene = this.options.scene;
    const player = scene.player?.sprite;
    if (!player) return null;

    const facing = scene.player?.facing ?? 'down';
    let x = player.x;
    let y = player.y;

    if (facing === 'up') y -= distance;
    else if (facing === 'left') x -= distance;
    else if (facing === 'right') x += distance;
    else y += distance;

    const maxX = Math.max(32, Number(scene.currentMapDefinition?.worldWidth ?? scene.physics?.world?.bounds?.width ?? x));
    const maxY = Math.max(32, Number(scene.currentMapDefinition?.worldHeight ?? scene.physics?.world?.bounds?.height ?? y));
    return {
      x: Math.round(clamp(x, 32, maxX - 32)),
      y: Math.round(clamp(y, 32, maxY - 32)),
    };
  }

  private getPlayerFacingVector(): { x: number; y: number } {
    const scene = this.options.scene;
    const facing = scene.playerSystem?.getFacing?.() ?? scene.player?.facing ?? 'down';
    if (facing === 'up') return { x: 0, y: -1 };
    if (facing === 'left') return { x: -1, y: 0 };
    if (facing === 'right') return { x: 1, y: 0 };
    return { x: 0, y: 1 };
  }
}

function parseGenerateArgs(args: string[]): {
  entityId: string;
  dx: number;
  dy: number;
  petOptions: { petColor?: PetColor; petLifeStage?: PetLifeStage };
} | null {
  const entityId = args[0];
  if (!entityId) return null;
  const rest = args.slice(1);
  let dx = 0;
  let dy = 0;
  let variantTokens = rest;
  if (rest.length >= 2) {
    const maybeDx = Number(rest[rest.length - 2]);
    const maybeDy = Number(rest[rest.length - 1]);
    if (Number.isFinite(maybeDx) && Number.isFinite(maybeDy)) {
      dx = maybeDx;
      dy = maybeDy;
      variantTokens = rest.slice(0, -2);
    }
  }

  const petOptions: { petColor?: PetColor; petLifeStage?: PetLifeStage } = {};
  for (const token of variantTokens.map((item) => item.toLowerCase())) {
    if (isPetColor(token)) petOptions.petColor = token;
    else if (token === 'baby' || token === 'adult') petOptions.petLifeStage = token;
    else return null;
  }
  return { entityId, dx, dy, petOptions };
}

function normalizeGeneratedId(raw: string): string {
  const id = raw.toLowerCase();
  if (id === 'bed') return 'bed_pink';
  if (id === 'projectile') return 'debug_projectile';
  if (id === 'weapon') return 'debug_blaster';
  if (id === 'stone-golem' || id === 'stone:golem') return 'stone_golem';
  if (id === 'pet') return getPetDefinitions()[0]?.id ?? 'pet';
  if (id === 'wood_fence' || id === 'wooden_fence') return 'fence';
  if (id === 'paths' || id === 'road' || id === 'dirt_path' || id === 'dirt-path') return 'path';
  if (/^pet[:_-]/.test(id)) return id.replace(/^pet[:_-]/, '');
  return id;
}

function isPetColor(value: string): value is PetColor {
  return value === 'light' || value === 'brown' || value === 'green' || value === 'pink' || value === 'purple';
}

function normalizeDropItemId(raw: string): string {
  return raw
    .replace(/^drop[:_-]/, '')
    .replace(/^item[:_-]/, '');
}

function isExplicitDropId(raw: string): boolean {
  return /^drop[:_-]/i.test(raw) || /^item[:_-]/i.test(raw);
}

function makeChestId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `debug-chest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function requestDebugSave(entityId: string): void {
  gameBus.emit('game:save_requested', { reason: `debug:generate:${entityId}` });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
