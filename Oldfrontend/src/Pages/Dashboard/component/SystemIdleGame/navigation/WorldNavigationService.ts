import {
  MAIN_WORLD_ID,
  type WorldPortal,
  type WorldLocalNavigationAdapter,
  type WorldNavigationActor,
  type WorldNavigationPoint,
  type WorldTransitionAdapter,
} from './WorldNavigationTypes';
import type { Pathfinder } from '../systems/Pathfinder';

type WorldNavigationServiceOptions = {
  getActor: (actorName: string) => WorldNavigationActor | null;
  getWorldIdAt: (x: number, y: number) => string;
  getActorWorldId?: (actorName: string, actor: WorldNavigationActor) => string;
  getActiveWorldId?: () => string;
  getPathfinderForWorld?: (worldId: string) => Pathfinder | null | undefined;
  getPortals?: () => WorldPortal[];
  transitionActor?: (actorName: string, portal: WorldPortal, onComplete?: () => void) => boolean;
  placeActor?: (actorName: string, target: Required<WorldNavigationPoint>) => boolean;
  maxTransitions?: number;
};

export class WorldNavigationService {
  private readonly localAdapters: WorldLocalNavigationAdapter[] = [];
  private readonly transitionAdapters: WorldTransitionAdapter[] = [];
  private readonly maxTransitions: number;

  constructor(private readonly options: WorldNavigationServiceOptions) {
    this.maxTransitions = options.maxTransitions ?? 6;
  }

  registerLocalAdapter(adapter: WorldLocalNavigationAdapter): void {
    this.localAdapters.push(adapter);
  }

  registerTransitionAdapter(adapter: WorldTransitionAdapter): void {
    this.transitionAdapters.push(adapter);
  }

  getWorldIdAt(x: number, y: number): string {
    return this.options.getWorldIdAt(x, y) || MAIN_WORLD_ID;
  }

  getNpcWorldId(npcName: string): string {
    const actor = this.options.getActor(npcName);
    if (!actor?.sprite) return MAIN_WORLD_ID;
    return this.getActorWorldId(npcName, actor);
  }

  navigateNpcToWorldPosition(
    npcName: string,
    target: WorldNavigationPoint,
    onArrive?: () => void,
  ): boolean {
    const actor = this.options.getActor(npcName);
    if (!actor?.sprite) return false;
    const resolvedTarget = this.resolveTarget(target);
    return this.navigateActor(actor, resolvedTarget, onArrive, false, 0);
  }

  transitionNpcToWorld(npcName: string, targetWorldId: string, onArrive?: () => void): boolean {
    const actor = this.options.getActor(npcName);
    if (!actor?.sprite) return false;
    return this.navigateActor(
      actor,
      { x: actor.sprite.x, y: actor.sprite.y, worldId: targetWorldId || MAIN_WORLD_ID },
      onArrive,
      true,
      0,
    );
  }

  private navigateActor(
    actor: WorldNavigationActor,
    target: Required<WorldNavigationPoint>,
    onArrive: (() => void) | undefined,
    transitionOnly: boolean,
    transitionCount: number,
  ): boolean {
    if (transitionCount > this.maxTransitions) return false;

    const actorWorldId = this.getActorWorldId(actor.name, actor);
    if (actorWorldId === target.worldId) {
      if (transitionOnly) {
        onArrive?.();
        return true;
      }
      return this.navigateWithinWorld(actor, target, onArrive);
    }

    const transition = this.resolveTransition(actor, actorWorldId, target);
    if (!transition) return false;

    const continueRoute = () => {
      this.navigateActor(actor, target, onArrive, transitionOnly, transitionCount + 1);
    };
    const activate = () => {
      if ('portal' in transition) {
        this.options.transitionActor?.(actor.name, transition.portal, continueRoute);
        return;
      }
      transition.activate(actor, continueRoute);
    };

    const dx = transition.approach.x - actor.sprite.x;
    const dy = transition.approach.y - actor.sprite.y;
    if (actorWorldId === transition.approach.worldId && dx * dx + dy * dy <= 16) {
      activate();
      return true;
    }
    return this.navigateWithinWorld(actor, transition.approach, activate);
  }

  private navigateWithinWorld(
    actor: WorldNavigationActor,
    target: Required<WorldNavigationPoint>,
    onArrive?: () => void,
  ): boolean {
    const activeWorldId = this.options.getActiveWorldId?.() ?? MAIN_WORLD_ID;
    if (target.worldId !== activeWorldId) {
      if (this.options.placeActor?.(actor.name, target)) {
        onArrive?.();
        return true;
      }
      return false;
    }

    const pathfinder = this.options.getPathfinderForWorld?.(target.worldId) ?? null;
    if (pathfinder) {
      const result = pathfinder.findPathDetailed(actor.sprite.x, actor.sprite.y, target.x, target.y);
      if (!result.reached) return false;
      if (actor.navigateAlongPath) {
        actor.navigateAlongPath(result.waypoints, onArrive, target.worldId);
        return true;
      }
    }

    const adapter = this.localAdapters.find((entry) => entry.canHandleWorld(target.worldId));
    if (adapter) return adapter.navigate(actor, target, onArrive);

    if (target.worldId !== MAIN_WORLD_ID && actor.navigateDirectTo) {
      actor.navigateDirectTo(target.x, target.y, onArrive, target.worldId);
      return true;
    }
    actor.navigateTo(target.x, target.y, onArrive);
    return true;
  }

  private resolveTransition(
    actor: WorldNavigationActor,
    actorWorldId: string,
    target: Required<WorldNavigationPoint>,
  ) {
    const directPortal = this.resolvePortal(actorWorldId, target.worldId);
    if (directPortal) {
      return {
        approach: directPortal.approach,
        portal: directPortal,
      } as const;
    }

    for (const adapter of this.transitionAdapters) {
      const direct = adapter.resolveTransition({
        actor,
        actorWorldId,
        targetWorldId: target.worldId,
        target,
      });
      if (direct) return direct;
    }

    if (actorWorldId !== MAIN_WORLD_ID) {
      const exitPortal = this.resolvePortal(actorWorldId, MAIN_WORLD_ID);
      if (exitPortal) {
        return {
          approach: exitPortal.approach,
          portal: exitPortal,
        } as const;
      }

      for (const adapter of this.transitionAdapters) {
        const exit = adapter.resolveTransition({
          actor,
          actorWorldId,
          targetWorldId: MAIN_WORLD_ID,
          target: { x: actor.sprite.x, y: actor.sprite.y, worldId: MAIN_WORLD_ID },
        });
        if (exit) return exit;
      }
    }

    return null;
  }

  private resolvePortal(fromWorldId: string, toWorldId: string): WorldPortal | null {
    return this.options.getPortals?.().find((portal) => (
      portal.fromWorldId === fromWorldId && portal.toWorldId === toWorldId
    )) ?? null;
  }

  private getActorWorldId(actorName: string, actor: WorldNavigationActor): string {
    return this.options.getActorWorldId?.(actorName, actor)
      ?? this.getWorldIdAt(actor.sprite.x, actor.sprite.y);
  }

  private resolveTarget(target: WorldNavigationPoint): Required<WorldNavigationPoint> {
    return {
      x: target.x,
      y: target.y,
      worldId: target.worldId ?? this.getWorldIdAt(target.x, target.y),
    };
  }
}
