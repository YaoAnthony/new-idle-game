import type { FogOfWarRevealConfig } from '../../rendering/LightingSystem';

export const FOG_OF_WAR_REVEAL_PRESETS = {
  bed: { enabled: true, radiusScale: 1.12, strength: 0.72, softness: 0.7 },
  nest: { enabled: true, radiusScale: 1.12, strength: 0.64, softness: 0.72 },
  chest: { enabled: true, radiusScale: 1.18, strength: 0.9, softness: 0.68 },
  playerFlashlight: { enabled: true, radiusScale: 1.04, strength: 1, softness: 0.55 },
  npcFlashlight: { enabled: true, radiusScale: 1.04, strength: 0.86, softness: 0.58 },
  remoteFlashlight: { enabled: true, radiusScale: 1.04, strength: 0.94, softness: 0.56 },
  busStation: { enabled: true, radiusScale: 1.16, strength: 0.78, softness: 0.7 },
  vehicleHeadlight: { enabled: true, radiusScale: 1.22, strength: 0.92, softness: 0.68 },
  vehicleCabin: { enabled: true, radiusScale: 1.14, strength: 0.62, softness: 0.72 },
  vehicleTail: { enabled: true, radiusScale: 1.1, strength: 0.42, softness: 0.74 },
  vehicleHeadlightCone: { enabled: true, radiusScale: 1.08, strength: 0.82, softness: 0.58 },
  spawnDemo: { enabled: true, shape: 'square', radiusScale: 1, strength: 1, softness: 0 },
} satisfies Record<string, FogOfWarRevealConfig>;
