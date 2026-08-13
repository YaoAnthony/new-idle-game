import type { BuildingBehaviorKey, BuildingDefinition, BuildingInstanceSave } from '../BuildingTypes';
import type { BuildingBehavior, BuildingBehaviorContext } from './BuildingBehaviorTypes';
import { DefaultBuildingBehavior } from './DefaultBuildingBehavior';
import { BedBuildingBehavior } from './bed/BedBuildingBehavior';
import { ChoppableBuildingBehavior } from './choppable/ChoppableBuildingBehavior';
import { DailyTaskBoardBehavior } from './dailyTaskBoard/DailyTaskBoardBehavior';
import { FenceBuildingBehavior } from './fence/FenceBuildingBehavior';
import { GolemPartBehavior } from './golem/GolemPartBehavior';
import { HouseBuildingBehavior } from './house/HouseBuildingBehavior';
import { PathBuildingBehavior } from './path/PathBuildingBehavior';
import { StorageBuildingBehavior } from './storage/StorageBuildingBehavior';
import { ClearableBuildingBehavior } from './temple/ClearableBuildingBehavior';
import { FengshuiSourceBehavior } from './temple/FengshuiSourceBehavior';
import { OfferingBasinBehavior } from './temple/OfferingBasinBehavior';
import { WarehouseBehavior } from './temple/WarehouseBehavior';

export class BuildingBehaviorRegistry {
  private readonly behaviors = new Map<BuildingBehaviorKey, BuildingBehavior>();

  constructor(behaviors: BuildingBehavior[] = []) {
    behaviors.forEach((behavior) => this.register(behavior));
  }

  register(behavior: BuildingBehavior): void {
    this.behaviors.set(behavior.key, behavior);
  }

  resolveKeys(definition: BuildingDefinition | null | undefined): BuildingBehaviorKey[] {
    const explicit = definition?.behaviors?.filter(Boolean) ?? [];
    if (explicit.length > 0) return explicit;
    if (!definition) return [];
    if (definition.category === 'path') return ['path_terrain', 'navigation_preference'];
    if (definition.category === 'fence') return ['fence_collision', 'navigation_blocker'];
    if (definition.category === 'house') return ['house', 'blocking', 'interactable', 'upgradeable'];
    if (definition.category === 'storage') return ['storage', 'blocking', 'interactable'];
    if (definition.tags?.includes('bed')) return ['sleep', 'blocking', 'interactable', 'light'];
    return [];
  }

  getBehaviors(definition: BuildingDefinition | null | undefined): BuildingBehavior[] {
    return this.resolveKeys(definition)
      .map((key) => this.behaviors.get(key))
      .filter((behavior): behavior is BuildingBehavior => Boolean(behavior));
  }

  ownsRuntimeView(definition: BuildingDefinition | null | undefined): boolean {
    return this.getBehaviors(definition).some((behavior) => behavior.ownsRuntimeView);
  }

  run(
    hook: Exclude<keyof BuildingBehavior, 'key' | 'ownsRuntimeView'>,
    building: BuildingInstanceSave,
    context: BuildingBehaviorContext,
  ): boolean {
    let handled = false;
    const behaviors = this.getBehaviors(context.definition);
    const targets = behaviors.length > 0 ? behaviors : (context.definition ? [DefaultBuildingBehavior] : []);
    for (const behavior of targets) {
      const fn = behavior[hook] as ((building: BuildingInstanceSave, context: BuildingBehaviorContext) => boolean | void) | undefined;
      const result = fn?.(building, context);
      if (result === true) {
        handled = true;
        if (hook === 'onInteracted') break;
      }
    }
    return handled;
  }

  updateAll(scene: any, playerPosition: { x: number; y: number } | null): void {
    const seen = new Set<BuildingBehavior>();
    for (const behavior of this.behaviors.values()) {
      if (seen.has(behavior) || !behavior.onUpdate) continue;
      seen.add(behavior);
      behavior.onUpdate({ scene, playerPosition });
    }
  }
}

export function createDefaultBuildingBehaviorRegistry(): BuildingBehaviorRegistry {
  return new BuildingBehaviorRegistry([
    DefaultBuildingBehavior,
    PathBuildingBehavior,
    FenceBuildingBehavior,
    HouseBuildingBehavior,
    BedBuildingBehavior,
    StorageBuildingBehavior,
    DailyTaskBoardBehavior,
    ChoppableBuildingBehavior,
    GolemPartBehavior,
    WarehouseBehavior,
    OfferingBasinBehavior,
    ClearableBuildingBehavior,
    FengshuiSourceBehavior,
  ]);
}
