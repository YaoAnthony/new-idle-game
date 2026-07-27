import type { AudioPlaybackRequest, AudioSystem } from './AudioSystem';
import { MUSIC_DIRECTORY_PLAYLIST } from './AudioRegistry';
import type { AudioMusicOptions } from './AudioTypes';
import type { MusicPlaybackMode } from '../../../../../Redux/Features/gameSlice';

const MUSIC_FADE_MS = 1800;
const MUSIC_CROSSFADE_LOOKAHEAD_SEC = 4.5;
const HIDDEN_AUTO_ADVANCE_PADDING_MS = 200;

export class MusicDirector {
  private activeMusicKey: string | null = null;
  private activeMusicSound: Phaser.Sound.BaseSound | null = null;
  private activeMusicRequest: AudioPlaybackRequest | null = null;
  private manualMusicKey: string | null = null;
  private automaticMusicPaused = false;
  private lastUpdateMs = 0;
  private playlistIndex = 0;
  private playbackMode: MusicPlaybackMode = 'shuffle';
  private shuffleOrder: string[] = [];
  private shuffleOrderSourceKey = '';
  private shuffleOrderIndex = 0;
  private autoAdvanceStarted = false;
  private backgroundPlaybackEnabled = false;
  private hiddenAutoAdvanceTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  constructor(
    private readonly audio: AudioSystem,
    private readonly getWorldId: () => string,
  ) {}

  update(timeMs: number): void {
    this.updateMusicCrossfade();

    if (timeMs - this.lastUpdateMs < 2000) return;
    this.lastUpdateMs = timeMs;

    const musicKey = this.resolveMusicKey();
    if (musicKey && musicKey !== this.activeMusicKey) {
      if (this.manualMusicKey) {
        this.playDirectedMusic(musicKey, { fadeMs: MUSIC_FADE_MS }, 'manual');
      } else {
        this.playAutomaticMusic(musicKey);
      }
    }
  }

  setMusic(key: string, optionsOrFadeMs: AudioMusicOptions | number = 1000): void {
    this.manualMusicKey = key;
    this.automaticMusicPaused = false;
    this.playDirectedMusic(key, normalizeMusicOptions(optionsOrFadeMs, 1000), 'manual');
  }

  stopMusic(fadeMs = 800): void {
    this.clearHiddenAutoAdvanceTimer();
    this.manualMusicKey = null;
    this.automaticMusicPaused = true;
    this.activeMusicKey = null;
    this.activeMusicSound = null;
    this.activeMusicRequest = null;
    this.autoAdvanceStarted = false;
    this.audio.stopMusic(fadeMs);
  }

  useAutomaticMusic(fadeMs = 1000): void {
    this.clearHiddenAutoAdvanceTimer();
    this.manualMusicKey = null;
    this.automaticMusicPaused = false;
    this.activeMusicKey = null;
    this.activeMusicSound = null;
    this.activeMusicRequest = null;
    this.autoAdvanceStarted = false;
    this.playlistIndex = 0;
    this.resetShuffleOrder();
    this.audio.stopMusic(fadeMs);
    this.update(this.lastUpdateMs + 2001);
  }

  refresh(timeMs = 0): void {
    this.clearHiddenAutoAdvanceTimer();
    this.activeMusicKey = null;
    this.activeMusicSound = null;
    this.activeMusicRequest = null;
    this.autoAdvanceStarted = false;
    this.lastUpdateMs = 0;
    this.update(timeMs + 2001);
  }

  refreshIfIdle(timeMs = 0): void {
    if (this.hasActiveMusicPlayback()) {
      this.lastUpdateMs = timeMs;
      return;
    }
    this.refresh(timeMs);
  }

  nextTrack(fadeMs = 600): void {
    this.clearHiddenAutoAdvanceTimer();
    this.manualMusicKey = null;
    this.automaticMusicPaused = false;
    this.syncPlaylistIndexToActiveTrack();
    this.advancePlaylist(true);
    this.activeMusicKey = null;
    this.activeMusicSound = null;
    this.activeMusicRequest = null;
    this.autoAdvanceStarted = false;
    this.audio.stopMusic(fadeMs);
    this.update(this.lastUpdateMs + 2001);
  }

  setPlaybackMode(mode: MusicPlaybackMode): void {
    if (this.playbackMode === mode) return;
    this.playbackMode = mode;
    this.syncPlaylistIndexToActiveTrack();
    this.resetShuffleOrder(this.activeMusicKey ?? undefined);
    this.autoAdvanceStarted = false;
    this.syncHiddenAutoAdvanceTimer();
  }

  setBackgroundPlaybackEnabled(enabled: boolean): void {
    this.backgroundPlaybackEnabled = enabled;
    this.syncHiddenAutoAdvanceTimer();
  }

  syncBackgroundPlayback(): void {
    this.syncHiddenAutoAdvanceTimer();
  }

  destroy(): void {
    this.clearHiddenAutoAdvanceTimer();
  }

