import Phaser from 'phaser';
import { AudioEventMapper } from './AudioEventMapper';
import { AudioSystem } from './AudioSystem';
import { EnvironmentalAudioDirector } from './EnvironmentalAudioDirector';
import { MusicDirector } from './MusicDirector';
import type { AudioMusicOptions, AudioPlayOptions } from './AudioTypes';
import type { WeatherType } from '../rendering/WeatherSystem';
import type { TiledMapDefinition } from '../map/tiled/TiledMapTypes';
import type { MusicPlaybackMode } from '../../../../../Redux/Features/gameSlice';

export interface GameAudioSystemOptions {
  scene: Phaser.Scene;
  getPlayerPosition: () => { x: number; y: number } | null;
  getWorldId: () => string;
  getMinuteOfDay: () => number;
  getWeather: () => WeatherType;
  getMapDefinition: () => TiledMapDefinition | null | undefined;
}

export interface GameAudioSettings {
  masterVolume?: number;
  audioEnabled?: boolean;
  audioVolume?: number;
  musicEnabled?: boolean;
  musicVolume?: number;
  musicPlaybackMode?: MusicPlaybackMode;
  musicBackgroundPlayback?: boolean;
}

/**
 * Scene-facing boundary for audio playback, event sounds, and music direction.
 */
export class GameAudioSystem {
  private readonly scene: Phaser.Scene;
  private readonly audioSystem: AudioSystem;
  private readonly audioEventMapper: AudioEventMapper;
  private readonly musicDirector: MusicDirector;
  private readonly environmentalAudioDirector: EnvironmentalAudioDirector;
  private backgroundAudioPlayback = false;
  private documentGestureBound = false;
  private unlockRefreshScheduled = false;
  private destroyed = false;

