import type { AudioPlaybackRequest, AudioSystem } from './AudioSystem';
import type { WeatherType } from '../rendering/WeatherSystem';
import type { TiledMapDefinition, TiledTerrainKind } from '../map/tiled/TiledMapTypes';

interface EnvironmentalAudioDirectorOptions {
  audio: AudioSystem;
  getPlayerPosition: () => { x: number; y: number } | null;
  getWorldId: () => string;
  getMinuteOfDay: () => number;
  getWeather: () => WeatherType;
  getMapDefinition: () => TiledMapDefinition | null | undefined;
}

type EnvironmentalLayerId = 'weather.rain' | 'world.daytime' | 'water.sea';

interface EnvironmentalLayerTarget {
  audioKey: string;
  volume: number;
}

interface EnvironmentalLayerState {
  id: EnvironmentalLayerId;
  audioKey: string;
  activeAudioKey: string;
  tag: string;
  request: AudioPlaybackRequest | null;
  currentVolume: number;
  targetVolume: number;
}

interface EnvironmentalAudioProfile {
  id: 'outdoor' | 'greenhouse' | 'house';
  rain: {
    audioKey: string;
    rainVolume: number;
    stormVolume: number;
  } | null;
  daytimeVolume: number;
  fogDaytimeVolume: number;
  seaVolume: number;
}

const UPDATE_INTERVAL_MS = 120;
const MIN_AUDIBLE_VOLUME = 0.015;
const VOLUME_ATTACK_MS = 2200;
const VOLUME_RELEASE_MS = 3400;

const ENVIRONMENTAL_LAYERS: Array<Omit<EnvironmentalLayerState, 'request' | 'currentVolume' | 'targetVolume'>> = [
  { id: 'weather.rain', audioKey: 'ambience.rain_light', activeAudioKey: 'ambience.rain_light', tag: 'env:weather:rain' },
  { id: 'world.daytime', audioKey: 'ambience.village_morning', activeAudioKey: 'ambience.village_morning', tag: 'env:world:daytime' },
  { id: 'water.sea', audioKey: 'ambience.sea', activeAudioKey: 'ambience.sea', tag: 'env:water:sea' },
];

const ENVIRONMENTAL_AUDIO_PROFILES: Record<EnvironmentalAudioProfile['id'], EnvironmentalAudioProfile> = {
  outdoor: {
    id: 'outdoor',
    rain: {
      audioKey: 'ambience.rain_light',
      rainVolume: 0.5,
      stormVolume: 0.62,
    },
    daytimeVolume: 0.38,
    fogDaytimeVolume: 0.22,
    seaVolume: 0.24,
  },
  greenhouse: {
    id: 'greenhouse',
    rain: {
      audioKey: 'ambience.rain_light',
      rainVolume: 0.18,
      stormVolume: 0.24,
    },
    daytimeVolume: 0.08,
    fogDaytimeVolume: 0.04,
    seaVolume: 0,
  },
  house: {
    id: 'house',
    // Replace audioKey with a registered indoor-rain loop when that asset exists.
    rain: {
      audioKey: 'ambience.rain_light',
      rainVolume: 0.1,
      stormVolume: 0.14,
    },
    daytimeVolume: 0,
    fogDaytimeVolume: 0,
    seaVolume: 0,
  },
};

export class EnvironmentalAudioDirector {
  private readonly layers = new Map<EnvironmentalLayerId, EnvironmentalLayerState>();
  private lastUpdateMs = 0;
  private destroyed = false;

  constructor(private readonly options: EnvironmentalAudioDirectorOptions) {
    for (const layer of ENVIRONMENTAL_LAYERS) {
      this.layers.set(layer.id, {
        ...layer,
        request: null,
        currentVolume: 0,
        targetVolume: 0,
      });
    }
  }

