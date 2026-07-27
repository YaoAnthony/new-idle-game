import Phaser from 'phaser';
import { FRAMES } from '../../constants';
import { TerrainType, type WorldGrid } from '../../shared/WorldGrid';
import { LAYER } from '../../world/utils';
import type { TiledMapDefinition, TiledResolvedTile, TiledTerrainKind } from './TiledMapTypes';
import { NavigationEdge } from '../../shared/WorldGrid';
import { rectFromCenter } from '../../features/collision';

const TERRAIN_TO_GRID: Record<TiledTerrainKind, TerrainType> = {
  grass: TerrainType.GRASS,
  path: TerrainType.PATH,
  water: TerrainType.WATER,
  border: TerrainType.BORDER,
  pond: TerrainType.POND,
  foliage: TerrainType.FOLIAGE,
};
const ELEVATION_BOUNDARY_COLLISION_THICKNESS = 6;

export interface TiledMapBuilderOptions {
  depthOffset?: number;
  worldId?: string;
}

export class TiledMapBuilder {
  private readonly createdObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly blockerIds: string[] = [];

  constructor(
    private readonly scene: Phaser.Scene & { collisionBlockers?: import('../../features/collision').CollisionBlockerRuntime },
    private readonly grid: WorldGrid,
    private readonly map: TiledMapDefinition,
    private readonly options: TiledMapBuilderOptions = {},
  ) {}

  build(): this {
    this.registerSharedFrames();
    this.populateGrid();
    this.renderTiles();
    this.createCollision();
    this.createElevationBoundaryCollision();
    return this;
  }

  destroy(): void {
    for (const object of [...this.createdObjects].reverse()) {
      if (object.active) object.destroy();
    }
    this.createdObjects.length = 0;
    for (const id of this.blockerIds.splice(0)) {
      this.scene.collisionBlockers?.remove(id);
    }
  }

  setVisible(visible: boolean): void {
    for (const object of this.createdObjects) {
      const target = object as Phaser.GameObjects.GameObject & { setVisible?: (value: boolean) => unknown };
      target.setVisible?.(visible);
    }
  }

  private registerSharedFrames(): void {
    for (const [key, def] of Object.entries(FRAMES)) {
      const texture = this.scene.textures.get(def.src);
      if (!texture || texture.has(key)) continue;
      texture.add(key, 0, def.x, def.y, def.w, def.h);
    }
  }

  private populateGrid(): void {
    for (const cell of this.map.cells) {
      this.grid.setTerrain(cell.col, cell.row, TERRAIN_TO_GRID[cell.terrain]);
      this.grid.setElevation(cell.col, cell.row, cell.elevation);
      this.grid.setTransition(cell.col, cell.row, cell.transition);
      if (cell.walkable && cell.weight > 1) {
        this.grid.setNavigationPenalty(cell.col, cell.row, cell.weight);
      }
    }
  }

  private renderTiles(): void {
    for (const tile of this.map.renderTiles) {
      const depth = this.depthForLayer(tile.layerName, tile.y);
      if (this.isWaterTile(tile)) {
        const sprite = this.scene.add.sprite(tile.x, tile.y, tile.tileset.textureKey, 0);
        this.track(sprite);
        sprite
          .setOrigin(0, 0)
          .setScale(this.map.displayScale)
          .setDepth(depth)
          .play('water-tile');
        continue;
      }

      const frameKey = this.ensureFrame(tile);
      const image = this.scene.add.image(tile.x, tile.y, tile.tileset.textureKey, frameKey);
      this.track(image);
      image
        .setOrigin(0, 0)
        .setScale(this.map.displayScale)
        .setDepth(depth);
    }
  }

  private ensureFrame(tile: TiledResolvedTile): string {
    const frameKey = `tiled:${tile.tileset.name}:${tile.localId}`;
    const texture = this.scene.textures.get(tile.tileset.textureKey);
    if (texture.has(frameKey)) return frameKey;

    const sx = (tile.localId % tile.tileset.columns) * tile.tileset.tilewidth;
    const sy = Math.floor(tile.localId / tile.tileset.columns) * tile.tileset.tileheight;
    texture.add(frameKey, 0, sx, sy, tile.tileset.tilewidth, tile.tileset.tileheight);
    return frameKey;
  }

