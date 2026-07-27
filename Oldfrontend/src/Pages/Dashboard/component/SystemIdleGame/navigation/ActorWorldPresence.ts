import Phaser from 'phaser';
import { DEFAULT_WORLD_ID } from '@timeplan-game/core/game/worldIds';
import type { Direction } from '../types';

export type ActorWorldKind = 'player' | 'npc' | 'remote_player';

export interface ActorWorldPresenceRecord {
  actorId: string;
  actorKind: ActorWorldKind;
  worldId: string;
  x: number;
  y: number;
  facing?: Direction;
  visible: boolean;
}

export class ActorWorldPresence {
  private readonly records = new Map<string, ActorWorldPresenceRecord>();

  constructor(private readonly scene: any) {}

  get(actorId: string): ActorWorldPresenceRecord | null {
    const record = this.records.get(actorId);
    return record ? { ...record } : null;
  }

  getActorWorldId(actorId: string, fallbackWorldId = DEFAULT_WORLD_ID): string {
    return this.records.get(actorId)?.worldId ?? fallbackWorldId;
  }

  setActorWorld(input: {
    actorId: string;
    actorKind: ActorWorldKind;
    worldId: string;
    x: number;
    y: number;
    facing?: Direction;
    visible?: boolean;
  }): ActorWorldPresenceRecord {
    const previous = this.records.get(input.actorId);
    const record: ActorWorldPresenceRecord = {
      actorId: input.actorId,
      actorKind: input.actorKind,
      worldId: input.worldId || previous?.worldId || DEFAULT_WORLD_ID,
      x: Number.isFinite(input.x) ? input.x : previous?.x ?? 0,
      y: Number.isFinite(input.y) ? input.y : previous?.y ?? 0,
      facing: input.facing ?? previous?.facing,
      visible: input.visible ?? previous?.visible ?? true,
    };
    this.records.set(input.actorId, record);
    this.syncWorldState(record);
    return { ...record };
  }

  moveActor(
    actorId: string,
    actorKind: ActorWorldKind,
    worldId: string,
    x: number,
    y: number,
    facing?: Direction,
  ): ActorWorldPresenceRecord {
    const visible = worldId === this.getActiveWorldId();
    const record = this.setActorWorld({ actorId, actorKind, worldId, x, y, facing, visible });
    this.applyRecordToRuntime(record);
    return record;
  }

  syncVisibleNpcPositions(): void {
    const activeWorldId = this.getActiveWorldId();
    for (const { id, npc } of this.scene.npcSystem?.getRegistrations?.() ?? []) {
      if (!npc?.sprite) continue;
      const actorId = id || npc.name;
      const previous = this.records.get(actorId);
      const worldId = previous?.worldId ?? activeWorldId;
      if (worldId !== activeWorldId || npc.sprite.visible === false) continue;
      this.setActorWorld({
        actorId,
        actorKind: 'npc',
        worldId,
        x: npc.sprite.x,
        y: npc.sprite.y,
        facing: (npc as any).facing,
        visible: true,
      });
    }
  }

  refreshNpcVisibility(): void {
    const activeWorldId = this.getActiveWorldId();
    for (const { id, npc } of this.scene.npcSystem?.getRegistrations?.() ?? []) {
      if (!npc?.sprite) continue;
      const actorId = id || npc.name;
      const previous = this.records.get(actorId);
      const record = previous ?? this.setActorWorld({
        actorId,
        actorKind: 'npc',
        worldId: activeWorldId,
        x: npc.sprite.x,
        y: npc.sprite.y,
        visible: true,
      });
      const visible = record.worldId === activeWorldId;
      if (record.visible === visible && npc.sprite.visible === visible) continue;
      this.records.set(actorId, { ...record, visible });
      this.applyRecordToRuntime({ ...record, visible });
    }
  }

  private applyRecordToRuntime(record: ActorWorldPresenceRecord): void {
    if (record.actorKind === 'npc') {
      const npc = this.scene.npcSystem?.findByName?.(record.actorId) ?? null;
      if (!npc?.sprite) return;
      npc.sprite.setPosition(record.x, record.y);
      npc.sprite.setDepth?.(record.y + 96);
      const body = npc.sprite.body as Phaser.Physics.Arcade.Body | undefined;
      body?.reset?.(record.x, record.y);
      body?.setVelocity?.(0, 0);
      npc.setRuntimeVisible?.(record.visible, { preserveState: true });
    }
  }

  private syncWorldState(record: ActorWorldPresenceRecord): void {
    if (!this.scene.worldStateManager?.getEntity?.(record.actorId) && record.actorKind === 'npc') {
      this.scene.worldStateManager?.registerEntity?.({
        id: record.actorId,
        kind: 'npc',
        x: record.x,
        y: record.y,
        worldId: record.worldId,
        facing: record.facing,
        displayName: record.actorId,
        state: 'active',
        meta: {
          interactable: true,
          visible: record.visible,
        },
      });
    }
    this.scene.worldStateManager?.updateEntityPosition?.(
      record.actorId,
      record.x,
      record.y,
      record.worldId,
    );
    const currentMeta = this.scene.worldStateManager?.getEntity?.(record.actorId)?.meta ?? {};
    this.scene.worldStateManager?.patchEntity?.(record.actorId, {
      worldId: record.worldId,
      facing: record.facing,
      meta: {
        ...currentMeta,
        visible: record.visible,
      },
    });
  }

  private getActiveWorldId(): string {
    return this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
  }
}
