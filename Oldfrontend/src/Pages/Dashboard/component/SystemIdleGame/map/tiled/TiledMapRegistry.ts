import type {
  GameMapDelta,
  GameMapRef,
  TiledBusRoute,
  TiledMapCell,
  TiledMapDefinition,
  TiledMapMarker,
  TiledResolvedTile,
  TiledResolvedTileset,
  TiledTerrainKind,
} from './TiledMapTypes';

export const CURRENT_GAME_MAP_ID = 'main_world';
export const CURRENT_GAME_MAP_VERSION = 1;
export const CURRENT_GAME_WORLD_ID = 'world:main';
export const TILED_DISPLAY_SCALE = 2;

export const CURRENT_GAME_MAP_REF: GameMapRef = {
  id: CURRENT_GAME_MAP_ID,
  version: CURRENT_GAME_MAP_VERSION,
  worldId: CURRENT_GAME_WORLD_ID,
  asset: 'frontend/src/assets/map/world.tmj',
};

export const EMPTY_GAME_MAP_DELTA: GameMapDelta = {
  tilePatches: [],
  placedObjects: [],
  removedObjectIds: [],
};

type TiledProperty = { name: string; type?: string; value: unknown };
type TiledChunk = { x: number; y: number; width: number; height: number; data: number[] };
type TiledLayer = {
  name: string;
  type: string;
  path?: string;
  visible?: boolean;
  chunks?: TiledChunk[];
  data?: number[];
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  objects?: TiledObject[];
  properties?: TiledProperty[];
  layers?: TiledLayer[];
};
type TiledObject = {
  id?: number;
  name?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  properties?: TiledProperty[];
};
type TiledTilesetRef = { firstgid: number; source: string };
type TiledMapJson = {
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTilesetRef[];
};
type TiledTilesetJson = {
  name?: string;
  image: string;
  columns: number;
  tilecount: number;
  tilewidth: number;
  tileheight: number;
};

const FLIPPED_TILE_FLAGS = 0xe0000000;
const BUS_STATION_SOURCE_WIDTH = 1536;
const BUS_STATION_SOURCE_HEIGHT = 1024;

const tmjModules = import.meta.glob<string>(
  '../../../../../../assets/map/**/*.tmj',
  { query: '?raw', import: 'default', eager: true },
);

const tsjModules = import.meta.glob<string>(
  '../../../../../../assets/map/**/*.tsj',
  { query: '?raw', import: 'default', eager: true },
);

const cache = new Map<string, TiledMapDefinition>();

export function normalizeGameWorldId(input: unknown): string {
  const value = typeof input === 'string' ? input.trim() : '';
  return value || CURRENT_GAME_WORLD_ID;
}

export function getCurrentTiledMapDefinition(): TiledMapDefinition {
  return getTiledMapDefinition(CURRENT_GAME_MAP_ID);
}

export function getCurrentMapRef(): GameMapRef {
  return { ...CURRENT_GAME_MAP_REF };
}

export function createEmptyMapDelta(): GameMapDelta {
  return {
    tilePatches: [],
    placedObjects: [],
    removedObjectIds: [],
  };
}

export function listTiledMapIds(): string[] {
  return Object.keys(tmjModules).map(mapIdFromModulePath).sort();
}

export function getTiledMapDefinition(mapId: string): TiledMapDefinition {
  const normalizedMapId = normalizeTiledMapId(mapId || CURRENT_GAME_MAP_ID);
  const existing = cache.get(normalizedMapId);
  if (existing) return existing;

  const entry = Object.entries(tmjModules).find(([modulePath]) => mapIdFromModulePath(modulePath) === normalizedMapId)
    ?? Object.entries(tmjModules).find(([modulePath]) => mapIdFromModulePath(modulePath) === CURRENT_GAME_MAP_ID);
  if (!entry) {
    throw new Error('No Tiled world.tmj files found under frontend/src/assets/map.');
  }

  const [mapModulePath, rawMap] = entry;
  const definition = parseTiledMapDefinition(normalizedPath(mapModulePath), rawMap, normalizedMapId);
  cache.set(definition.ref.id, definition);
  return definition;
}

