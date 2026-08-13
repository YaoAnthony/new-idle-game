import Phaser from 'phaser';
import { getAudioEntry, resolveAudioSourceUrl } from './AudioRegistry';
import type { AudioChannel, AudioMusicOptions, AudioPlayOptions } from './AudioTypes';

const DEFAULT_CHANNEL_VOLUME: Record<AudioChannel, number> = {
  master: 1,
  music: 0.85,
  ambience: 0.75,
  sfx: 1,
  ui: 0.9,
  dialogue: 0.85,
  vehicle: 0.9,
};

export type AudioPlaybackKind = 'plain' | 'music' | 'ambience';
export type AudioPlaybackStatus = 'queued' | 'playing' | 'failed' | 'stopped';

export interface AudioPlaybackRequest {
  readonly id: string;
  readonly kind: AudioPlaybackKind;
  readonly key: string;
  readonly tag?: string;
  readonly status: AudioPlaybackStatus;
  readonly sound: Phaser.Sound.BaseSound | null;
  onStarted(listener: (sound: Phaser.Sound.BaseSound) => void): () => void;
  onFailed(listener: () => void): () => void;
  onStopped(listener: () => void): () => void;
  stop(fadeMs?: number): void;
}

class AudioPlaybackRequestState implements AudioPlaybackRequest {
  private _status: AudioPlaybackStatus = 'queued';
  private _sound: Phaser.Sound.BaseSound | null = null;
  private readonly startedListeners = new Set<(sound: Phaser.Sound.BaseSound) => void>();
  private readonly failedListeners = new Set<() => void>();
  private readonly stoppedListeners = new Set<() => void>();

  constructor(
    readonly id: string,
    readonly kind: AudioPlaybackKind,
    readonly key: string,
    readonly tag: string | undefined,
    readonly options: AudioPlayOptions | AudioMusicOptions,
    private readonly stopHandler: (request: AudioPlaybackRequestState, fadeMs: number) => void,
  ) {}

  get status(): AudioPlaybackStatus {
    return this._status;
  }

  get sound(): Phaser.Sound.BaseSound | null {
    return this._sound;
  }

  onStarted(listener: (sound: Phaser.Sound.BaseSound) => void): () => void {
    this.startedListeners.add(listener);
    if (this._status === 'playing' && this._sound) listener(this._sound);
    return () => this.startedListeners.delete(listener);
  }

  onFailed(listener: () => void): () => void {
    this.failedListeners.add(listener);
    if (this._status === 'failed') listener();
    return () => this.failedListeners.delete(listener);
  }

  onStopped(listener: () => void): () => void {
    this.stoppedListeners.add(listener);
    if (this._status === 'stopped') listener();
    return () => this.stoppedListeners.delete(listener);
  }

  stop(fadeMs = 0): void {
    this.stopHandler(this, fadeMs);
  }

  markPlaying(sound: Phaser.Sound.BaseSound): void {
    if (this._status === 'stopped' || this._status === 'failed') return;
    this._sound = sound;
    this._status = 'playing';
    for (const listener of [...this.startedListeners]) listener(sound);
  }

  markFailed(): void {
    if (this._status === 'failed' || this._status === 'stopped') return;
    this._status = 'failed';
    for (const listener of [...this.failedListeners]) listener();
    this.clearListeners();
  }

  markStopped(): void {
    if (this._status === 'stopped') return;
    this._status = 'stopped';
    for (const listener of [...this.stoppedListeners]) listener();
    this.clearListeners();
  }

  private clearListeners(): void {
    this.startedListeners.clear();
    this.failedListeners.clear();
    this.stoppedListeners.clear();
  }
}

export class AudioSystem {
  private readonly channelVolumes = new Map<AudioChannel, number>();
  private readonly channelMutes = new Map<AudioChannel, boolean>();
  private readonly channelSounds = new Map<AudioChannel, Set<Phaser.Sound.BaseSound>>();
  private readonly taggedSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();
  private readonly soundBaseVolumes = new WeakMap<Phaser.Sound.BaseSound, { channel: AudioChannel; baseVolume: number }>();
  private readonly pendingLoads = new Set<string>();
  private readonly pendingPlayRequests = new Map<string, AudioPlaybackRequestState>();
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private currentAmbience: Phaser.Sound.BaseSound | null = null;
  private currentMusicRequest: AudioPlaybackRequestState | null = null;
  private currentAmbienceRequest: AudioPlaybackRequestState | null = null;
  private currentMusicBaseVolume = 1;
  private readonly visibilityPausedSounds = new Set<Phaser.Sound.BaseSound>();
  private visibilityPlaybackAllowed = false;
  private muted = false;
  private destroyed = false;
  private requestSequence = 0;

