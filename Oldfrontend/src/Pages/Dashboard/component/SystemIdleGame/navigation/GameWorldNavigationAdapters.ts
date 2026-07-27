import { WorldNavigationService } from './WorldNavigationService';
import {
  MAIN_WORLD_ID,
  type WorldLocalNavigationAdapter,
  type WorldNavigationActor,
} from './WorldNavigationTypes';

type NavigationScene = {
  npcSystem?: {
    findByName?: (npcName: string) => WorldNavigationActor | null;
  };
  currentMapDefinition?: {
    ref?: {
      worldId?: string;
    };
  };
};

export class NativeWorldNavigationAdapter implements WorldLocalNavigationAdapter {
  constructor(private readonly worldId = MAIN_WORLD_ID) {}

  canHandleWorld(worldId: string): boolean {
    return worldId === this.worldId;
  }

  navigate(actor: WorldNavigationActor, target: Required<{ x: number; y: number; worldId?: string }>, onArrive?: () => void): boolean {
    actor.navigateTo(target.x, target.y, onArrive);
    return true;
  }
}

export function createGameWorldNavigationService(scene: NavigationScene): WorldNavigationService {
  const getWorldId = () => (scene as any).mapRuntimeManager?.getActiveWorldId?.()
    ?? scene.currentMapDefinition?.ref?.worldId
    ?? MAIN_WORLD_ID;
  const service = new WorldNavigationService({
    getActor: (actorName) => scene.npcSystem?.findByName?.(actorName) ?? null,
    getWorldIdAt: () => getWorldId(),
    getActorWorldId: (actorName) => (scene as any).actorWorldPresence?.getActorWorldId?.(actorName, getWorldId())
      ?? getWorldId(),
    getActiveWorldId: () => getWorldId(),
    getPathfinderForWorld: (worldId) => (scene as any).mapRuntimeManager?.getPathfinder?.(worldId)
      ?? ((worldId === getWorldId()) ? (scene as any).pathfinder : null),
    getPortals: () => (scene as any).worldTransitionSystem?.getPortals?.() ?? [],
    transitionActor: (actorName, portal, onComplete) =>
      Boolean((scene as any).worldTransitionSystem?.transitionActor?.(actorName, portal, onComplete)),
    placeActor: (actorName, target) => {
      (scene as any).actorWorldPresence?.moveActor?.(
        actorName,
        'npc',
        target.worldId,
        target.x,
        target.y,
      );
      return Boolean((scene as any).actorWorldPresence);
    },
  });
  service.registerLocalAdapter(new NativeWorldNavigationAdapter(getWorldId()));
  return service;
}
