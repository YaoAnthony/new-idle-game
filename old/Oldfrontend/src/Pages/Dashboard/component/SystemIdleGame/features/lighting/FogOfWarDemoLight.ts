import type { TiledMapDefinition } from '../../map/tiled/TiledMapTypes';
import type { LightConfig } from '../../rendering/LightingSystem';
import { FOG_OF_WAR_REVEAL_PRESETS } from './FogOfWarRevealPresets';

export const FOG_OF_WAR_DEMO_LIGHT_ID = 'fog-of-war:spawn-demo';

export const FOG_OF_WAR_DEMO_LIGHT_DEFAULTS = {
  radius: 180,
  color: 0xffd28a,
  intensity: 1,
  flicker: 0.015,
  verticalScale: 0.72,
  coreScale: 0.62,
} as const;

export function createFogOfWarDemoLight(mapDefinition: TiledMapDefinition): LightConfig {
  return {
    id: FOG_OF_WAR_DEMO_LIGHT_ID,
    x: mapDefinition.spawn.x,
    y: mapDefinition.spawn.y,
    worldId: mapDefinition.ref.worldId,
    radius: FOG_OF_WAR_DEMO_LIGHT_DEFAULTS.radius,
    color: FOG_OF_WAR_DEMO_LIGHT_DEFAULTS.color,
    intensity: FOG_OF_WAR_DEMO_LIGHT_DEFAULTS.intensity,
    flicker: FOG_OF_WAR_DEMO_LIGHT_DEFAULTS.flicker,
    verticalScale: FOG_OF_WAR_DEMO_LIGHT_DEFAULTS.verticalScale,
    coreScale: FOG_OF_WAR_DEMO_LIGHT_DEFAULTS.coreScale,
    fogOfWarReveal: FOG_OF_WAR_REVEAL_PRESETS.spawnDemo,
  };
}