function parseTiledMapDefinition(mapModulePath: string, rawMap: string, requestedMapId: string): TiledMapDefinition {
  const map = JSON.parse(rawMap) as TiledMapJson;
  const layers = flattenTiledLayers(map.layers);
  const bounds = computeMapBounds(layers);
  const cols = bounds.maxX - bounds.minX + 1;
  const rows = bounds.maxY - bounds.minY + 1;
  const displayTileWidth = map.tilewidth * TILED_DISPLAY_SCALE;
  const displayTileHeight = map.tileheight * TILED_DISPLAY_SCALE;
  const cells = createDefaultCells(cols, rows, bounds.minX, bounds.minY);
  const tilesets = resolveTilesets(mapModulePath, map.tilesets);
  const renderTiles: TiledResolvedTile[] = [];

  for (const layer of layers) {
    if (layer.type === 'objectgroup') continue;
    if (layer.type !== 'tilelayer' || layer.visible === false) continue;
    const navRule = navigationRuleForLayer(layer);
    for (const tile of iterateLayerTiles(layer, bounds.minX, bounds.minY)) {
      const tileset = findTilesetForGid(tilesets, tile.gid);
      if (!tileset) continue;
      const localId = tile.gid - tileset.firstgid;
      renderTiles.push({
        gid: tile.gid,
        localId,
        col: tile.col,
        row: tile.row,
        x: tile.col * displayTileWidth,
        y: tile.row * displayTileHeight,
        layerName: layer.path ?? layer.name,
        tileset,
      });
      applyNavigationRule(cells[tile.row * cols + tile.col], navRule);
    }
  }

  const ref: GameMapRef = mapIdFromModulePath(mapModulePath) === CURRENT_GAME_MAP_ID
    ? { ...CURRENT_GAME_MAP_REF }
    : {
      id: requestedMapId,
      version: 1,
      worldId: `world:${requestedMapId}`,
      asset: assetPathFromModulePath(mapModulePath),
    };

  const spawn = resolveSpawn(map, layers, cells, bounds.minX, bounds.minY, displayTileWidth, displayTileHeight);
  const markers = resolveMarkers(map, layers, bounds.minX, bounds.minY);
  const busRoute = resolveBusRoute(
    map,
    layers,
    spawn,
    bounds.minX,
    bounds.minY,
    displayTileWidth,
    displayTileHeight,
    cols,
    rows,
  );

  return {
    ref,
    tileWidth: map.tilewidth,
    tileHeight: map.tileheight,
    displayScale: TILED_DISPLAY_SCALE,
    displayTileWidth,
    displayTileHeight,
    originTileX: bounds.minX,
    originTileY: bounds.minY,
    cols,
    rows,
    worldWidth: cols * displayTileWidth,
    worldHeight: rows * displayTileHeight,
    cells,
    renderTiles,
    tilesets,
    markers,
    transport: {
      busRoute,
    },
    spawn,
  };
}

function flattenTiledLayers(layers: TiledLayer[], parentPath = '', parentVisible = true): TiledLayer[] {
  const result: TiledLayer[] = [];

  for (const layer of layers ?? []) {
    const path = parentPath ? `${parentPath}/${layer.name}` : layer.name;
    const visible = parentVisible && layer.visible !== false;

    if (layer.type === 'group') {
      result.push(...flattenTiledLayers(layer.layers ?? [], path, visible));
      continue;
    }

    result.push({
      ...layer,
      path,
      visible,
    });
  }

  return result;
}

function computeMapBounds(layers: TiledLayer[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const layer of layers) {
    if (layer.type !== 'tilelayer' || layer.visible === false) continue;
    const chunks = layer.chunks ?? [];
    for (const chunk of chunks) {
      minX = Math.min(minX, chunk.x);
      minY = Math.min(minY, chunk.y);
      maxX = Math.max(maxX, chunk.x + chunk.width - 1);
      maxY = Math.max(maxY, chunk.y + chunk.height - 1);
    }
    if (!chunks.length && Array.isArray(layer.data) && layer.width && layer.height) {
      const x = layer.x ?? 0;
      const y = layer.y ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + layer.width - 1);
      maxY = Math.max(maxY, y + layer.height - 1);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

function createDefaultCells(cols: number, rows: number, originTileX: number, originTileY: number): TiledMapCell[] {
  return Array.from({ length: cols * rows }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      col,
      row,
      tileX: originTileX + col,
      tileY: originTileY + row,
      terrain: 'water',
      walkable: false,
      elevation: 0,
      transition: false,
      weight: 0,
    };
  });
}

function* iterateLayerTiles(layer: TiledLayer, originTileX: number, originTileY: number): Generator<{ gid: number; col: number; row: number }> {
  for (const chunk of layer.chunks ?? []) {
    for (let index = 0; index < chunk.data.length; index += 1) {
      const gid = normalizeGid(chunk.data[index]);
      if (!gid) continue;
      const tileX = chunk.x + (index % chunk.width);
      const tileY = chunk.y + Math.floor(index / chunk.width);
      yield { gid, col: tileX - originTileX, row: tileY - originTileY };
    }
  }

  if (!layer.chunks?.length && Array.isArray(layer.data) && layer.width && layer.height) {
    const baseX = layer.x ?? 0;
    const baseY = layer.y ?? 0;
    for (let index = 0; index < layer.data.length; index += 1) {
      const gid = normalizeGid(layer.data[index]);
      if (!gid) continue;
      const tileX = baseX + (index % layer.width);
      const tileY = baseY + Math.floor(index / layer.width);
      yield { gid, col: tileX - originTileX, row: tileY - originTileY };
    }
  }
}