  constructor(private readonly scene: Phaser.Scene) {
    for (const [channel, volume] of Object.entries(DEFAULT_CHANNEL_VOLUME) as Array<[AudioChannel, number]>) {
      this.channelVolumes.set(channel, volume);
    }
  }

  play(key: string, options: AudioPlayOptions = {}): Phaser.Sound.BaseSound | null {
    return this.requestPlay(key, options).sound;
  }

  requestPlay(key: string, options: AudioPlayOptions = {}): AudioPlaybackRequest {
    const entry = getAudioEntry(key);
    const request = this.createPlaybackRequest('plain', key, options, entry ?? undefined);
    if (!entry || entry.enabled === false) {
      console.warn('[AudioSystem] unknown or disabled audio key', key);
      request.markFailed();
      return request;
    }
    if (!this.isReadyToPlay(key)) {
      this.queuePendingPlay(request);
      return request;
    }

    return this.startPlainRequest(request, entry);
  }

  private playNow(
    key: string,
    entry: NonNullable<ReturnType<typeof getAudioEntry>>,
    options: AudioPlayOptions = {},
  ): Phaser.Sound.BaseSound | null {
    if (!this.isSceneAudioAvailable()) return null;
    const baseVolume = options.volume ?? entry.volume ?? 1;
    const volume = this.resolveVolume(entry.channel, baseVolume);
    const sound = this.scene.sound.add(key, {
      volume,
      mute: this.isChannelMuted(entry.channel),
      loop: options.loop ?? entry.loop ?? false,
      rate: options.rate ?? entry.rate ?? 1,
      detune: options.detune ?? 0,
    } as Phaser.Types.Sound.SoundConfig);

    this.trackChannel(entry.channel, sound);
    this.soundBaseVolumes.set(sound, { channel: entry.channel, baseVolume });
    this.setSoundMuted(sound, this.isChannelMuted(entry.channel));
    const tag = options.tag ?? entry.tags?.[0];
    if (tag) this.trackTag(tag, sound);
    sound.once('complete', () => this.untrackSound(sound));
    sound.once('destroy', () => this.untrackSound(sound));
    sound.play();
    this.pauseSoundIfHidden(sound);
    return sound;
  }

  resume(): void {
    if (!this.isSceneAudioAvailable()) return;
    const manager = this.scene.sound as any;
    manager.unlock?.();
    const resumeResult = manager.context?.resume?.();
    resumeResult?.catch?.(() => {});
    this.schedulePendingPlayFlush();
  }

  isLocked(): boolean {
    if (!this.isSceneAudioAvailable()) return true;
    const manager = this.scene.sound as any;
    const contextState = manager.context?.state;
    return Boolean(manager.locked) || contextState === 'suspended' || contextState === 'interrupted';
  }

  playSfx(key: string, options: AudioPlayOptions = {}): Phaser.Sound.BaseSound | null {
    return this.play(key, options);
  }

  playMusic(key: string, options: AudioMusicOptions = {}): Phaser.Sound.BaseSound | null {
    return this.requestMusic(key, options).sound;
  }

  requestMusic(key: string, options: AudioMusicOptions = {}): AudioPlaybackRequest {
    const entry = getAudioEntry(key);
    const request = this.createPlaybackRequest('music', key, options, entry ?? undefined);
    if (!entry || entry.enabled === false) {
      console.warn('[AudioSystem] unknown or disabled audio key', key);
      request.markFailed();
      return request;
    }
    if (!this.isReadyToPlay(key)) {
      this.queuePendingPlay(request);
      return request;
    }

    return this.startMusicRequest(request, entry);
  }

