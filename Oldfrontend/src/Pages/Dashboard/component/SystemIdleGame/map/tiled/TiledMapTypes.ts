export type TiledTerrainKind = 'grass' | 'path' | 'water' | 'border' | 'pond' | 'foliage';

export interface GameMapRef {
  id: string;
  version: number;
  worldId: string;
  asset: string;
}

export interface GameMapDelta {
  tilePatches: Array<{
    x: number;
    y: number;
    terrain?: TiledTerrainKind;
    walkable?: boolean;
    elevation?: number;
    transition?: boolean;
  }>;
  placedObjects: unknown[];
  removedObjectIds: string[];
}

export interface TiledMapCell {
  col: number;
  row: number;
  tileX: number;
  tileY: number;
  terrain: TiledTerrainKind;
  walkable: boolean;
  elevation: number;
  transition: boolean;
  weight: number;
}

export interface TiledResolvedTileset {
  firstgid: number;
  name: string;
  source: string;
  image: string;
  textureKey: string;
  columns: number;
  tilecount: number;
  tilewidth: number;
  tileheight: number;
}

export interface TiledResolvedTile {
  gid: number;
  localId: number;
  col: number;
  row: number;
  x: number;
  y: number;
  layerName: string;
  tileset: TiledResolvedTileset;
}

export interface TiledMapMarker {
  id?: number;
  name: string;
  type: string;
  layerName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  bottomX: number;
  bottomY: number;
  properties: Record<string, unknown>;
}

export interface TiledBusRoute {
  id: string;
  entry: { x: number; y: number };
  stop: { x: number; y: number };
  station: { x: number; y: number };
  stationVisible: boolean;
  stationRoofLights: Array<{
    id: string;
    x: number;
    y: number;
    radius: number;
    intensity: number;
  }>;
  exit: { x: number; y: number };
  npcExit: { x: number; y: number };
  direction: 'left_to_right' | 'right_to_left';
  busScale: number;
  stationScale: number;
  stationCollision: {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  };
  source: 'object' | 'derived';
}

export interface TiledMapDefinition {
  ref: GameMapRef;
  tileWidth: number;
  tileHeight: number;
  displayScale: number;
  displayTileWidth: number;
  displayTileHeight: number;
  originTileX: number;
  originTileY: number;
  cols: number;
  rows: number;
  worldWidth: number;
  worldHeight: number;
  cells: TiledMapCell[];
  renderTiles: TiledResolvedTile[];
  tilesets: TiledResolvedTileset[];
  markers: Record<string, TiledMapMarker[]>;
  transport: {
    busRoute: TiledBusRoute;
  };
  spawn: {
    x: number;
    y: number;
    tileX: number;
    tileY: number;
    facing: 'up' | 'down' | 'left' | 'right';
    source: 'object' | 'derived';
  };
}