  private resolveMusicKey(): string | null {
    if (this.automaticMusicPaused) return null;
    if (this.manualMusicKey) return this.manualMusicKey;

    const worldId = this.getWorldId();
    if (worldId.startsWith('world:')) {
      const playlist = this.getAutomaticPlaylist();
      if (this.playbackMode === 'shuffle') return this.getShuffleTrack();
      return playlist[this.playlistIndex % playlist.length] ?? null;
    }
    return null;
  }

  private playAutomaticMusic(key: string): void {
    this.playDirectedMusic(key, { fadeMs: MUSIC_FADE_MS, loop: false }, 'automatic');
  }

  private playDirectedMusic(
    key: string,
    options: AudioMusicOptions,
    mode: 'manual' | 'automatic',
  ): void {
    const request = this.audio.requestMusic(key, options);
    this.activeMusicKey = key;
    this.activeMusicRequest = request;
    this.activeMusicSound = request.sound;
    this.autoAdvanceStarted = false;

    request.onStarted((sound) => {
      if (this.activeMusicRequest !== request) return;
      this.activeMusicSound = sound;
      if (mode === 'automatic') this.attachAutomaticCompleteHandler(key, request, sound);
      this.syncHiddenAutoAdvanceTimer();
    });
    request.onFailed(() => {
      if (this.activeMusicRequest !== request) return;
      this.activeMusicSound = null;
      this.activeMusicRequest = null;
      this.autoAdvanceStarted = false;
      this.syncHiddenAutoAdvanceTimer();
      if (mode === 'automatic') {
        this.advancePlaylist();
        this.activeMusicKey = null;
        this.update(this.lastUpdateMs + 2001);
      }
    });
    request.onStopped(() => {
      if (this.activeMusicRequest !== request) return;
      this.activeMusicSound = null;
      this.syncHiddenAutoAdvanceTimer();
    });
  }

  private attachAutomaticCompleteHandler(
    key: string,
    request: AudioPlaybackRequest,
    sound: Phaser.Sound.BaseSound,
  ): void {
    sound.once('complete', () => {
      this.completeAutomaticTrack(key, request);
    });
  }

  private completeAutomaticTrack(key: string, request: AudioPlaybackRequest): void {
    if (
      this.activeMusicRequest !== request
      || this.manualMusicKey
      || this.automaticMusicPaused
      || this.activeMusicKey !== key
    ) return;
    this.clearHiddenAutoAdvanceTimer();
    this.advancePlaylist();
    this.activeMusicKey = null;
    this.activeMusicRequest = null;
    this.activeMusicSound = null;
    this.autoAdvanceStarted = false;
    this.update(this.lastUpdateMs + 2001);
  }

  private updateMusicCrossfade(): void {
    if (this.manualMusicKey || this.automaticMusicPaused || this.autoAdvanceStarted) return;
    if (this.playbackMode === 'repeat-one') return;
    if (!this.activeMusicKey || !this.activeMusicSound) return;

    const playlist = this.getAutomaticPlaylist();
    if (playlist.length < 2) return;

    const remainingSec = this.getRemainingSeconds(this.activeMusicSound);
    if (remainingSec === null || remainingSec > MUSIC_CROSSFADE_LOOKAHEAD_SEC) return;

    this.autoAdvanceStarted = true;
    this.advancePlaylist();
    const nextKey = this.playbackMode === 'shuffle'
      ? this.getShuffleTrack()
      : playlist[this.playlistIndex % playlist.length] ?? null;
    if (!nextKey || nextKey === this.activeMusicKey) {
      this.autoAdvanceStarted = false;
      return;
    }
    this.playAutomaticMusic(nextKey);
  }

  private hasActiveMusicPlayback(): boolean {
    if (
      this.activeMusicRequest?.status === 'queued'
      || this.activeMusicRequest?.status === 'playing'
    ) return true;
    const sound = this.activeMusicSound as any;
    return Boolean(sound && (sound.isPlaying || sound.isPaused));
  }

  private syncHiddenAutoAdvanceTimer(): void {
    this.clearHiddenAutoAdvanceTimer();
    if (!this.shouldUseHiddenAutoAdvanceTimer()) return;
    const activeKey = this.activeMusicKey;
    const activeRequest = this.activeMusicRequest;
    const activeSound = this.activeMusicSound;
    if (!activeKey || !activeRequest || !activeSound) return;
    const remainingSec = this.getRemainingSeconds(activeSound);
    if (remainingSec === null) return;
    const delayMs = Math.max(
      HIDDEN_AUTO_ADVANCE_PADDING_MS,
      Math.ceil(remainingSec * 1000) + HIDDEN_AUTO_ADVANCE_PADDING_MS,
    );
    this.hiddenAutoAdvanceTimer = globalThis.setTimeout(() => {
      this.hiddenAutoAdvanceTimer = null;
      if (!this.shouldUseHiddenAutoAdvanceTimer()) return;
      if (this.activeMusicKey !== activeKey || this.activeMusicRequest !== activeRequest) return;
      this.completeAutomaticTrack(activeKey, activeRequest);
    }, delayMs);
  }