function normalizeGid(rawGid: number): number {
  return rawGid & ~FLIPPED_TILE_FLAGS;
}

function resolveTilesets(mapModulePath: string, tilesetRefs: TiledTilesetRef[]): TiledResolvedTileset[] {
  return tilesetRefs.map((tilesetRef) => {
    const sourcePath = resolveTilesetModulePath(mapModulePath, tilesetRef.source);
    const rawTileset = tsjModules[sourcePath];
    if (!rawTileset) throw new Error(`Missing Tiled tileset source: ${tilesetRef.source}`);
    const tileset = JSON.parse(rawTileset) as TiledTilesetJson;
    return {
      firstgid: tilesetRef.firstgid,
      name: tileset.name || basenameWithoutExt(tilesetRef.source),
      source: tilesetRef.source,
      image: tileset.image,
      textureKey: textureKeyForImage(tileset.image),
      columns: tileset.columns,
      tilecount: tileset.tilecount,
      tilewidth: tileset.tilewidth,
      tileheight: tileset.tileheight,
    };
  }).sort((a, b) => a.firstgid - b.firstgid);
}

function resolveTilesetModulePath(mapModulePath: string, source: string): string {
  const directPath = resolveModulePath(dirname(mapModulePath), source);
  if (tsjModules[directPath]) return directPath;

  const sourceName = basenameWithoutExt(source).toLowerCase();
  const normalizedSourceName = normalizeTilesetName(sourceName);
  const mapDir = dirname(mapModulePath);
  const candidates = Object.keys(tsjModules).filter((modulePath) => {
    const candidateName = basenameWithoutExt(modulePath).toLowerCase();
    return normalizeTilesetName(candidateName) === normalizedSourceName;
  });

  const sameDirectoryCandidate = candidates.find((modulePath) => dirname(modulePath) === mapDir);
  if (sameDirectoryCandidate) return sameDirectoryCandidate;
  if (candidates.length > 0) return candidates[0];

  return directPath;
}

function findTilesetForGid(tilesets: TiledResolvedTileset[], gid: number): TiledResolvedTileset | null {
  let result: TiledResolvedTileset | null = null;
  for (const tileset of tilesets) {
    if (gid < tileset.firstgid) break;
    result = tileset;
  }
  return result;
}

function navigationRuleForLayer(layer: TiledLayer): {
  terrain: TiledTerrainKind;
  walkable: boolean;
  elevation: number;
  transition: boolean;
  weight: number;
} {
  const name = (layer.path ?? layer.name).toLowerCase();
  const terrainProperty = propertyValue(layer.properties, 'terrain');
  const walkableProperty = propertyValue(layer.properties, 'walkable');
  const elevationProperty = Number(propertyValue(layer.properties, 'elevation'));
  const transition = Boolean(propertyValue(layer.properties, 'transition'))
    || hasSemanticToken(name, ['enter', 'entrance', 'ramp', 'stair', 'stairs', 'transition']);
  const elevationFromName = Number((name.match(/(?:grass|ground|dirt|path|hill|level|elevation)(\d+)/)?.[1]) ?? 0);
  const elevation = Number.isFinite(elevationProperty) ? elevationProperty : elevationFromName;
  const hillGround = terrainProperty === 'hill' || /(?:^|[^a-z0-9])hill\d*(?:[^a-z0-9]|$)/.test(name);
  const hardBorder = terrainProperty === 'border' || name.includes('cliff') || name.includes('border');
  const structuralWall = terrainProperty === 'wall' || hasSemanticToken(name, ['wall', 'walls']);

  let terrain: TiledTerrainKind = 'grass';
  let walkable = true;
  let weight = 1;

  if (terrainProperty === 'water' || name.includes('water')) {
    terrain = 'water';
    walkable = false;
    weight = 0;
  } else if (terrainProperty === 'path' || name.includes('dirt') || name.includes('path') || name.includes('road')) {
    terrain = 'path';
    walkable = true;
    weight = 0.5;
  } else if (hardBorder || structuralWall) {
    terrain = 'border';
    walkable = false;
    weight = 0;
  } else if (hillGround) {
    terrain = 'grass';
    walkable = true;
    weight = 1;
  } else if (terrainProperty === 'pond' || name.includes('pond')) {
    terrain = 'pond';
    walkable = false;
    weight = 0;
  } else if (terrainProperty === 'foliage' || name.includes('foliage')) {
    terrain = 'foliage';
    walkable = true;
    weight = 2.5;
  }

  if (name.includes('collision') || name.includes('block')) {
    walkable = false;
    weight = 0;
  }
  if (typeof walkableProperty === 'boolean') {
    walkable = walkableProperty;
    if (!walkable) weight = 0;
  }
  if (transition) {
    terrain = 'path';
    walkable = true;
    weight = Math.max(weight, 0.8);
  }

  return { terrain, walkable, elevation, transition, weight };
}