  private depthForLayer(layerName: string, y: number): number {
    const name = layerName.toLowerCase();
    const offset = this.options.depthOffset ?? 0;
    if (name.includes('water')) return offset + LAYER.WATER;
    if (name.includes('wall')) return offset + LAYER.WALL(y);
    if (name.includes('hill') || name.includes('cliff') || name.includes('border')) return offset + LAYER.BORDER + y * 0.0001;
    if (name.includes('detail')) return offset + LAYER.DETAIL + y * 0.0001;
    return offset + LAYER.GRASS + y * 0.0001;
  }

  private isWaterTile(tile: TiledResolvedTile): boolean {
    return tile.layerName.toLowerCase().includes('water')
      && tile.tileset.textureKey === 'water'
      && this.scene.anims.exists('water-tile');
  }

  private createCollision(): void {
    const tileW = this.map.displayTileWidth;
    const tileH = this.map.displayTileHeight;
    for (let row = 0; row < this.map.rows; row += 1) {
      let runStart: number | null = null;
      for (let col = 0; col <= this.map.cols; col += 1) {
        const blocked = col < this.map.cols && this.cellBlocksPhysics(this.map.cells[row * this.map.cols + col]);
        if (blocked && runStart === null) {
          runStart = col;
          continue;
        }
        if (blocked || runStart === null) continue;

        const runWidth = col - runStart;
        this.registerBlocker(
          `terrain:${row}:${runStart}:${col - 1}`,
          [rectFromCenter(
            runStart * tileW + (runWidth * tileW) / 2,
            row * tileH + tileH / 2,
            runWidth * tileW,
            tileH,
          )],
          'terrain',
          'terrain/static map',
        );
        runStart = null;
      }
    }
  }

  private cellBlocksPhysics(cell: TiledMapDefinition['cells'][number]): boolean {
    if (this.isInteriorMap()) {
      return !cell.walkable && cell.terrain !== 'water';
    }
    return !cell.walkable;
  }

  private isInteriorMap(): boolean {
    return this.map.ref.id === 'green-house' || this.map.ref.worldId === 'world:green-house';
  }

  private createElevationBoundaryCollision(): void {
    const tileW = this.map.displayTileWidth;
    const tileH = this.map.displayTileHeight;
    const thickness = ELEVATION_BOUNDARY_COLLISION_THICKNESS;

    for (let row = 0; row < this.map.rows; row += 1) {
      for (let col = 0; col < this.map.cols; col += 1) {
        const cell = this.cellAt(col, row);
        const right = this.cellAt(col + 1, row);
        const down = this.cellAt(col, row + 1);

        if (this.blocksElevationBoundary(cell, right)) {
          this.registerBlocker(
            `elevation:v:${col}:${row}`,
            [rectFromCenter((col + 1) * tileW, row * tileH + tileH / 2, thickness, tileH)],
            'terrain',
            'nav edge',
            [{ col, row, edge: NavigationEdge.EAST }],
          );
        }
        if (this.blocksElevationBoundary(cell, down)) {
          this.registerBlocker(
            `elevation:h:${col}:${row}`,
            [rectFromCenter(col * tileW + tileW / 2, (row + 1) * tileH, tileW, thickness)],
            'terrain',
            'nav edge',
            [{ col, row, edge: NavigationEdge.SOUTH }],
          );
        }
      }
    }
  }

  private cellAt(col: number, row: number): TiledMapDefinition['cells'][number] | null {
    if (col < 0 || row < 0 || col >= this.map.cols || row >= this.map.rows) return null;
    return this.map.cells[row * this.map.cols + col];
  }

  private blocksElevationBoundary(
    from: TiledMapDefinition['cells'][number] | null,
    to: TiledMapDefinition['cells'][number] | null,
  ): boolean {
    if (!from || !to) return false;
    if (!from.walkable || !to.walkable) return false;
    if (from.elevation === to.elevation) return false;
    return !from.transition && !to.transition;
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.createdObjects.push(object);
    return object;
  }

  private registerBlocker(
    localId: string,
    rects: import('../../features/collision').CollisionBlockerRect[],
    debugKind: import('../../features/collision').CollisionBlockerDebugKind,
    debugLabel: string,
    navEdges: import('../../features/collision').CollisionBlockerNavEdge[] = [],
  ): void {
    const worldId = this.options.worldId ?? this.map.ref.worldId;
    const id = `map:${worldId}:${this.map.ref.id}:${localId}`;
    this.scene.collisionBlockers?.upsert({
      id,
      worldId,
      rects,
      blocksPlayer: true,
      blocksNpcNav: true,
      debugLabel,
      debugKind,
      navEdges,
    });
    this.blockerIds.push(id);
  }
}