  update(timeMs: number): void {
    if (this.destroyed) return;
    if (timeMs - this.lastUpdateMs < UPDATE_INTERVAL_MS) return;
    const deltaMs = this.lastUpdateMs > 0 ? timeMs - this.lastUpdateMs : UPDATE_INTERVAL_MS;
    this.lastUpdateMs = timeMs;
    this.applyTargets(this.resolveTargets(), deltaMs);
  }

  refresh(timeMs = 0): void {
    this.lastUpdateMs = 0;
    this.update(timeMs + UPDATE_INTERVAL_MS);
  }

  destroy(fadeMs = 350): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const layer of this.layers.values()) {
      layer.request?.stop(fadeMs);
      this.options.audio.stopByTag(layer.tag, fadeMs);
      layer.request = null;
      layer.currentVolume = 0;
      layer.targetVolume = 0;
    }
  }

  private resolveTargets(): Record<EnvironmentalLayerId, EnvironmentalLayerTarget> {
    const weather = this.options.getWeather();
    const minute = this.options.getMinuteOfDay();
    const worldId = this.options.getWorldId();
    const map = this.options.getMapDefinition();
    const player = this.options.getPlayerPosition();
    const profile = resolveEnvironmentalAudioProfile(worldId);
    const rainVolume = profile.rain
      ? weather === 'storm'
        ? profile.rain.stormVolume
        : weather === 'rain'
          ? profile.rain.rainVolume
          : 0
      : 0;
    const daytimeVolume = rainVolume > 0
      ? 0
      : worldId.startsWith('world:') && minute >= 360 && minute < 1140
        ? weather === 'fog' ? profile.fogDaytimeVolume : profile.daytimeVolume
        : 0;

    return {
      'weather.rain': {
        audioKey: profile.rain?.audioKey ?? 'ambience.rain_light',
        volume: rainVolume,
      },
      'world.daytime': {
        audioKey: 'ambience.village_morning',
        volume: daytimeVolume,
      },
      'water.sea': {
        audioKey: 'ambience.sea',
        volume: this.resolveSeaVolume(player, map, worldId, profile),
      },
    };
  }

  private applyTargets(targets: Record<EnvironmentalLayerId, EnvironmentalLayerTarget>, deltaMs: number): void {
    for (const [id, target] of Object.entries(targets) as Array<[EnvironmentalLayerId, EnvironmentalLayerTarget]>) {
      const layer = this.layers.get(id);
      if (!layer) continue;
      this.applyLayerTarget(layer, target, deltaMs);
    }
  }

  private applyLayerTarget(layer: EnvironmentalLayerState, target: EnvironmentalLayerTarget, deltaMs: number): void {
    const nextVolume = clamp01(target.volume);
    if (target.audioKey !== layer.activeAudioKey && layer.request) {
      layer.request.stop(700);
      this.options.audio.stopByTag(layer.tag, 700);
      layer.request = null;
      layer.currentVolume = 0;
    }
    layer.activeAudioKey = target.audioKey;
    layer.targetVolume = nextVolume;

    if (nextVolume <= MIN_AUDIBLE_VOLUME && layer.currentVolume <= MIN_AUDIBLE_VOLUME && !layer.request) {
      return;
    }
    if (nextVolume <= MIN_AUDIBLE_VOLUME && !layer.request) {
      layer.currentVolume = 0;
      return;
    }

    if (nextVolume > MIN_AUDIBLE_VOLUME && (!layer.request || layer.request.status === 'failed' || layer.request.status === 'stopped')) {
      const request = this.options.audio.requestPlay(layer.activeAudioKey || layer.audioKey, {
        loop: true,
        tag: layer.tag,
        volume: 0,
      });
      layer.request = request;
      request.onStarted(() => {
        if (layer.request !== request) return;
        this.options.audio.setTaggedBaseVolume(layer.tag, layer.currentVolume);
      });
      request.onFailed(() => {
        if (layer.request === request) layer.request = null;
      });
      request.onStopped(() => {
        if (layer.request === request) layer.request = null;
      });
    }

    layer.currentVolume = moveVolumeToward(
      layer.currentVolume,
      nextVolume,
      deltaMs,
      nextVolume > layer.currentVolume ? VOLUME_ATTACK_MS : VOLUME_RELEASE_MS,
    );
    this.options.audio.setTaggedBaseVolume(layer.tag, layer.currentVolume);

    if (nextVolume <= MIN_AUDIBLE_VOLUME && layer.currentVolume <= MIN_AUDIBLE_VOLUME && layer.request) {
      layer.request.stop(900);
      layer.request = null;
      this.options.audio.stopByTag(layer.tag, 900);
    }
  }

  private resolveSeaVolume(
    player: { x: number; y: number } | null,
    map: TiledMapDefinition | null | undefined,
    worldId: string,
    profile: EnvironmentalAudioProfile,
  ): number {
    if (profile.seaVolume <= 0) return 0;
    if (!player || !map || map.ref.worldId !== worldId) return 0;

    const tileSize = Math.min(map.displayTileWidth, map.displayTileHeight);
    const innerDistance = tileSize * 0.5;
    const outerDistance = tileSize * 2.4;
    const distance = nearestTerrainDistancePx(player, map, outerDistance, ['water']);
    if (distance === null || distance >= outerDistance) return 0;

    const linear = 1 - ((Math.max(distance, innerDistance) - innerDistance) / (outerDistance - innerDistance));
    return easeInCubic(clamp01(linear)) * profile.seaVolume;
  }
}