function applyNavigationRule(cell: TiledMapCell | undefined, rule: ReturnType<typeof navigationRuleForLayer>): void {
  if (!cell) return;
  cell.terrain = rule.terrain;
  cell.walkable = rule.walkable;
  cell.elevation = rule.elevation;
  cell.transition = cell.transition || rule.transition;
  cell.weight = rule.weight;
}

function hasSemanticToken(name: string, tokens: string[]): boolean {
  return tokens.some((token) => new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(name));
}

function resolveSpawn(
  map: TiledMapJson,
  layers: TiledLayer[],
  cells: TiledMapCell[],
  originTileX: number,
  originTileY: number,
  displayTileWidth: number,
  displayTileHeight: number,
): TiledMapDefinition['spawn'] {
  for (const layer of layers) {
    if (layer.type !== 'objectgroup') continue;
    for (const object of layer.objects ?? []) {
      const key = `${layer.path ?? ''} ${layer.name ?? ''} ${object.name ?? ''} ${object.type ?? ''}`.toLowerCase();
      if (!key.includes('player_spawn') && !key.includes('spawn_player')) continue;
      const rawX = typeof object.x === 'number' ? object.x : 0;
      const rawY = typeof object.y === 'number' ? object.y : 0;
      const x = (rawX - originTileX * map.tilewidth) * TILED_DISPLAY_SCALE;
      const y = (rawY - originTileY * map.tileheight) * TILED_DISPLAY_SCALE;
      return {
        x,
        y,
        tileX: Math.floor(x / displayTileWidth),
        tileY: Math.floor(y / displayTileHeight),
        facing: 'down',
        source: 'object',
      };
    }
  }

  const maxCol = cells.reduce((max, cell) => Math.max(max, cell.col), 0);
  const maxRow = cells.reduce((max, cell) => Math.max(max, cell.row), 0);
  const centerX = ((maxCol + 1) * displayTileWidth) / 2;
  const centerY = ((maxRow + 1) * displayTileHeight) / 2;
  return {
    x: centerX,
    y: centerY,
    tileX: originTileX + Math.floor(centerX / displayTileWidth),
    tileY: originTileY + Math.floor(centerY / displayTileHeight),
    facing: 'down',
    source: 'derived',
  };
}

function resolveMarkers(
  map: Pick<TiledMapJson, 'tilewidth' | 'tileheight'>,
  layers: TiledLayer[],
  originTileX: number,
  originTileY: number,
): Record<string, TiledMapMarker[]> {
  const markers: Record<string, TiledMapMarker[]> = {};

  for (const layer of layers) {
    if (layer.type !== 'objectgroup' || layer.visible === false) continue;
    const layerName = layer.path ?? layer.name;
    for (const object of layer.objects ?? []) {
      if (object.visible === false) continue;
      const marker = tiledObjectMarker(object, layerName, map, originTileX, originTileY);
      const keys = markerKeys(marker, layerName);
      for (const key of keys) {
        if (!markers[key]) markers[key] = [];
        markers[key].push(marker);
      }
    }
  }

  return markers;
}

function tiledObjectMarker(
  object: TiledObject,
  layerName: string,
  map: Pick<TiledMapJson, 'tilewidth' | 'tileheight'>,
  originTileX: number,
  originTileY: number,
): TiledMapMarker {
  const rawX = typeof object.x === 'number' ? object.x : 0;
  const rawY = typeof object.y === 'number' ? object.y : 0;
  const width = typeof object.width === 'number' ? object.width : 0;
  const height = typeof object.height === 'number' ? object.height : 0;
  const x = (rawX - originTileX * map.tilewidth) * TILED_DISPLAY_SCALE;
  const y = (rawY - originTileY * map.tileheight) * TILED_DISPLAY_SCALE;
  const displayWidth = width * TILED_DISPLAY_SCALE;
  const displayHeight = height * TILED_DISPLAY_SCALE;

  return {
    id: object.id,
    name: object.name ?? '',
    type: object.type ?? '',
    layerName,
    x,
    y,
    width: displayWidth,
    height: displayHeight,
    centerX: x + displayWidth / 2,
    centerY: y + displayHeight / 2,
    bottomX: x + displayWidth / 2,
    bottomY: y + displayHeight,
    properties: propertiesToRecord(object.properties),
  };
}

