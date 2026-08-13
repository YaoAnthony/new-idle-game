export type AudioChannel =
  | 'master'
  | 'music'
  | 'ambience'
  | 'sfx'
  | 'ui'
  | 'dialogue'
  | 'vehicle';

export type AudioSource =
  | { kind: 'relative'; path: string }
  | { kind: 'url'; url: string };

export interface AudioRegistryEntry {
  id: string;
  label: string;
  channel: Exclude<AudioChannel, 'master'>;
  source: AudioSource;
  preload?: boolean;
  enabled?: boolean;
  loop?: boolean;
  volume?: number;
  rate?: number;
  tags?: string[];
  notes?: string;
  license?: string;
  sourcePage?: string;
}

export interface AudioPlayOptions {
  volume?: number;
  rate?: number;
  loop?: boolean;
  tag?: string;
  detune?: number;
}

export interface AudioMusicOptions extends AudioPlayOptions {
  fadeMs?: number;
}
