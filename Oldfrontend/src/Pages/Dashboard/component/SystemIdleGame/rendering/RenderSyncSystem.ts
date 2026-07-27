import Phaser from 'phaser';
import type { FacingDirection } from '../../../../../Types/Profile';
import type { Direction } from '../types';
import { ChickenView } from '../features/creatures/ChickenView';
import { NestView } from '../features/creatures/NestView';
import { RemotePlayer } from '../entities/RemotePlayer';
import type { Npc } from '../entities/Npc';
import type { Player } from '../entities/Player';
import { TreeView } from '../features/farming/TreeView';
import type { WorldStateManager } from '../shared/WorldStateManager';
import type { Pathfinder } from '../systems/Pathfinder';

interface RenderSyncCallbacks {
  registerInteractable: (obj: { interact(): void; isNearPlayer(px: number, py: number, radius?: number): boolean }) => void;
  unregisterInteractable: (obj: { interact(): void; isNearPlayer(px: number, py: number, radius?: number): boolean }) => void;
}

/**
 * RenderSyncSystem keeps Phaser view creation/destruction and world->view sync
 * out of GameScene. It is still a compatibility layer, not a new truth source.
 */
export class RenderSyncSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldStateManager: WorldStateManager,
    private readonly callbacks: RenderSyncCallbacks,
  ) {}

  registerCoreWorldEntities(player: Player, npc: Npc | null, extraNpcs: Npc[]): void {
    this.worldStateManager.registerEntity({
      id: 'player',
      kind: 'player',
      x: player.sprite.x,
      y: player.sprite.y,
      worldId: this.getActiveWorldId(),
      facing: player.facing as FacingDirection,
      meta: {
        interactable: false,
        health: player.getHealth?.(),
        downed: player.isDowned?.() ?? false,
      },
    });
    if (npc) {
      this.worldStateManager.registerEntity({
        id: npc.name,
        kind: 'npc',
        x: npc.sprite.x,
        y: npc.sprite.y,
        worldId: this.getActorWorldId(npc.name),
        displayName: npc.name,
        state: npc.isDowned?.() ? 'downed' : 'active',
        meta: {
          interactable: true,
          health: npc.getHealth?.(),
          downed: npc.isDowned?.() ?? false,
        },
      });
    }
    extraNpcs.forEach((entry) => {
      this.worldStateManager.registerEntity({
        id: entry.name,
        kind: 'npc',
        x: entry.sprite.x,
        y: entry.sprite.y,
        worldId: this.getActorWorldId(entry.name),
        displayName: entry.name,
        state: entry.isDowned?.() ? 'downed' : 'active',
        meta: {
          interactable: true,
          health: entry.getHealth?.(),
          downed: entry.isDowned?.() ?? false,
        },
      });
    });
  }

  syncWorldStateMeta(absoluteGameMinutes: number, timeStr: string): void {
    this.worldStateManager.setMeta({
      absoluteGameMinutes: absoluteGameMinutes,
      dayTime: timeStr,
      version: (this.worldStateManager.getState().meta.version ?? 0) + 1,
    });
  }

  syncDynamicEntityStates(params: {
    player: Player;
    npc: Npc | null;
    extraNpcs: Npc[];
    chickens: ChickenView[];
    remotePlayer: RemotePlayer | null;
  }): void {
    const {
      player,
      npc,
      extraNpcs,
      chickens,
      remotePlayer,
    } = params;

    this.worldStateManager.syncEntity({
      id: 'player',
      x: player.sprite.x,
      y: player.sprite.y,
      worldId: this.getActiveWorldId(),
    });
    this.worldStateManager.patchEntity('player', {
      facing: player.facing,
      meta: {
        ...(this.worldStateManager.getEntity('player')?.meta ?? {}),
        health: player.getHealth?.(),
        downed: player.isDowned?.() ?? false,
      },
    });

    if (npc) {
      this.worldStateManager.syncEntity({
        id: npc.name,
        x: npc.sprite.x,
        y: npc.sprite.y,
        worldId: this.getActorWorldId(npc.name),
      });
      this.worldStateManager.patchEntity(npc.name, {
        state: npc.isDowned?.() ? 'downed' : 'active',
        meta: {
          ...(this.worldStateManager.getEntity(npc.name)?.meta ?? {}),
          interactable: true,
          health: npc.getHealth?.(),
          downed: npc.isDowned?.() ?? false,
        },
      });
    }

    extraNpcs.forEach((entry) => {
      this.worldStateManager.syncEntity({
        id: entry.name,
        x: entry.sprite.x,
        y: entry.sprite.y,
        worldId: this.getActorWorldId(entry.name),
      });
      this.worldStateManager.patchEntity(entry.name, {
        state: entry.isDowned?.() ? 'downed' : 'active',
        meta: {
          ...(this.worldStateManager.getEntity(entry.name)?.meta ?? {}),
          interactable: true,
          health: entry.getHealth?.(),
          downed: entry.isDowned?.() ?? false,
        },
      });
    });

    chickens.forEach((chicken) => {
      const sprite = chicken.sprite;
      if (!sprite) return;
      const worldId = this.worldStateManager.getChickenState(chicken.id)?.worldId
        ?? this.worldStateManager.getEntity(chicken.id)?.worldId
        ?? this.getActiveWorldId();
      if (!this.worldStateManager.getEntity(chicken.id)) {
        this.worldStateManager.registerEntity({
          id: chicken.id,
          kind: 'chicken',
          x: sprite.x,
          y: sprite.y,
          worldId,
          meta: { interactable: false },
        });
      } else {
        this.worldStateManager.syncEntity({
          id: chicken.id,
          x: sprite.x,
          y: sprite.y,
          worldId,
        });
      }
      const chickenState = this.worldStateManager.getChickenState(chicken.id);
      if (chickenState) {
        this.worldStateManager.patchChickenState(chicken.id, {
          facing: chickenState.facing,
        });
      }
    });

    if (remotePlayer?.sprite) {
      if (!this.worldStateManager.getEntity('remote-player')) {
        this.worldStateManager.registerEntity({
          id: 'remote-player',
          kind: 'remote_player',
          x: remotePlayer.sprite.x,
          y: remotePlayer.sprite.y,
          worldId: this.getActorWorldId('remote-player'),
          meta: { interactable: false },
        });
      } else {
        this.worldStateManager.syncEntity({
          id: 'remote-player',
          x: remotePlayer.sprite.x,
          y: remotePlayer.sprite.y,
          worldId: this.getActorWorldId('remote-player'),
        });
      }
    }
  }

  spawnRemotePlayer(
    current: RemotePlayer | null,
    x: number,
    y: number,
    displayName: string,
  ): RemotePlayer {
    current?.destroy();
    const remotePlayer = new RemotePlayer(this.scene, x, y, displayName);
    this.worldStateManager.registerEntity({
      id: 'remote-player',
      kind: 'remote_player',
      x,
      y,
      worldId: this.getActorWorldId('remote-player'),
      displayName,
      meta: { interactable: false },
    });
    return remotePlayer;
  }

  removeRemotePlayer(current: RemotePlayer | null): null {
    current?.destroy();
    this.worldStateManager.unregisterEntity('remote-player');
    return null;
  }

  applyRemotePlayerMove(
    remotePlayer: RemotePlayer | null,
    payload: { x: number; y: number; facing: Direction; velX: number; velY: number },
  ): void {
    remotePlayer?.moveTo(payload.x, payload.y, payload.facing, payload.velX, payload.velY);
  }

  private getActiveWorldId(): string {
    return (this.scene as any).mapRuntimeManager?.getActiveWorldId?.()
      ?? (this.scene as any).currentMapDefinition?.ref?.worldId
      ?? 'world:main';
  }

  private getActorWorldId(actorId: string): string {
    return (this.scene as any).actorWorldPresence?.get?.(actorId)?.worldId
      ?? this.getActiveWorldId();
  }

  spawnChicken(
    group: Phaser.Physics.Arcade.Group,
    pathfinder: Pathfinder,
    id: string,
    x: number,
    y: number,
    chickens: ChickenView[],
  ): ChickenView {
    const chicken = new ChickenView(group, id, x, y, pathfinder);
    chickens.push(chicken);
    return chicken;
  }

  createNest(
    id: string,
    x: number,
    y: number,
    nests: NestView[],
    callbacks: {
      getState: (id: string) => any;
      onInteract: (id: string) => void;
    },
  ): NestView {
    const nest = new NestView(this.scene, id, x, y, callbacks);
    nests.push(nest);
    this.callbacks.registerInteractable(nest);
    return nest;
  }

  createTree(
    id: string,
    x: number,
    y: number,
    trees: Map<string, TreeView>,
    callbacks: {
      getState: (id: string) => any;
      onInteract: (id: string) => void;
      onChop: (id: string) => void;
    },
    obstacles?: Phaser.Physics.Arcade.StaticGroup,
  ): TreeView {
    const tree = new TreeView(this.scene, x, y, id, callbacks, obstacles);
    trees.set(tree.id, tree);
    this.callbacks.registerInteractable(tree);
    return tree;
  }
}