function markerKeys(marker: TiledMapMarker, layerName: string): string[] {
  const rawKeys = [
    layerName,
    layerName.split('/').pop() ?? '',
    marker.name,
    marker.type,
    String(marker.properties.role ?? ''),
    String(marker.properties.marker ?? ''),
  ];

  return [...new Set(rawKeys.map(normalizeMarkerKey).filter(Boolean))];
}

function normalizeMarkerKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/[\s-]+/g, '_');
}

function propertiesToRecord(properties: TiledProperty[] | undefined): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const property of properties ?? []) {
    record[property.name] = property.value;
  }
  return record;
}

function resolveBusRoute(
  map: TiledMapJson,
  layers: TiledLayer[],
  spawn: TiledMapDefinition['spawn'],
  originTileX: number,
  originTileY: number,
  displayTileWidth: number,
  displayTileHeight: number,
  cols: number,
  rows: number,
): TiledBusRoute {
  let entry: { x: number; y: number } | null = null;
  let stop: { x: number; y: number } | null = null;
  let stationAnchor: { x: number; y: number } | null = null;
  let stationVisible: boolean | null = null;
  let exit: { x: number; y: number } | null = null;
  let npcExit: { x: number; y: number } | null = null;
  let stationOffsetY: number | null = null;
  let busScale = 0.18;
  let stationScale: number | null = null;
  let stationCollisionWidth: number | null = null;
  let stationCollisionHeight: number | null = null;
  let stationCollisionOffsetX: number | null = null;
  let stationCollisionOffsetY: number | null = null;
  let stationLightOffsetX: number | null = null;
  let stationLightOffsetY: number | null = null;
  let stationLightRadius: number | null = null;
  let stationLightIntensity: number | null = null;
  let hasObjectMarker = false;

  for (const layer of layers) {
    if (layer.type !== 'objectgroup') continue;
    busScale = propertyNumber(layer.properties, 'busScale') ?? busScale;
    busScale = propertyNumber(layer.properties, 'bus_scale') ?? busScale;
    stationScale = propertyNumber(layer.properties, 'stationScale') ?? stationScale;
    stationScale = propertyNumber(layer.properties, 'station_scale') ?? stationScale;
    stationVisible = propertyBoolean(layer.properties, 'stationVisible') ?? stationVisible;
    stationVisible = propertyBoolean(layer.properties, 'station_visible') ?? stationVisible;
    stationCollisionWidth = propertyNumber(layer.properties, 'stationCollisionWidth') ?? stationCollisionWidth;
    stationCollisionWidth = propertyNumber(layer.properties, 'station_collision_width') ?? stationCollisionWidth;
    stationCollisionHeight = propertyNumber(layer.properties, 'stationCollisionHeight') ?? stationCollisionHeight;
    stationCollisionHeight = propertyNumber(layer.properties, 'station_collision_height') ?? stationCollisionHeight;
    stationCollisionOffsetX = propertyNumber(layer.properties, 'stationCollisionOffsetX') ?? stationCollisionOffsetX;
    stationCollisionOffsetX = propertyNumber(layer.properties, 'station_collision_offset_x') ?? stationCollisionOffsetX;
    stationCollisionOffsetY = propertyNumber(layer.properties, 'stationCollisionOffsetY') ?? stationCollisionOffsetY;
    stationCollisionOffsetY = propertyNumber(layer.properties, 'station_collision_offset_y') ?? stationCollisionOffsetY;
    stationOffsetY = propertyNumber(layer.properties, 'stationOffsetY') ?? stationOffsetY;
    stationOffsetY = propertyNumber(layer.properties, 'station_offset_y') ?? stationOffsetY;
    stationLightOffsetX = propertyNumber(layer.properties, 'stationLightOffsetX') ?? stationLightOffsetX;
    stationLightOffsetX = propertyNumber(layer.properties, 'station_light_offset_x') ?? stationLightOffsetX;
    stationLightOffsetY = propertyNumber(layer.properties, 'stationLightOffsetY') ?? stationLightOffsetY;
    stationLightOffsetY = propertyNumber(layer.properties, 'station_light_offset_y') ?? stationLightOffsetY;
    stationLightRadius = propertyNumber(layer.properties, 'stationLightRadius') ?? stationLightRadius;
    stationLightRadius = propertyNumber(layer.properties, 'station_light_radius') ?? stationLightRadius;
    stationLightIntensity = propertyNumber(layer.properties, 'stationLightIntensity') ?? stationLightIntensity;
    stationLightIntensity = propertyNumber(layer.properties, 'station_light_intensity') ?? stationLightIntensity;
    for (const object of layer.objects ?? []) {
      const role = busObjectRole(object, layer);
      if (!role) continue;
      const point = busMarkerWorldPoint(object, map, originTileX, originTileY);
      hasObjectMarker = true;
      busScale = propertyNumber(object.properties, 'busScale') ?? busScale;
      busScale = propertyNumber(object.properties, 'bus_scale') ?? busScale;
      stationScale = propertyNumber(object.properties, 'stationScale') ?? stationScale;
      stationScale = propertyNumber(object.properties, 'station_scale') ?? stationScale;
      stationVisible = propertyBoolean(object.properties, 'stationVisible') ?? stationVisible;
      stationVisible = propertyBoolean(object.properties, 'station_visible') ?? stationVisible;
      stationCollisionWidth = propertyNumber(object.properties, 'stationCollisionWidth') ?? stationCollisionWidth;
      stationCollisionWidth = propertyNumber(object.properties, 'station_collision_width') ?? stationCollisionWidth;
      stationCollisionHeight = propertyNumber(object.properties, 'stationCollisionHeight') ?? stationCollisionHeight;
      stationCollisionHeight = propertyNumber(object.properties, 'station_collision_height') ?? stationCollisionHeight;
      stationCollisionOffsetX = propertyNumber(object.properties, 'stationCollisionOffsetX') ?? stationCollisionOffsetX;
      stationCollisionOffsetX = propertyNumber(object.properties, 'station_collision_offset_x') ?? stationCollisionOffsetX;
      stationCollisionOffsetY = propertyNumber(object.properties, 'stationCollisionOffsetY') ?? stationCollisionOffsetY;
      stationCollisionOffsetY = propertyNumber(object.properties, 'station_collision_offset_y') ?? stationCollisionOffsetY;
      stationOffsetY = propertyNumber(object.properties, 'stationOffsetY') ?? stationOffsetY;
      stationOffsetY = propertyNumber(object.properties, 'station_offset_y') ?? stationOffsetY;
      stationLightOffsetX = propertyNumber(object.properties, 'stationLightOffsetX') ?? stationLightOffsetX;
      stationLightOffsetX = propertyNumber(object.properties, 'station_light_offset_x') ?? stationLightOffsetX;
      stationLightOffsetY = propertyNumber(object.properties, 'stationLightOffsetY') ?? stationLightOffsetY;
      stationLightOffsetY = propertyNumber(object.properties, 'station_light_offset_y') ?? stationLightOffsetY;
      stationLightRadius = propertyNumber(object.properties, 'stationLightRadius') ?? stationLightRadius;
      stationLightRadius = propertyNumber(object.properties, 'station_light_radius') ?? stationLightRadius;
      stationLightIntensity = propertyNumber(object.properties, 'stationLightIntensity') ?? stationLightIntensity;
      stationLightIntensity = propertyNumber(object.properties, 'station_light_intensity') ?? stationLightIntensity;
      if (role === 'entry') entry = point;
      if (role === 'stop') {
        stop = point;
        stationAnchor = busMarkerTopLeftWorldPoint(object, map, originTileX, originTileY);
      }
      if (role === 'exit') exit = point;
      if (role === 'npcExit') npcExit = point;
    }
  }

  const fallback = deriveBusRoute(spawn, displayTileWidth, displayTileHeight, cols, rows);
  const resolvedStop = stop ?? fallback.stop;
  const resolvedEntry = entry ?? { x: fallback.entry.x, y: resolvedStop.y };
  const resolvedExit = exit ?? { x: fallback.exit.x, y: resolvedStop.y };
  const direction = resolvedExit.x >= resolvedEntry.x ? 'left_to_right' : 'right_to_left';
  const resolvedStationOffsetY = stationOffsetY ?? -displayTileHeight;
  const resolvedStationScale = stationScale ?? Math.max(0.2, busScale * 1.2);
  const resolvedStationAnchor = stationAnchor ?? resolvedStop;
  const resolvedStation = { x: resolvedStationAnchor.x, y: resolvedStationAnchor.y + resolvedStationOffsetY };
  const resolvedStationVisible = stationVisible ?? true;
  const resolvedStationLightOffsetX = stationLightOffsetX
    ?? BUS_STATION_SOURCE_WIDTH * resolvedStationScale * 0.22;
  const resolvedStationLightOffsetY = stationLightOffsetY
    ?? -BUS_STATION_SOURCE_HEIGHT * resolvedStationScale * 0.63;
  const resolvedStationLightRadius = stationLightRadius ?? 128;
  const resolvedStationLightIntensity = stationLightIntensity ?? 0.62;

  return {
    id: 'main-bus-route',
    entry: resolvedEntry,
    stop: resolvedStop,
    station: resolvedStation,
    stationVisible: resolvedStationVisible,
    stationRoofLights: resolvedStationVisible ? [
      {
        id: 'left',
        x: resolvedStation.x - resolvedStationLightOffsetX,
        y: resolvedStation.y + resolvedStationLightOffsetY,
        radius: resolvedStationLightRadius,
        intensity: resolvedStationLightIntensity,
      },
      {
        id: 'right',
        x: resolvedStation.x + resolvedStationLightOffsetX,
        y: resolvedStation.y + resolvedStationLightOffsetY,
        radius: resolvedStationLightRadius,
        intensity: resolvedStationLightIntensity,
      },
    ] : [],
    exit: resolvedExit,
    npcExit: npcExit ?? { x: resolvedStop.x, y: resolvedStop.y + displayTileHeight },
    direction,
    busScale,
    stationScale: resolvedStationScale,
    stationCollision: {
      offsetX: stationCollisionOffsetX ?? 0,
      offsetY: stationCollisionOffsetY ?? -BUS_STATION_SOURCE_HEIGHT * resolvedStationScale * 0.27,
      width: resolvedStationVisible
        ? stationCollisionWidth ?? BUS_STATION_SOURCE_WIDTH * resolvedStationScale * 0.72
        : 0,
      height: resolvedStationVisible
        ? stationCollisionHeight ?? BUS_STATION_SOURCE_HEIGHT * resolvedStationScale * 0.26
        : 0,
    },
    source: hasObjectMarker ? 'object' : 'derived',
  };
}

