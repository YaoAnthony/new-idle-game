import {
  ObjectType,
  TerrainType,
  WorldGrid,
} from './WorldGrid';
import {
  createDefaultTileCell,
  type CropState,
  type ObjectState,
  type TileCell,
  type TileCellFlags,
  type TileMoisture,
  type TileSurface,
  type TileTerrain,
} from './worldStateTypes';

type TileCellPatch = Omit<Partial<TileCell>, 'flags'> & {
  flags?: Partial<TileCellFlags>;
};

/**
 * Phase-1 compatibility grid.
 *
 * Legacy WorldGrid remains the pathfinding/collision source used by gameplay.
 * This subclass adds a unified per-tile state cell so systems can start reading
 * logical world state without treating Phaser sprites as truth.
 */
export class StateBackedWorldGrid extends WorldGrid {
  private readonly cells: TileCell[];

  constructor(cols?: number, rows?: number) {
    super(cols, rows);
    this.cells = Array.from({ length: this.cols * this.rows }, () => createDefaultTileCell());
  }

  override setTerrain(col: number, row: number, type: TerrainType): void {
    super.setTerrain(col, row, type);
    const idx = this.indexOf(col, row);
    if (idx === -1) return;
    this.cells[idx] = {
      ...this.cells[idx],
      terrain: this.mapTerrainType(type),
      flags: {
        ...this.cells[idx].flags,
        walkable: type !== TerrainType.WATER && type !== TerrainType.BORDER && type !== TerrainType.POND,
      },
    };
  }

  override setObject(col: number, row: number, type: ObjectType): void {
    super.setObject(col, row, type);
    const idx = this.indexOf(col, row);
    if (idx === -1) return;

    const current = this.cells[idx];
    const surface = this.mapLegacyObjectToSurface(type);
    this.cells[idx] = {
      ...current,
      surface: surface ?? current.surface,
      flags: {
        ...current.flags,
        walkable: this.isWalkableForObject(type, current.flags.walkable),
        interactable: this.isInteractableObject(type, current.flags.interactable),
      },
    };
  }

  getCell(col: number, row: number): TileCell | null {
    const idx = this.indexOf(col, row);
    if (idx === -1) return null;
    const cell = this.cells[idx];
    return {
      ...cell,
      dropIds: [...cell.dropIds],
      entityIds: [...cell.entityIds],
      flags: { ...cell.flags },
    };
  }

  setCell(col: number, row: number, patch: TileCellPatch): TileCell | null {
    const idx = this.indexOf(col, row);
    if (idx === -1) return null;

    const current = this.cells[idx];
    this.cells[idx] = {
      ...current,
      ...patch,
      dropIds: patch.dropIds ? [...patch.dropIds] : current.dropIds,
      entityIds: patch.entityIds ? [...patch.entityIds] : current.entityIds,
      flags: patch.flags ? { ...current.flags, ...patch.flags } : current.flags,
    };

    const next = this.cells[idx];
    super.setTerrain(col, row, this.mapTileTerrain(next.terrain));
    super.setObject(col, row, this.mapCellToLegacyObject(next));
    return this.getCell(col, row);
  }

  addEntityToCell(col: number, row: number, entityId: string): void {
    const idx = this.indexOf(col, row);
    if (idx === -1) return;
    if (this.cells[idx].entityIds.includes(entityId)) return;
    this.cells[idx] = {
      ...this.cells[idx],
      entityIds: [...this.cells[idx].entityIds, entityId],
    };
  }

  removeEntityFromCell(col: number, row: number, entityId: string): void {
    const idx = this.indexOf(col, row);
    if (idx === -1) return;
    this.cells[idx] = {
      ...this.cells[idx],
      entityIds: this.cells[idx].entityIds.filter((id) => id !== entityId),
    };
  }

  addDropToCell(col: number, row: number, dropId: string): void {
    const idx = this.indexOf(col, row);
    if (idx === -1) return;
    if (this.cells[idx].dropIds.includes(dropId)) return;
    this.cells[idx] = {
      ...this.cells[idx],
      dropIds: [...this.cells[idx].dropIds, dropId],
      flags: {
        ...this.cells[idx].flags,
        interactable: true,
      },
    };
  }

  removeDropFromCell(col: number, row: number, dropId: string): void {
    const idx = this.indexOf(col, row);
    if (idx === -1) return;
    const nextDropIds = this.cells[idx].dropIds.filter((id) => id !== dropId);
    this.cells[idx] = {
      ...this.cells[idx],
      dropIds: nextDropIds,
      flags: {
        ...this.cells[idx].flags,
        interactable: nextDropIds.length > 0 || this.cells[idx].objectId !== null,
      },
    };
  }

  setObjectOnCell(
    col: number,
    row: number,
    object: Pick<ObjectState, 'id' | 'kind'>,
    flags?: Partial<TileCellFlags>,
  ): void {
    const idx = this.indexOf(col, row);
    if (idx === -1) return;
    const nextFlags = {
      walkable: this.cells[idx].flags.walkable,
      transparent: true,
      interactable: this.cells[idx].flags.interactable,
      ...flags,
    };
    this.cells[idx] = {
      ...this.cells[idx],
      objectId: object.id,
      surface: this.mapObjectKindToSurface(object.kind),
      flags: nextFlags,
    };
    this.setObject(col, row, this.mapWorldObjectKindToLegacyObject(this.cells[idx], object.kind, nextFlags));
  }