  private startMusicRequest(
    request: AudioPlaybackRequestState,
    entry: NonNullable<ReturnType<typeof getAudioEntry>>,
  ): AudioPlaybackRequest {
    const options = request.options as AudioMusicOptions;
    const nextBaseVolume = options.volume ?? entry.volume ?? 1;
    if (
      this.currentMusic
      && this.currentMusicRequest?.key === request.key
      && this.isSoundPlaybackActive(this.currentMusic)
    ) {
      this.currentMusicRequest = request;
      this.currentMusicBaseVolume = nextBaseVolume;
      this.setTrackedSoundBaseVolume(this.currentMusic, nextBaseVolume);
      this.trackRequestSound(request, this.currentMusic);
      return request;
    }
    const next = this.playNow(request.key, entry, { ...options, loop: options.loop ?? true, tag: request.tag ?? 'music' });
    if (!next) {
      request.markFailed();
      return request;
    }
    const previous = this.currentMusic;
    const previousRequest = this.currentMusicRequest;
    this.currentMusic = next;
    this.currentMusicRequest = request;
    this.currentMusicBaseVolume = nextBaseVolume;
    if (previous && previous !== next) {
      previousRequest?.markStopped();
      this.fadeOutAndStop(previous, options.fadeMs ?? 800);
    }
    if (options.fadeMs && 'setVolume' in next) {
      const target = this.resolveVolume('music', this.currentMusicBaseVolume);
      (next as any).setVolume?.(0);
      this.scene.tweens.add({ targets: next as any, volume: target, duration: options.fadeMs });
    }
    this.trackRequestSound(request, next);
    return request;
  }

  playAmbience(key: string, options: AudioMusicOptions = {}): Phaser.Sound.BaseSound | null {
    return this.requestAmbience(key, options).sound;
  }

  requestAmbience(key: string, options: AudioMusicOptions = {}): AudioPlaybackRequest {
    const entry = getAudioEntry(key);
    const request = this.createPlaybackRequest('ambience', key, options, entry ?? undefined);
    if (!entry || entry.enabled === false) {
      console.warn('[AudioSystem] unknown or disabled audio key', key);
      request.markFailed();
      return request;
    }
    if (!this.isReadyToPlay(key)) {
      this.queuePendingPlay(request);
      return request;
    }

    return this.startAmbienceRequest(request, entry);
  }

  private startAmbienceRequest(
    request: AudioPlaybackRequestState,
    entry: NonNullable<ReturnType<typeof getAudioEntry>>,
  ): AudioPlaybackRequest {
    const options = request.options as AudioMusicOptions;
    const next = this.playNow(request.key, entry, { ...options, loop: options.loop ?? true, tag: request.tag ?? 'ambience' });
    if (!next) {
      request.markFailed();
      return request;
    }
    const previous = this.currentAmbience;
    const previousRequest = this.currentAmbienceRequest;
    this.currentAmbience = next;
    this.currentAmbienceRequest = request;
    if (previous && previous !== next) {
      previousRequest?.markStopped();
      this.fadeOutAndStop(previous, options.fadeMs ?? 800);
    }
    this.trackRequestSound(request, next);
    return request;
  }

  stopByTag(tag: string, fadeMs = 0): void {
    this.clearPendingPlayRequestsByTag(tag);
    const sounds = [...(this.taggedSounds.get(tag) ?? [])];
    for (const sound of sounds) {
      if (fadeMs > 0) this.fadeOutAndStop(sound, fadeMs);
      else sound.stop();
    }
    this.taggedSounds.delete(tag);
    this.stopCurrentRequestByTag(tag);
  }

  stopMusic(fadeMs = 600): void {
    this.clearPendingPlayRequestsByKind('music');
    if (this.currentMusicRequest) {
      this.stopRequest(this.currentMusicRequest, fadeMs);
      return;
    }
    if (!this.currentMusic) return;
    this.fadeOutAndStop(this.currentMusic, fadeMs);
    this.currentMusic = null;
  }

  stopAmbience(fadeMs = 600): void {
    this.clearPendingPlayRequestsByKind('ambience');
    if (this.currentAmbienceRequest) {
      this.stopRequest(this.currentAmbienceRequest, fadeMs);
      return;
    }
    if (!this.currentAmbience) return;
    this.fadeOutAndStop(this.currentAmbience, fadeMs);
    this.currentAmbience = null;
  }

  setChannelVolume(channel: AudioChannel, volume: number): void {
    this.channelVolumes.set(channel, Phaser.Math.Clamp(volume, 0, 1));
    if (channel === 'master' && this.isSceneAudioAvailable()) {
      this.scene.sound.setVolume(1);
    }
    this.applyCurrentChannelVolume(channel);
  }

  setMasterVolume(volume: number): void {
    this.setChannelVolume('master', volume);
  }