function deriveBusRoute(
  spawn: TiledMapDefinition['spawn'],
  displayTileWidth: number,
  displayTileHeight: number,
  cols: number,
  rows: number,
): TiledBusRoute {
  const worldWidth = cols * displayTileWidth;
  const worldHeight = rows * displayTileHeight;
  const routeY = clamp(
    spawn.y + displayTileHeight * 3,
    displayTileHeight * 2,
    Math.max(displayTileHeight * 2, worldHeight - displayTileHeight * 2),
  );
  const stopX = clamp(
    spawn.x + displayTileWidth * 4,
    displayTileWidth * 3,
    Math.max(displayTileWidth * 3, worldWidth - displayTileWidth * 3),
  );

  return {
    id: 'main-bus-route',
    entry: { x: -displayTileWidth * 5, y: routeY },
    stop: { x: stopX, y: routeY },
    station: { x: stopX, y: routeY - displayTileHeight },
    stationVisible: true,
    stationRoofLights: [
      {
        id: 'left',
        x: stopX - BUS_STATION_SOURCE_WIDTH * 0.22 * 0.22,
        y: routeY - displayTileHeight - BUS_STATION_SOURCE_HEIGHT * 0.22 * 0.63,
        radius: 128,
        intensity: 0.62,
      },
      {
        id: 'right',
        x: stopX + BUS_STATION_SOURCE_WIDTH * 0.22 * 0.22,
        y: routeY - displayTileHeight - BUS_STATION_SOURCE_HEIGHT * 0.22 * 0.63,
        radius: 128,
        intensity: 0.62,
      },
    ],
    exit: { x: worldWidth + displayTileWidth * 5, y: routeY },
    npcExit: { x: stopX, y: routeY + displayTileHeight },
    direction: 'left_to_right',
    busScale: 0.18,
    stationScale: 0.22,
    stationCollision: {
      offsetX: 0,
      offsetY: -BUS_STATION_SOURCE_HEIGHT * 0.22 * 0.27,
      width: BUS_STATION_SOURCE_WIDTH * 0.22 * 0.72,
      height: BUS_STATION_SOURCE_HEIGHT * 0.22 * 0.26,
    },
    source: 'derived',
  };
}