  private shouldUseHiddenAutoAdvanceTimer(): boolean {
    if (!this.backgroundPlaybackEnabled) return false;
    if (typeof document === 'undefined' || !document.hidden) return false;
    if (this.manualMusicKey || this.automaticMusicPaused) return false;
    if (!this.activeMusicKey || !this.activeMusicRequest || !this.activeMusicSound) return false;
    return this.activeMusicRequest.status === 'playing';
  }

  private clearHiddenAutoAdvanceTimer(): void {
    if (!this.hiddenAutoAdvanceTimer) return;
    globalThis.clearTimeout(this.hiddenAutoAdvanceTimer);
    this.hiddenAutoAdvanceTimer = null;
  }

  private getRemainingSeconds(sound: Phaser.Sound.BaseSound): number | null {
    const anySound = sound as any;
    const duration = Number(anySound.totalDuration ?? anySound.duration ?? 0);
    const seek = Number(anySound.seek ?? anySound.currentTime ?? 0);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seek)) return null;
    return Math.max(0, duration - seek);
  }

  private advancePlaylist(forceNext = false): void {
    const playlist = this.getAutomaticPlaylist();
    if (!playlist.length) return;
    if (this.playbackMode === 'repeat-one' && !forceNext) return;
    if (this.playbackMode === 'shuffle') {
      this.advanceShuffleOrder();
      const nextKey = this.getShuffleTrack();
      const nextIndex = nextKey ? playlist.indexOf(nextKey) : -1;
      if (nextIndex >= 0) this.playlistIndex = nextIndex;
      return;
    }
    this.playlistIndex = (this.playlistIndex + 1) % playlist.length;
  }

  private syncPlaylistIndexToActiveTrack(): void {
    if (!this.activeMusicKey) return;
    const index = this.getAutomaticPlaylist().indexOf(this.activeMusicKey);
    if (index >= 0) this.playlistIndex = index;
    if (this.playbackMode === 'shuffle') this.resetShuffleOrder(this.activeMusicKey);
  }

  private getAutomaticPlaylist(): string[] {
    return MUSIC_DIRECTORY_PLAYLIST;
  }

  private getShuffleTrack(): string | null {
    this.ensureShuffleOrder();
    return this.shuffleOrder[this.shuffleOrderIndex] ?? null;
  }

  private advanceShuffleOrder(): void {
    this.ensureShuffleOrder();
    if (this.shuffleOrder.length <= 1) return;
    if (this.shuffleOrderIndex + 1 < this.shuffleOrder.length) {
      this.shuffleOrderIndex += 1;
      return;
    }
    this.resetShuffleOrder(undefined, this.shuffleOrder[this.shuffleOrderIndex]);
  }

  private ensureShuffleOrder(): void {
    const playlist = this.getAutomaticPlaylist();
    const sourceKey = playlist.join('\n');
    if (this.shuffleOrder.length && this.shuffleOrderSourceKey === sourceKey) return;
    this.resetShuffleOrder(this.activeMusicKey ?? undefined);
  }

  private resetShuffleOrder(preferredFirstKey?: string, avoidFirstKey?: string): void {
    const playlist = this.getAutomaticPlaylist();
    this.shuffleOrderSourceKey = playlist.join('\n');
    this.shuffleOrder = shuffleMusicKeys(playlist);
    this.shuffleOrderIndex = 0;
    if (preferredFirstKey && this.shuffleOrder.includes(preferredFirstKey)) {
      this.shuffleOrder = [
        preferredFirstKey,
        ...this.shuffleOrder.filter((key) => key !== preferredFirstKey),
      ];
    }
    if (
      avoidFirstKey
      && this.shuffleOrder.length > 1
      && this.shuffleOrder[0] === avoidFirstKey
    ) {
      const swapIndex = this.shuffleOrder.findIndex((key) => key !== avoidFirstKey);
      if (swapIndex > 0) {
        [this.shuffleOrder[0], this.shuffleOrder[swapIndex]] = [this.shuffleOrder[swapIndex], this.shuffleOrder[0]];
      }
    }
  }
}

function normalizeMusicOptions(
  optionsOrFadeMs: AudioMusicOptions | number,
  fallbackFadeMs: number,
): AudioMusicOptions {
  if (typeof optionsOrFadeMs === 'number') return { fadeMs: optionsOrFadeMs };
  return {
    ...optionsOrFadeMs,
    fadeMs: typeof optionsOrFadeMs.fadeMs === 'number' ? optionsOrFadeMs.fadeMs : fallbackFadeMs,
  };
}

function shuffleMusicKeys(keys: string[]): string[] {
  const out = [...keys];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function randomInt(exclusiveMax: number): number {
  if (exclusiveMax <= 1) return 0;
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] % exclusiveMax;
  }
  return Math.floor(Math.random() * exclusiveMax);
}