  setTaggedBaseVolume(tag: string, volume: number): void {
    const baseVolume = Phaser.Math.Clamp(volume, 0, 1);
    for (const sound of this.taggedSounds.get(tag) ?? []) {
      this.setTrackedSoundBaseVolume(sound, baseVolume);
    }
  }

  setMusicVolume(volume: number): void {
    this.setChannelVolume('music', volume);
  }

  setMusicEnabled(enabled: boolean): void {
    this.setChannelMuted('music', !enabled);
  }

  setVisibilityPlaybackAllowed(allowed: boolean): void {
    this.visibilityPlaybackAllowed = allowed;
    if (allowed) {
      this.resumeVisibilityPausedSounds();
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) {
      this.pauseAllForVisibility();
    }
  }

  pauseAllForVisibility(): void {
    for (const sounds of this.channelSounds.values()) {
      for (const sound of sounds) this.pauseSoundForVisibility(sound);
    }
  }

  resumeVisibilityPausedSounds(): void {
    for (const sound of [...this.visibilityPausedSounds]) {
      if ((sound as any).isPaused) {
        sound.resume();
      }
      this.visibilityPausedSounds.delete(sound);
    }
  }

  setAudioVolume(volume: number): void {
    const next = Phaser.Math.Clamp(volume, 0, 1);
    for (const channel of ['ambience', 'sfx', 'ui', 'dialogue', 'vehicle'] as const) {
      this.setChannelVolume(channel, next);
    }
  }

  setAudioEnabled(enabled: boolean): void {
    for (const channel of ['ambience', 'sfx', 'ui', 'dialogue', 'vehicle'] as const) {
      this.setChannelMuted(channel, !enabled);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.isSceneAudioAvailable()) return;
    this.scene.sound.setMute(muted);
  }

  updateListenerPosition(x: number, y: number): void {
    if (!this.isSceneAudioAvailable()) return;
    (this.scene.sound as any).setListenerPosition?.(x, y);
  }

  destroy(): void {
    this.destroyed = true;
    this.pendingLoads.clear();
    for (const request of this.pendingPlayRequests.values()) request.markStopped();
    this.pendingPlayRequests.clear();
    for (const tag of [...this.taggedSounds.keys()]) this.stopByTag(tag);
    this.currentMusicRequest?.markStopped();
    this.currentAmbienceRequest?.markStopped();
    this.currentMusic?.stop();
    this.currentAmbience?.stop();
    this.visibilityPausedSounds.clear();
    this.channelSounds.clear();
    this.taggedSounds.clear();
  }

  private resolveVolume(channel: AudioChannel, base: number): number {
    if (this.muted) return 0;
    return Phaser.Math.Clamp(
      base * (this.channelVolumes.get(channel) ?? 1) * (this.channelVolumes.get('master') ?? 1),
      0,
      1,
    );
  }

  private applyCurrentChannelVolume(channel: AudioChannel): void {
    const channels = channel === 'master'
      ? [...this.channelSounds.keys()]
      : [channel];
    for (const targetChannel of channels) {
      for (const sound of this.channelSounds.get(targetChannel) ?? []) {
        const tracked = this.soundBaseVolumes.get(sound);
        if (!tracked) continue;
        this.setSoundVolume(sound, this.resolveVolume(tracked.channel, tracked.baseVolume));
      }
    }
  }

  private setSoundVolume(sound: Phaser.Sound.BaseSound | null, volume: number): void {
    if (!sound || !('setVolume' in sound)) return;
    (sound as any).setVolume?.(volume);
  }

  private setTrackedSoundBaseVolume(sound: Phaser.Sound.BaseSound, baseVolume: number): void {
    const tracked = this.soundBaseVolumes.get(sound);
    if (!tracked) return;
    tracked.baseVolume = baseVolume;
    this.setSoundVolume(sound, this.resolveVolume(tracked.channel, baseVolume));
  }

  private setChannelMuted(channel: AudioChannel, muted: boolean): void {
    this.channelMutes.set(channel, muted);
    for (const sound of this.channelSounds.get(channel) ?? []) {
      this.setSoundMuted(sound, muted);
    }
  }

  private isChannelMuted(channel: AudioChannel): boolean {
    return this.channelMutes.get(channel) === true;
  }

  private setSoundMuted(sound: Phaser.Sound.BaseSound | null, muted: boolean): void {
    if (!sound) return;
    (sound as any).setMute?.(muted);
    if ('mute' in sound) {
      (sound as any).mute = muted;
    }
  }

