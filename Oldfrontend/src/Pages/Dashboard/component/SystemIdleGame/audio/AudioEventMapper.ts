import Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';
import type { EntityActionSoundEvent } from '../shared/EventBus';
import type { AudioSystem } from './AudioSystem';
import { resolveEntityActionSoundDefinition } from './EntityActionSoundCatalog';

interface EntitySoundPosition {
  x: number;
  y: number;
  worldId?: string;
}

interface AudioEventMapperOptions {
  getListenerPosition: () => { x: number; y: number } | null;
  getListenerWorldId: () => string | undefined;
  resolveActorPosition?: (actorId: string | undefined) => EntitySoundPosition | null;
}

export class AudioEventMapper {
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly audio: AudioSystem,
    private readonly options: AudioEventMapperOptions,
  ) {}

  start(): void {
    this.unsubscribers.push(
      gameBus.on('ui:show_message', () => {
        this.audio.playSfx('ui.confirm');
      }),
      gameBus.on('npc:speak', ({ npcName }) => {
        this.audio.playSfx(npcName === '玩家' ? 'dialogue.player_blip' : 'dialogue.npc_blip');
      }),
      gameBus.on('entity:action_sound', (event) => {
        this.playEntityActionSound(event);
      }),
      gameBus.on('game:building_place_requested', () => {
        this.audio.playSfx('sfx.place_building');
      }),
      gameBus.on('chest:interact', ({ rewards }) => {
        if (Number(rewards?.coins ?? 0) <= 0) return;
        this.audio.playSfx('sfx.open_chest');
      }),
      gameBus.on('world:action_applied', ({ action, result }) => {
        if (!result.ok) return;
        if (action.type === 'PICKUP_DROP' || action.type === 'DROP_ITEM' || action.type === 'PLACE_OBJECT') {
          this.audio.playSfx('ui.confirm', { volume: 0.18 });
        }
      }),
    );
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
  }

  private playEntityActionSound(event: EntityActionSoundEvent): void {
    const definition = resolveEntityActionSoundDefinition(event);
    if (!definition) return;

    const listener = this.options.getListenerPosition();
    if (!listener) return;

    const source = this.resolveSoundPosition(event);
    if (!source) return;

    const listenerWorldId = this.options.getListenerWorldId();
    if (source.worldId && listenerWorldId && source.worldId !== listenerWorldId) return;

    const distance = Phaser.Math.Distance.Between(listener.x, listener.y, source.x, source.y);
    const radius = Math.max(1, event.audibleRadius ?? definition.audibleRadius);
    if (distance > radius) return;

    const falloff = 1 - Phaser.Math.Clamp(distance / radius, 0, 1);
    const shapedFalloff = falloff * falloff;
    const baseVolume = event.volume ?? definition.volume;
    const minVolume = event.minVolume ?? definition.minVolume;
    const volume = Phaser.Math.Clamp(Math.max(minVolume, baseVolume * shapedFalloff), 0, 1);
    if (volume <= 0) return;

    this.audio.playSfx(definition.audioKey, {
      volume,
      rate: event.rate ?? this.resolveRate(definition.rateVariance),
      tag: event.tag ?? this.buildEntitySoundTag(event, definition.id),
    });
  }

  private resolveSoundPosition(event: EntityActionSoundEvent): EntitySoundPosition | null {
    if (typeof event.x === 'number' && typeof event.y === 'number') {
      return {
        x: event.x,
        y: event.y,
        worldId: event.worldId,
      };
    }
    return this.options.resolveActorPosition?.(event.actorId) ?? null;
  }

  private resolveRate(variance: number | undefined): number | undefined {
    if (!variance || variance <= 0) return undefined;
    return 1 + Phaser.Math.FloatBetween(-variance, variance);
  }

  private buildEntitySoundTag(event: EntityActionSoundEvent, soundId: string): string {
    const actorId = event.actorId?.trim() || 'unknown';
    return `entity:${actorId}:sound:${soundId}`;
  }
}
