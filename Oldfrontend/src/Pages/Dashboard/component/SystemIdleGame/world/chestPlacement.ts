import type { GameChest } from '../../../../../Types/Profile';

type GridCell = { col: number; row: number };
type WorldPoint = { x: number; y: number };

type GridStateCell = {
  terrain?: string | number;
  objectId?: string | null;
  cropId?: string | null;
  entityIds?: string[];
};

type ChestPlacementGrid = {
  cols?: number;
  rows?: number;
  worldToCell?: (x: number, y: number) => GridCell | null;
  cellToWorld?: (col: number, row: number) => { cx: number; cy: number } | null;
  getWeight?: (col: number, row: number) => number;
  getObject?: (col: number, row: number) => number;
  getCell?: (col: number, row: number) => GridStateCell | null;
  findNearest?: (
    col: number,
    row: number,
    predicate: (col: number, row: number) => boolean,
    maxRadius?: number,
  ) => GridCell | null;
};

type ExistingChest = {
  id?: string;
  sprite?: WorldPoint;
};

type ChestPlacementScene = {
  worldGrid?: ChestPlacementGrid | null;
  chestSystem?: {
    getViews?: () => Map<string, ExistingChest> | ExistingChest[];
  };
  player?: { sprite?: WorldPoint };
  pathfinder?: {
    findPath?: (sx: number, sy: number, ex: number, ey: number) => [number, number][];
  };
};

export type ReservedChestPosition = {
  id: string;
  x: number;
  y: number;
};

type ResolveOptions = {
  reserved?: ReservedChestPosition[];
  maxRadius?: number;
  maxAttempts?: number;
  random?: () => number;
};

const EMPTY_OBJECT = 0;
const DEFAULT_MAX_RADIUS = 24;
const DEFAULT_RANDOM_ATTEMPTS = 900;
const MIN_CHEST_SPACING_PX = 72;
const MIN_PLAYER_SPACING_PX = 96;
const CHEST_FOOTPRINT: GridCell[] = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
];
const BLOCKED_TERRAINS = new Set(['water', 'border', 'pond']);
const FALLBACK_POINTS: WorldPoint[] = [
  { x: 640, y: 760 },
  { x: 1160, y: 700 },
  { x: 1500, y: 980 },
  { x: 440, y: 900 },
  { x: 400, y: 1000 },
];

function isTerrainBlocked(terrain: GridStateCell['terrain']) {
  return typeof terrain === 'string' && BLOCKED_TERRAINS.has(terrain.toLowerCase());
}

function isStateCellBlocked(cell: GridStateCell | null | undefined, chestId: string) {
  if (!cell) return false;
  if (isTerrainBlocked(cell.terrain)) return true;
  if (cell.objectId && cell.objectId !== chestId) return true;
  if (cell.cropId) return true;
  if (cell.entityIds?.length) return true;
  return false;
}

function getCellCenter(grid: ChestPlacementGrid, cell: GridCell, fallback: WorldPoint): WorldPoint {
  const world = grid.cellToWorld?.(cell.col, cell.row);
  if (world) return { x: world.cx, y: world.cy };
  return fallback;
}