  constructor(options: GameAudioSystemOptions) {
    this.scene = options.scene;
    this.audioSystem = new AudioSystem(options.scene);
    this.audioEventMapper = new AudioEventMapper(this.audioSystem, {
      getListenerPosition: options.getPlayerPosition,
      getListenerWorldId: options.getWorldId,
      resolveActorPosition: (actorId) => this.resolveActorPosition(actorId),
    });
    this.musicDirector = new MusicDirector(
      this.audioSystem,
      options.getWorldId,
    );
    this.environmentalAudioDirector = new EnvironmentalAudioDirector({
      audio: this.audioSystem,
      getPlayerPosition: options.getPlayerPosition,
      getWorldId: options.getWorldId,
      getMinuteOfDay: options.getMinuteOfDay,
      getWeather: options.getWeather,
      getMapDefinition: options.getMapDefinition,
    });

    this.audioEventMapper.start();
    this.bindUnlockGestures();
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  play(key: string, options?: AudioPlayOptions): Phaser.Sound.BaseSound | null {
    this.resume();
    return this.audioSystem.play(key, options);
  }

  playSfx(key: string, options?: AudioPlayOptions): Phaser.Sound.BaseSound | null {
    return this.audioSystem.playSfx(key, options);
  }

  playMusic(key: string, options?: AudioMusicOptions): void {
    this.resume();
    this.musicDirector.setMusic(key, options ?? {});
  }

  playAmbience(key: string, options?: AudioMusicOptions): Phaser.Sound.BaseSound | null {
    return this.audioSystem.playAmbience(key, options);
  }

  setMusic(key: string, optionsOrFadeMs: AudioMusicOptions | number = 1000): void {
    this.resume();
    this.musicDirector.setMusic(key, optionsOrFadeMs);
  }

  useAutomaticMusic(fadeMs = 1000): void {
    this.resume();
    this.musicDirector.useAutomaticMusic(fadeMs);
  }

  stopMusic(fadeMs = 600): void {
    this.musicDirector.stopMusic(fadeMs);
  }

  nextMusicTrack(fadeMs = 600): void {
    this.resume();
    this.musicDirector.nextTrack(fadeMs);
  }

  stopByTag(tag: string, fadeMs = 0): void {
    this.audioSystem.stopByTag(tag, fadeMs);
  }

  applySettings(settings: GameAudioSettings): void {
    if (typeof settings.masterVolume === 'number') this.setMasterVolume(settings.masterVolume);
    if (typeof settings.audioEnabled === 'boolean') this.setAudioEnabled(settings.audioEnabled);
    if (typeof settings.audioVolume === 'number') this.setAudioVolume(settings.audioVolume);
    if (typeof settings.musicEnabled === 'boolean') this.setMusicEnabled(settings.musicEnabled);
    if (typeof settings.musicVolume === 'number') this.setMusicVolume(settings.musicVolume);
    if (settings.musicPlaybackMode) this.setMusicPlaybackMode(settings.musicPlaybackMode);
    if (typeof settings.musicBackgroundPlayback === 'boolean') {
      this.setMusicBackgroundPlayback(settings.musicBackgroundPlayback);
    }
  }

  setMasterVolume(volume: number): void {
    this.audioSystem.setMasterVolume(volume);
  }

  setAudioVolume(volume: number): void {
    this.audioSystem.setAudioVolume(volume);
  }

  setAudioEnabled(enabled: boolean): void {
    this.audioSystem.setAudioEnabled(enabled);
  }

  setMusicVolume(volume: number): void {
    this.audioSystem.setMusicVolume(volume);
  }

  setMusicEnabled(enabled: boolean): void {
    this.audioSystem.setMusicEnabled(enabled);
  }

  setMusicPlaybackMode(mode: MusicPlaybackMode): void {
    this.musicDirector.setPlaybackMode(mode);
  }

  setMusicBackgroundPlayback(enabled: boolean): void {
    this.backgroundAudioPlayback = enabled;
    this.musicDirector.setBackgroundPlaybackEnabled(enabled);
    this.syncMusicBackgroundPlayback();
  }

  syncMusicBackgroundPlayback(): void {
    this.syncPhaserPauseOnBlur();
    if (typeof document === 'undefined') {
      this.musicDirector.syncBackgroundPlayback();
      return;
    }
    this.audioSystem.setVisibilityPlaybackAllowed(this.backgroundAudioPlayback);
    if (document.hidden && !this.backgroundAudioPlayback) {
      this.audioSystem.pauseAllForVisibility();
      this.musicDirector.syncBackgroundPlayback();
      return;
    }
    this.audioSystem.resumeVisibilityPausedSounds();
    this.musicDirector.syncBackgroundPlayback();
  }

  update(timeMs: number): void {
    this.musicDirector.update(timeMs);
    this.environmentalAudioDirector.update(timeMs);
  }

  updateListenerPosition(x: number, y: number): void {
    this.audioSystem.updateListenerPosition(x, y);
  }

  refreshAmbienceSoon(timeMs = this.scene.time?.now ?? 0): void {
    this.resume();
    const refresh = () => this.environmentalAudioDirector.refresh(timeMs);
    if (this.scene.time?.delayedCall) {
      this.scene.time.delayedCall(80, refresh);
      return;
    }
    refresh();
  }

  resume(): void {
    this.audioSystem.resume();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unbindDocumentUnlockGestures();
    this.audioEventMapper.destroy();
    this.environmentalAudioDirector.destroy();
    this.musicDirector.destroy();
    this.audioSystem.destroy();
  }

  private bindUnlockGestures(): void {
    if (typeof document !== 'undefined') {
      this.documentGestureBound = true;
      document.addEventListener('pointerdown', this.resumeFromDocumentGesture, { once: true, capture: true });
      document.addEventListener('keydown', this.resumeFromDocumentGesture, { once: true, capture: true });
    }
    this.scene.sound.once('unlocked', () => this.resumeAndRefresh('sound.unlocked'));
    this.scene.input.once('pointerdown', () => this.resumeAndRefresh('pointerdown'));
    this.scene.input.keyboard?.once('keydown', () => this.resumeAndRefresh('keydown'));
  }

  private unbindDocumentUnlockGestures(): void {
    if (!this.documentGestureBound || typeof document === 'undefined') return;
    document.removeEventListener('pointerdown', this.resumeFromDocumentGesture, { capture: true });
    document.removeEventListener('keydown', this.resumeFromDocumentGesture, { capture: true });
    this.documentGestureBound = false;
  }

  private readonly resumeFromDocumentGesture = () => this.resumeAndRefresh('document.gesture');

  private resumeAndRefresh(source: string): void {
    void source;
    this.resume();
    if (this.unlockRefreshScheduled) return;
    this.unlockRefreshScheduled = true;
    this.scene.time.delayedCall(80, () => {
      this.unlockRefreshScheduled = false;
      if (this.destroyed) return;
      this.musicDirector.refreshIfIdle(this.scene.time.now);
    });
  }

  private syncPhaserPauseOnBlur(): void {
    if (!this.scene.sound) return;
    // Phaser's SoundManager has its own blur pause separate from our visibility pause set.
    this.scene.sound.pauseOnBlur = !this.backgroundAudioPlayback;
  }

  private resolveActorPosition(actorId: string | undefined): { x: number; y: number; worldId?: string } | null {
    if (!actorId) return null;
    const scene = this.scene as any;
    if (actorId === 'player') {
      const playerPosition = scene.playerSystem?.getPosition?.();
      if (playerPosition) {
        return {
          ...playerPosition,
          worldId: scene.actorWorldPresence?.getActorWorldId?.('player')
            ?? scene.mapRuntimeManager?.getActiveWorldId?.()
            ?? scene.currentMapDefinition?.ref?.worldId,
        };
      }
    }

    const record = scene.entitySystem?.getRecord?.(actorId);
    if (typeof record?.x === 'number' && typeof record?.y === 'number') {
      return {
        x: record.x,
        y: record.y,
        worldId: record.worldId,
      };
    }

    const presence = scene.actorWorldPresence?.get?.(actorId);
    if (typeof presence?.x === 'number' && typeof presence?.y === 'number') {
      return {
        x: presence.x,
        y: presence.y,
        worldId: presence.worldId,
      };
    }

    const worldEntity = scene.worldStateManager?.getEntity?.(actorId);
    if (typeof worldEntity?.x === 'number' && typeof worldEntity?.y === 'number') {
      return {
        x: worldEntity.x,
        y: worldEntity.y,
        worldId: worldEntity.worldId,
      };
    }

    const npc = scene.npcSystem?.findByName?.(actorId);
    if (npc?.sprite) {
      return {
        x: npc.sprite.x,
        y: npc.sprite.y,
        worldId: scene.actorWorldPresence?.getActorWorldId?.(actorId)
          ?? scene.mapRuntimeManager?.getActiveWorldId?.()
          ?? scene.currentMapDefinition?.ref?.worldId,
      };
    }
    return null;
  }
}
