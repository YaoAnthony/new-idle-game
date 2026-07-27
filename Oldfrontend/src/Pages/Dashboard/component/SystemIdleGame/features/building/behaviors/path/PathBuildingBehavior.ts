import type { BuildingBehavior } from '../BuildingBehaviorTypes';
import { getPathTerrainRuntime } from './PathTerrainRuntime';

export const PathBuildingBehavior: BuildingBehavior = {
  key: 'path_terrain',
  ownsRuntimeView: true,
  onLoaded(building, { scene }) {
    getPathTerrainRuntime(scene).ensureFromBuilding(building);
  },
  onRuntimeSync(building, { scene }) {
    getPathTerrainRuntime(scene).ensureFromBuilding(building);
  },
  onRemoved(building, { scene }) {
    getPathTerrainRuntime(scene).remove(building);
  },
};