function isCellInBounds(grid: ChestPlacementGrid, cell: GridCell) {
  const cols = Number(grid.cols);
  const rows = Number(grid.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return true;
  return cell.col >= 0 && cell.row >= 0 && cell.col < cols && cell.row < rows;
}

function isFarFromChests(scene: ChestPlacementScene, point: WorldPoint, chestId: string, reserved: ReservedChestPosition[] = []) {
  const occupied = [
    ...reserved,
    ...getExistingChests(scene)
      .map((chest) => {
        if (!chest.sprite) return null;
        return { id: chest.id ?? '', x: chest.sprite.x, y: chest.sprite.y };
      })
      .filter((chest): chest is ReservedChestPosition => Boolean(chest)),
  ];

  return occupied.every((chest) => {
    if (chest.id === chestId) return true;
    const dx = chest.x - point.x;
    const dy = chest.y - point.y;
    return Math.hypot(dx, dy) >= MIN_CHEST_SPACING_PX;
  });
}

function getExistingChests(scene: ChestPlacementScene): ExistingChest[] {
  const views = scene.chestSystem?.getViews?.();
  if (views instanceof Map) return [...views.values()];
  if (Array.isArray(views)) return views;
  return [];
}

function isCellSafe(scene: ChestPlacementScene, cell: GridCell, chestId: string, reserved: ReservedChestPosition[] = []) {
  const grid = scene.worldGrid;
  if (!grid) return false;

  for (const offset of CHEST_FOOTPRINT) {
    const col = cell.col + offset.col;
    const row = cell.row + offset.row;
    if ((grid.getWeight?.(col, row) ?? 0) <= 0) return false;
    if ((grid.getObject?.(col, row) ?? EMPTY_OBJECT) !== EMPTY_OBJECT) return false;
    if (isStateCellBlocked(grid.getCell?.(col, row), chestId)) return false;
  }

  const center = getCellCenter(grid, cell, FALLBACK_POINTS[0]);
  return isFarFromChests(scene, center, chestId, reserved);
}

function findSafeCellNear(scene: ChestPlacementScene, point: WorldPoint, chestId: string, options: ResolveOptions = {}) {
  const grid = scene.worldGrid;
  const start = grid?.worldToCell?.(point.x, point.y);
  if (!grid || !start) return null;
  const reserved = options.reserved ?? [];
  if (isCellSafe(scene, start, chestId, reserved)) return start;
  return grid.findNearest?.(
    start.col,
    start.row,
    (col, row) => isCellSafe(scene, { col, row }, chestId, reserved),
    options.maxRadius ?? DEFAULT_MAX_RADIUS,
  ) ?? null;
}

function isReachableFromPlayer(scene: ChestPlacementScene, point: WorldPoint) {
  const player = scene.player?.sprite;
  const pathfinder = scene.pathfinder;
  if (!player || !pathfinder?.findPath) return true;
  return pathfinder.findPath(player.x, player.y, point.x, point.y).length > 0;
}

function isFarFromPlayer(scene: ChestPlacementScene, point: WorldPoint) {
  const player = scene.player?.sprite;
  if (!player) return true;
  return Math.hypot(player.x - point.x, player.y - point.y) >= MIN_PLAYER_SPACING_PX;
}

function isRandomCellSafe(scene: ChestPlacementScene, cell: GridCell, chestId: string, options: ResolveOptions = {}) {
  const grid = scene.worldGrid;
  if (!grid || !isCellInBounds(grid, cell)) return false;
  if (!isCellSafe(scene, cell, chestId, options.reserved ?? [])) return false;
  const center = getCellCenter(grid, cell, scene.player?.sprite ?? FALLBACK_POINTS[0]);
  return isFarFromPlayer(scene, center) && isReachableFromPlayer(scene, center);
}

function findNearestRandomCell(scene: ChestPlacementScene, chestId: string, options: ResolveOptions = {}) {
  const grid = scene.worldGrid;
  if (!grid) return null;
  const anchor = scene.player?.sprite ?? FALLBACK_POINTS[0];
  const start = grid.worldToCell?.(anchor.x, anchor.y);
  if (!start) return null;
  const maxRadius = Math.max(
    options.maxRadius ?? DEFAULT_MAX_RADIUS,
    Number(grid.cols ?? 0),
    Number(grid.rows ?? 0),
  );
  return grid.findNearest?.(
    start.col,
    start.row,
    (col, row) => isRandomCellSafe(scene, { col, row }, chestId, options),
    maxRadius,
  ) ?? null;
}

export function resolveRandomChestPlacement<T extends Pick<GameChest, 'id' | 'x' | 'y'>>(
  scene: ChestPlacementScene,
  chest: T,
  options: ResolveOptions = {},
): T {
  const grid = scene.worldGrid;
  if (!grid) return chest;

  const random = options.random ?? Math.random;
  const maxAttempts = options.maxAttempts ?? DEFAULT_RANDOM_ATTEMPTS;
  const anchor = scene.player?.sprite ?? { x: chest.x, y: chest.y };

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const preferNearPlayer = attempt < Math.floor(maxAttempts * 0.45);
    let cell: GridCell | null = null;

    if (preferNearPlayer) {
      const angle = random() * Math.PI * 2;
      const distance = 140 + random() * 520;
      cell = grid.worldToCell?.(
        anchor.x + Math.cos(angle) * distance,
        anchor.y + Math.sin(angle) * distance,
      ) ?? null;
    } else {
      const cols = Number(grid.cols ?? 0);
      const rows = Number(grid.rows ?? 0);
      if (cols > 0 && rows > 0) {
        cell = {
          col: Math.floor(random() * cols),
          row: Math.floor(random() * rows),
        };
      }
    }

    if (!cell || !isRandomCellSafe(scene, cell, chest.id, options)) continue;
    const center = getCellCenter(grid, cell, anchor);
    return { ...chest, x: Math.round(center.x), y: Math.round(center.y) };
  }

  const nearest = findNearestRandomCell(scene, chest.id, options);
  if (nearest) {
    const center = getCellCenter(grid, nearest, anchor);
    return { ...chest, x: Math.round(center.x), y: Math.round(center.y) };
  }

  return resolveSafeChestPlacement(scene, chest, options);
}

export function resolveSafeChestPlacement<T extends Pick<GameChest, 'id' | 'x' | 'y'>>(
  scene: ChestPlacementScene,
  chest: T,
  options: ResolveOptions = {},
): T {
  const grid = scene.worldGrid;
  if (!grid) return chest;

  const anchors: WorldPoint[] = [
    { x: chest.x, y: chest.y },
    ...(scene.player?.sprite ? [{ x: scene.player.sprite.x, y: scene.player.sprite.y }] : []),
    ...FALLBACK_POINTS,
  ];

  for (const anchor of anchors) {
    const cell = findSafeCellNear(scene, anchor, chest.id, options);
    if (!cell) continue;
    const center = getCellCenter(grid, cell, anchor);
    if (!isReachableFromPlayer(scene, center)) continue;
    if (center.x === chest.x && center.y === chest.y) return chest;
    console.info('[ChestPlacement] relocated chest to safe cell', {
      id: chest.id,
      from: { x: chest.x, y: chest.y },
      to: center,
      cell,
    });
    return { ...chest, x: Math.round(center.x), y: Math.round(center.y) };
  }

  console.warn('[ChestPlacement] no safe chest cell found, keeping original position', {
    id: chest.id,
    position: { x: chest.x, y: chest.y },
  });
  return chest;
}