function busObjectRole(object: TiledObject, layer?: TiledLayer): 'entry' | 'stop' | 'exit' | 'npcExit' | null {
  const role = String(propertyValue(object.properties, 'role') ?? '').toLowerCase();
  const key = `${layer?.path ?? ''} ${layer?.name ?? ''} ${object.name ?? ''} ${object.type ?? ''} ${role}`
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (key.includes('bus npc exit') || key.includes('npc exit')) return 'npcExit';
  if (key.includes('bus entry') || key.includes('bus start') || key.includes('arrival entry')) return 'entry';
  if (key.includes('bus exit') || key.includes('bus end') || key.includes('departure exit')) return 'exit';
  if (key.includes('bus stop') || key.includes('bus station') || key.includes('bus arrive')) return 'stop';
  return null;
}

function busMarkerWorldPoint(
  object: TiledObject,
  map: Pick<TiledMapJson, 'tilewidth' | 'tileheight'>,
  originTileX: number,
  originTileY: number,
): { x: number; y: number } {
  // Tiled rectangle markers use top-left x/y; bus route anchors should sit on the marker's bottom center.
  const rawX = typeof object.x === 'number' ? object.x : 0;
  const rawY = typeof object.y === 'number' ? object.y : 0;
  const markerWidth = typeof object.width === 'number' ? object.width : 0;
  const markerHeight = typeof object.height === 'number' ? object.height : 0;
  return {
    x: (rawX + markerWidth / 2 - originTileX * map.tilewidth) * TILED_DISPLAY_SCALE,
    y: (rawY + markerHeight - originTileY * map.tileheight) * TILED_DISPLAY_SCALE,
  };
}