function resolveEnvironmentalAudioProfile(worldId: string): EnvironmentalAudioProfile {
  if (worldId.startsWith('world:house:')) return ENVIRONMENTAL_AUDIO_PROFILES.house;
  if (worldId === 'world:green-house') return ENVIRONMENTAL_AUDIO_PROFILES.greenhouse;
  return ENVIRONMENTAL_AUDIO_PROFILES.outdoor;
}

function nearestTerrainDistancePx(
  point: { x: number; y: number },
  map: TiledMapDefinition,
  maxDistancePx: number,
  terrainKinds: TiledTerrainKind[],
): number | null {
  const tileW = map.displayTileWidth;
  const tileH = map.displayTileHeight;
  const centerCol = Math.floor(point.x / tileW);
  const centerRow = Math.floor(point.y / tileH);
  const radiusCols = Math.ceil(maxDistancePx / tileW);
  const radiusRows = Math.ceil(maxDistancePx / tileH);
  const terrainSet = new Set<TiledTerrainKind>(terrainKinds);
  let nearestSq = Number.POSITIVE_INFINITY;

  for (let row = Math.max(0, centerRow - radiusRows); row <= Math.min(map.rows - 1, centerRow + radiusRows); row += 1) {
    for (let col = Math.max(0, centerCol - radiusCols); col <= Math.min(map.cols - 1, centerCol + radiusCols); col += 1) {
      const cell = map.cells[row * map.cols + col];
      if (!cell || !terrainSet.has(cell.terrain)) continue;
      const distanceSq = distanceToTileRectSq(point.x, point.y, col * tileW, row * tileH, tileW, tileH);
      if (distanceSq < nearestSq) nearestSq = distanceSq;
    }
  }

  if (!Number.isFinite(nearestSq)) return null;
  return Math.sqrt(nearestSq);
}

function distanceToTileRectSq(x: number, y: number, left: number, top: number, width: number, height: number): number {
  const dx = x < left ? left - x : x > left + width ? x - (left + width) : 0;
  const dy = y < top ? top - y : y > top + height ? y - (top + height) : 0;
  return dx * dx + dy * dy;
}

function easeInCubic(value: number): number {
  return value ** 3;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function moveVolumeToward(current: number, target: number, deltaMs: number, durationMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return current;
  const amount = Math.min(1, deltaMs / Math.max(1, durationMs));
  const next = current + ((target - current) * amount);
  if (Math.abs(next - target) < 0.002) return target;
  return clamp01(next);
}