  private isReadyToPlay(key: string): boolean {
    const cacheAfterEnsure = this.ensureLoaded(key);
    if (!cacheAfterEnsure) return false;
    return !this.isLocked();
  }

  private createPlaybackRequest(
    kind: AudioPlaybackKind,
    key: string,
    options: AudioPlayOptions | AudioMusicOptions,
    entry?: ReturnType<typeof getAudioEntry>,
  ): AudioPlaybackRequestState {
    const tag = options.tag
      ?? (kind === 'music' ? 'music' : kind === 'ambience' ? 'ambience' : entry?.tags?.[0]);
    return new AudioPlaybackRequestState(
      `audio:${++this.requestSequence}`,
      kind,
      key,
      tag,
      { ...options },
      (request, fadeMs) => this.stopRequest(request, fadeMs),
    );
  }

  private startPlainRequest(
    request: AudioPlaybackRequestState,
    entry: NonNullable<ReturnType<typeof getAudioEntry>>,
  ): AudioPlaybackRequest {
    const sound = this.playNow(request.key, entry, request.options as AudioPlayOptions);
    if (!sound) {
      request.markFailed();
      return request;
    }
    this.trackRequestSound(request, sound);
    return request;
  }

  private trackRequestSound(request: AudioPlaybackRequestState, sound: Phaser.Sound.BaseSound): void {
    request.markPlaying(sound);
    sound.once('complete', () => request.markStopped());
    sound.once('destroy', () => request.markStopped());
  }

  private queuePendingPlay(request: AudioPlaybackRequestState): void {
    if (this.destroyed || !this.scene?.sys) {
      request.markFailed();
      return;
    }
    const pendingKey = `${request.kind}:${request.key}`;
    const previous = this.pendingPlayRequests.get(pendingKey);
    if (previous && previous !== request) previous.markStopped();
    this.pendingPlayRequests.set(pendingKey, request);
  }

  private schedulePendingPlayFlush(): void {
    if (!this.pendingPlayRequests.size) return;
    const flush = () => this.flushPendingPlayRequests();
    if (this.scene.time?.delayedCall) {
      this.scene.time.delayedCall(80, flush);
      return;
    }
    globalThis.setTimeout(flush, 80);
  }

  private flushPendingPlayRequests(): void {
    if (!this.pendingPlayRequests.size || this.isLocked()) return;

    const requests = [...this.pendingPlayRequests.values()];
    this.pendingPlayRequests.clear();
    for (const request of requests) {
      if (request.status !== 'queued') continue;
      const entry = getAudioEntry(request.key);
      if (!entry || entry.enabled === false) {
        request.markFailed();
        continue;
      }
      if (!this.isReadyToPlay(request.key)) {
        this.queuePendingPlay(request);
        continue;
      }

      if (request.kind === 'music') {
        this.startMusicRequest(request, entry);
      } else if (request.kind === 'ambience') {
        this.startAmbienceRequest(request, entry);
      } else {
        this.startPlainRequest(request, entry);
      }
    }
  }

  private clearPendingPlayRequestsByTag(tag: string): void {
    for (const [requestKey, request] of [...this.pendingPlayRequests.entries()]) {
      if (request.tag === tag || (request.options as AudioPlayOptions).tag === tag) {
        request.markStopped();
        this.pendingPlayRequests.delete(requestKey);
      }
    }
  }

  private clearPendingPlayRequestsByKind(kind: AudioPlaybackKind): void {
    for (const [requestKey, request] of [...this.pendingPlayRequests.entries()]) {
      if (request.kind === kind) {
        request.markStopped();
        this.pendingPlayRequests.delete(requestKey);
      }
    }
  }

  private stopRequest(request: AudioPlaybackRequestState, fadeMs = 0): void {
    for (const [requestKey, pendingRequest] of [...this.pendingPlayRequests.entries()]) {
      if (pendingRequest === request) this.pendingPlayRequests.delete(requestKey);
    }

    if (request.sound) {
      this.fadeOutAndStop(request.sound, fadeMs);
    }
    if (this.currentMusicRequest === request) {
      this.currentMusic = null;
      this.currentMusicRequest = null;
    }
    if (this.currentAmbienceRequest === request) {
      this.currentAmbience = null;
      this.currentAmbienceRequest = null;
    }
    request.markStopped();
  }