function busMarkerTopLeftWorldPoint(
  object: TiledObject,
  map: Pick<TiledMapJson, 'tilewidth' | 'tileheight'>,
  originTileX: number,
  originTileY: number,
): { x: number; y: number } {
  const rawX = typeof object.x === 'number' ? object.x : 0;
  const rawY = typeof object.y === 'number' ? object.y : 0;
  return {
    x: (rawX - originTileX * map.tilewidth) * TILED_DISPLAY_SCALE,
    y: (rawY - originTileY * map.tileheight) * TILED_DISPLAY_SCALE,
  };
}

function propertyValue(properties: TiledProperty[] | undefined, name: string): unknown {
  return properties?.find((property) => property.name === name)?.value;
}

function propertyNumber(properties: TiledProperty[] | undefined, name: string): number | null {
  const value = propertyValue(properties, name);
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function propertyBoolean(properties: TiledProperty[] | undefined, name: string): boolean | null {
  const value = propertyValue(properties, name);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return value;
  return Math.max(min, Math.min(max, value));
}

function textureKeyForImage(image: string): string {
  const normalized = image.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('/grass.png')) return 'grass';
  if (normalized.endsWith('/water.png')) return 'water';
  if (normalized.endsWith('/hills.png')) return 'hills';
  if (normalized.endsWith('/wooden house.png')) return 'house';
  if (normalized.endsWith('/tilled_dirt_v2.png')) return 'tilled-dirt-v2';
  if (normalized.endsWith('/tilled_dirt.png')) return 'tilled-dirt-variant';
  if (normalized.endsWith('/tilled dirt.png')) return 'tilled-dirt';
  return basenameWithoutExt(image);
}

function normalizeTiledMapId(mapId: string): string {
  const value = mapId.trim();
  if (value === 'green_house') return 'green-house';
  return value || CURRENT_GAME_MAP_ID;
}

function mapIdFromModulePath(modulePath: string): string {
  const normalized = normalizedPath(modulePath);
  if (normalized.endsWith('/assets/map/world.tmj')) return CURRENT_GAME_MAP_ID;
  const match = normalized.match(/\/assets\/map\/([^/]+)\/world\.tmj$/);
  if (match?.[1]) return normalizeTiledMapId(match[1]);
  const rootMap = normalized.match(/\/assets\/map\/([^/]+)\.tmj$/);
  if (rootMap?.[1]) return normalizeTiledMapId(rootMap[1]);
  return CURRENT_GAME_MAP_ID;
}

function assetPathFromModulePath(modulePath: string): string {
  const normalized = normalizedPath(modulePath);
  const marker = '/assets/map/';
  const index = normalized.indexOf(marker);
  return index === -1 ? normalized : `frontend/src${normalized.slice(index)}`;
}

function dirname(path: string): string {
  return normalizedPath(path).replace(/\/[^/]*$/, '');
}

function basenameWithoutExt(path: string): string {
  const file = normalizedPath(path).split('/').pop() ?? path;
  return file.replace(/\.[^.]+$/, '');
}

function normalizeTilesetName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '').toLowerCase();
}

function resolveModulePath(baseDir: string, relativePath: string): string {
  const parts = `${baseDir}/${relativePath}`.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..' && stack.length > 0 && stack[stack.length - 1] !== '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
}

function normalizedPath(path: string): string {
  return path.replace(/\\/g, '/');
}