  clearObjectOnCell(col: number, row: number, objectId?: string): void {
    const idx = this.indexOf(col, row);
    if (idx === -1) return;
    const cell = this.cells[idx];
    if (objectId && cell.objectId !== objectId) return;

    super.setObject(col, row, ObjectType.EMPTY);
    this.cells[idx] = {
      ...cell,
      objectId: null,
      surface: cell.cropId ? cell.surface : 'none',
      flags: {
        walkable: true,
        transparent: true,
        interactable: cell.dropIds.length > 0,
      },
    };
  }

  setCropOnCell(
    col: number,
    row: number,
    crop: Pick<CropState, 'id' | 'state'>,
  ): void {
    this.setCell(col, row, {
      cropId: crop.id,
      surface: crop.state,
      moisture: this.mapCropStateToMoisture(crop.state),
    });
    super.setObject(col, row, this.mapCropStateToLegacyObject(crop.state));
  }

  clearCropOnCell(col: number, row: number, cropId?: string): void {
    const cell = this.getCell(col, row);
    if (!cell) return;
    if (cropId && cell.cropId !== cropId) return;

    this.setCell(col, row, {
      cropId: null,
      surface: cell.objectId ? cell.surface : 'none',
      moisture: 'dry',
    });
    if (!cell.objectId) {
      super.setObject(col, row, ObjectType.EMPTY);
    }
  }

  private indexOf(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    return row * this.cols + col;
  }

  private mapTerrainType(type: TerrainType): TileTerrain {
    switch (type) {
      case TerrainType.PATH:
        return 'path';
      case TerrainType.WATER:
        return 'water';
      case TerrainType.BORDER:
        return 'border';
      case TerrainType.POND:
        return 'pond';
      case TerrainType.FOLIAGE:
        return 'foliage';
      case TerrainType.GRASS:
      default:
        return 'grass';
    }
  }

  private mapTileTerrain(terrain: TileTerrain): TerrainType {
    switch (terrain) {
      case 'path':
        return TerrainType.PATH;
      case 'water':
        return TerrainType.WATER;
      case 'border':
        return TerrainType.BORDER;
      case 'pond':
        return TerrainType.POND;
      case 'foliage':
        return TerrainType.FOLIAGE;
      case 'grass':
      default:
        return TerrainType.GRASS;
    }
  }

  private mapLegacyObjectToSurface(type: ObjectType): TileSurface | null {
    switch (type) {
      case ObjectType.FARM_TILLED:
        return 'tilled';
      case ObjectType.FARM_WATERED:
        return 'watered';
      case ObjectType.FARM_SEEDED:
        return 'seeded';
      case ObjectType.FARM_GROWING:
        return 'growing';
      case ObjectType.FARM_READY:
        return 'ready';
      case ObjectType.FARM_HARVESTED:
        return 'harvested';
      case ObjectType.EMPTY:
        return 'none';
      default:
        return null;
    }
  }

  private mapCellToLegacyObject(cell: TileCell): ObjectType {
    if (cell.cropId) return this.mapCropStateToLegacyObject(cell.surface);
    if (!cell.objectId) {
      return cell.surface === 'tilled' ? ObjectType.FARM_TILLED : ObjectType.EMPTY;
    }

    switch (cell.surface) {
      case 'tilled':
        return ObjectType.FARM_TILLED;
      case 'watered':
        return ObjectType.FARM_WATERED;
      case 'seeded':
        return ObjectType.FARM_SEEDED;
      case 'growing':
        return ObjectType.FARM_GROWING;
      case 'ready':
        return ObjectType.FARM_READY;
      case 'harvested':
        return ObjectType.FARM_HARVESTED;
      default:
        return ObjectType.EMPTY;
    }
  }

  private mapObjectKindToSurface(kind: ObjectState['kind']): TileSurface {
    if (kind === 'farm_tile') return 'tilled';
    return 'none';
  }

  private mapWorldObjectKindToLegacyObject(cell: TileCell, kind: ObjectState['kind'], flags: TileCellFlags): ObjectType {
    if (kind === 'chest' && flags.walkable === false) return ObjectType.CHEST;
    return this.mapCellToLegacyObject(cell);
  }

  private mapCropStateToLegacyObject(surface: CropState['state'] | TileSurface): ObjectType {
    switch (surface) {
      case 'watered':
        return ObjectType.FARM_WATERED;
      case 'seeded':
        return ObjectType.FARM_SEEDED;
      case 'growing':
        return ObjectType.FARM_GROWING;
      case 'ready':
        return ObjectType.FARM_READY;
      case 'harvested':
        return ObjectType.FARM_HARVESTED;
      case 'tilled':
      default:
        return ObjectType.FARM_TILLED;
    }
  }

  private mapCropStateToMoisture(surface: CropState['state']): TileMoisture {
    if (surface === 'watered') return 'wet';
    return 'dry';
  }

  private blocksMovement(type: ObjectType): boolean {
    return type === ObjectType.TREE
      || type === ObjectType.CHEST
      || type === ObjectType.ROCK
      || type === ObjectType.BUSH;
  }

  private isWalkableForObject(type: ObjectType, fallback: boolean): boolean {
    if (this.blocksMovement(type)) return false;
    return fallback;
  }

  private isInteractableObject(type: ObjectType, fallback: boolean): boolean {
    if (type === ObjectType.CHEST || type === ObjectType.BED || type === ObjectType.NEST) {
      return true;
    }
    return fallback;
  }
}