  private stopCurrentRequestByTag(tag: string): void {
    if (this.currentMusicRequest?.tag === tag) {
      this.currentMusicRequest.markStopped();
      this.currentMusicRequest = null;
      this.currentMusic = null;
    }
    if (this.currentAmbienceRequest?.tag === tag) {
      this.currentAmbienceRequest.markStopped();
      this.currentAmbienceRequest = null;
      this.currentAmbience = null;
    }
  }

  private ensureLoaded(key: string): boolean {
    if (!this.isSceneAudioAvailable()) return false;
    if (this.hasAudio(key)) return true;
    if (this.pendingLoads.has(key)) return false;
    const entry = getAudioEntry(key);
    if (!entry || entry.enabled === false) return false;
    const url = resolveAudioSourceUrl(entry.source);
    const loader = this.scene.load as any;
    if (!loader?.audio || !loader?.once || !loader?.on) return false;
    const cleanup = () => {
      this.pendingLoads.delete(key);
      loader.off?.('loaderror', onLoadError);
      this.schedulePendingPlayFlush();
    };
    const onLoadError = (file: any) => {
      if (file?.key !== key) return;
      cleanup();
      for (const [requestKey, request] of [...this.pendingPlayRequests.entries()]) {
        if (request.key === key) {
          request.markFailed();
          this.pendingPlayRequests.delete(requestKey);
        }
      }
      console.warn('[AudioSystem] failed to load audio', { key, url });
    };

    this.pendingLoads.add(key);
    loader.once?.(`filecomplete-audio-${key}`, cleanup);
    loader.once?.('complete', cleanup);
    loader.on?.('loaderror', onLoadError);
    this.scene.load.audio(key, url);
    if (!loader.isLoading?.()) {
      this.scene.load.start();
    }
    return false;
  }

  private hasAudio(key: string): boolean {
    const audioCache = (this.scene.cache as any)?.audio;
    return Boolean(audioCache?.exists?.(key));
  }

  private trackTag(tag: string, sound: Phaser.Sound.BaseSound): void {
    const set = this.taggedSounds.get(tag) ?? new Set<Phaser.Sound.BaseSound>();
    set.add(sound);
    this.taggedSounds.set(tag, set);
  }

  private trackChannel(channel: AudioChannel, sound: Phaser.Sound.BaseSound): void {
    const set = this.channelSounds.get(channel) ?? new Set<Phaser.Sound.BaseSound>();
    set.add(sound);
    this.channelSounds.set(channel, set);
  }

  private untrackSound(sound: Phaser.Sound.BaseSound): void {
    this.visibilityPausedSounds.delete(sound);
    this.soundBaseVolumes.delete(sound);
    for (const [channel, sounds] of this.channelSounds.entries()) {
      sounds.delete(sound);
      if (!sounds.size) this.channelSounds.delete(channel);
    }
    for (const [tag, sounds] of this.taggedSounds.entries()) {
      sounds.delete(sound);
      if (!sounds.size) this.taggedSounds.delete(tag);
    }
  }

  private pauseSoundForVisibility(sound: Phaser.Sound.BaseSound): void {
    if ((sound as any).isPlaying) {
      sound.pause();
      this.visibilityPausedSounds.add(sound);
    }
  }

  private pauseSoundIfHidden(sound: Phaser.Sound.BaseSound): void {
    if (this.visibilityPlaybackAllowed) return;
    if (typeof document === 'undefined' || !document.hidden) return;
    this.pauseSoundForVisibility(sound);
  }

  private isSoundPlaybackActive(sound: Phaser.Sound.BaseSound | null): boolean {
    const anySound = sound as any;
    return Boolean(sound && (anySound.isPlaying || anySound.isPaused));
  }

  private fadeOutAndStop(sound: Phaser.Sound.BaseSound, durationMs: number): void {
    if (durationMs <= 0 || !this.scene.tweens?.add || !this.isSceneAudioAvailable()) {
      sound.stop();
      return;
    }
    this.scene.tweens.add({
      targets: sound as any,
      volume: 0,
      duration: durationMs,
      onComplete: () => sound.stop(),
    });
  }

  private isSceneAudioAvailable(): boolean {
    if (this.destroyed) return false;
    if (!this.scene?.sys) return false;
    const isActive = (this.scene.sys as any).isActive;
    if (typeof isActive === 'function' && !isActive.call(this.scene.sys)) return false;
    return Boolean(this.scene.sound && (this.scene.cache as any)?.audio);
  }

}
