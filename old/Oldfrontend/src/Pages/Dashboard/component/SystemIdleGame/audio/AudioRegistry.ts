import type { AudioRegistryEntry, AudioSource } from './AudioTypes';
import { GENERATED_MUSIC_DIRECTORY_TRACKS } from './generatedMusicRegistry';

export const MUSIC_DIRECTORY_TRACKS: AudioRegistryEntry[] = GENERATED_MUSIC_DIRECTORY_TRACKS;

export const MUSIC_DIRECTORY_PLAYLIST = MUSIC_DIRECTORY_TRACKS.map((entry) => entry.id);

const MUSIC_DIRECTORY_REGISTRY = Object.fromEntries(
  MUSIC_DIRECTORY_TRACKS.map((entry) => [entry.id, entry]),
) as Record<string, AudioRegistryEntry>;

/**
 * Central audio registry.
 *
 * Use source.kind='relative' for files in frontend/public, for example:
 *   { kind: 'relative', path: '/music/Travelers.mp3' }
 *
 * Use source.kind='url' for remote assets that are allowed to be streamed:
 *   { kind: 'url', url: 'https://example.com/audio/theme.mp3' }
 */
export const AUDIO_REGISTRY: Record<string, AudioRegistryEntry> = {
  ...MUSIC_DIRECTORY_REGISTRY,
  'ui.confirm': {
    id: 'ui.confirm',
    label: 'UI confirm blip',
    channel: 'ui',
    source: { kind: 'relative', path: '/audio/system/ui_confirm.wav' },
    preload: true,
    volume: 0.32,
    tags: ['ui'],
  },
  'dialogue.npc_blip': {
    id: 'dialogue.npc_blip',
    label: 'NPC dialogue blip',
    channel: 'dialogue',
    source: { kind: 'relative', path: '/audio/system/dialogue_npc_blip.wav' },
    preload: true,
    volume: 0.24,
    tags: ['dialogue'],
  },
  'dialogue.player_blip': {
    id: 'dialogue.player_blip',
    label: 'Player dialogue blip',
    channel: 'dialogue',
    source: { kind: 'relative', path: '/audio/system/dialogue_player_blip.wav' },
    preload: true,
    volume: 0.22,
    tags: ['dialogue'],
  },
  'vehicle.bus_engine': {
    id: 'vehicle.bus_engine',
    label: 'Bus engine loop',
    channel: 'vehicle',
    source: { kind: 'relative', path: '/audio/system/bus_engine.wav' },
    preload: true,
    loop: true,
    volume: 0.34,
    tags: ['vehicle', 'bus'],
    license: 'Project generated placeholder',
    notes: 'Local file is used because Mixkit preview CDN blocks hotlinking with 403 in browser builds.',
  },
  'vehicle.bus_door': {
    id: 'vehicle.bus_door',
    label: 'Bus door placeholder',
    channel: 'vehicle',
    source: { kind: 'relative', path: '/audio/system/bus_door.wav' },
    preload: true,
    volume: 0.42,
    tags: ['vehicle', 'bus'],
  },
  'vehicle.bus_pass_by': {
    id: 'vehicle.bus_pass_by',
    label: 'Bus pass-by one-shot',
    channel: 'vehicle',
    source: { kind: 'relative', path: '/audio/system/bus_engine.wav' },
    preload: true,
    volume: 0.5,
    tags: ['vehicle', 'bus'],
    license: 'Project generated placeholder',
    notes: 'Local fallback for pass-by vehicle sound.',
  },
  'sfx.place_building': {
    id: 'sfx.place_building',
    label: 'Building placement placeholder',
    channel: 'sfx',
    source: { kind: 'relative', path: '/audio/system/place_building.wav' },
    preload: true,
    volume: 0.42,
    tags: ['sfx', 'building'],
  },
  'sfx.open_chest': {
    id: 'sfx.open_chest',
    label: 'Open coin chest',
    channel: 'sfx',
    source: { kind: 'relative', path: '/audio/system/open_chest.wav' },
    preload: true,
    volume: 0.58,
    tags: ['sfx', 'chest', 'coins'],
  },
  'entity.slime.move': {
    id: 'entity.slime.move',
    label: 'Slime movement',
    channel: 'sfx',
    source: { kind: 'relative', path: '/audio/entity/slime/move.wav' },
    preload: true,
    volume: 0.3,
    tags: ['sfx', 'entity', 'slime'],
  },
  'entity.slime.hit': {
    id: 'entity.slime.hit',
    label: 'Slime hit',
    channel: 'sfx',
    source: { kind: 'relative', path: '/audio/entity/slime/hit.wav' },
    preload: true,
    volume: 0.45,
    tags: ['sfx', 'entity', 'slime'],
  },
  'entity.action.eat_apple': {
    id: 'entity.action.eat_apple',
    label: 'Entity eats apple',
    channel: 'sfx',
    source: { kind: 'relative', path: '/audio/action/eat-apple.wav' },
    preload: true,
    volume: 0.48,
    tags: ['sfx', 'entity', 'action', 'eat', 'apple'],
  },
  'ambience.village_morning': {
    id: 'ambience.village_morning',
    label: 'Birds singing in garden',
    channel: 'ambience',
    source: { kind: 'relative', path: '/audio/system/village_morning.wav' },
    preload: true,
    loop: true,
    volume: 0.45,
    tags: ['ambience', 'village', 'farm', 'birds'],
    license: 'Project generated placeholder',
    notes: 'Local placeholder used so ambience playback does not depend on remote hotlinking.',
  },
  'ambience.farm_morning': {
    id: 'ambience.farm_morning',
    label: 'Birds singing in garden',
    channel: 'ambience',
    source: { kind: 'relative', path: '/audio/system/village_morning.wav' },
    preload: true,
    loop: true,
    volume: 0.45,
    tags: ['ambience', 'farm', 'birds'],
    license: 'Project generated placeholder',
    notes: 'Local placeholder used so ambience playback does not depend on remote hotlinking.',
  },
  'ambience.rain_light': {
    id: 'ambience.rain_light',
    label: 'Rain against the window',
    channel: 'ambience',
    source: { kind: 'relative', path: '/audio/system/rain_light.wav' },
    preload: true,
    loop: true,
    volume: 0.5,
    tags: ['ambience', 'rain', 'weather'],
    license: 'Project generated placeholder',
    notes: 'Weather ambience used while /weather rain or /weather storm is active.',
  },
  'ambience.sea': {
    id: 'ambience.sea',
    label: 'Sea waves',
    channel: 'ambience',
    source: { kind: 'relative', path: '/audio/system/environment/sea.wav' },
    preload: true,
    loop: true,
    volume: 0.32,
    tags: ['ambience', 'water', 'sea'],
    notes: 'Environmental shoreline loop mixed by player proximity to water terrain.',
  },
  'weather.thunder': {
    id: 'weather.thunder',
    label: 'Thunder',
    channel: 'sfx',
    source: { kind: 'relative', path: '/audio/system/weather/thunder.wav' },
    preload: true,
    volume: 0.58,
    tags: ['sfx', 'weather', 'thunder'],
    notes: 'Random thunder one-shot used while /weather storm is active.',
  },
};

export function listAudioRegistry(): AudioRegistryEntry[] {
  return Object.values(AUDIO_REGISTRY).map((entry) => ({ ...entry, source: { ...entry.source } }));
}

export function getAudioEntry(id: string | undefined | null): AudioRegistryEntry | null {
  if (!id) return null;
  return AUDIO_REGISTRY[id] ?? null;
}

export function listMusicAudioEntries(): AudioRegistryEntry[] {
  return listAudioRegistry().filter((entry) => entry.channel === 'music');
}

export function resolveAudioSourceUrl(source: AudioSource): string {
  return source.kind === 'relative' ? source.path : source.url;
}

export function getPreloadAudioEntries(): AudioRegistryEntry[] {
  return listAudioRegistry().filter((entry) => entry.enabled !== false && entry.preload !== false);
}
