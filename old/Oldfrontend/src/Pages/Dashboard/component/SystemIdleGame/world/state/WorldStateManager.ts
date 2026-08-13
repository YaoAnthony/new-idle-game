import type {
  ChickenState,
  CropState,
  DropState,
  EntityState,
  NpcMindState,
  FarmClaimRecord,
  FarmPlotRef,
  NestState,
  ObjectState,
  TileCell,
  TreeState,
  WorldMetaState,
  WorldState,
} from './worldStateTypes';
import { StateBackedWorldGrid } from './StateBackedWorldGrid';
import { createInitialWorldState, migrateWorldState } from '../../state';
import { migrateNpcMindState } from '../../features/npc/blackboard/NpcMindDefaults';

interface WithPosition {
  id: string;
  x: number;
  y: number;
  worldId?: string;
}

type WorldGridResolver = (worldId: string | undefined) => StateBackedWorldGrid | null | undefined;

function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Thin state manager for the unified world model.
 *
 * This is intentionally small and compatibility-first:
 * - WorldGrid still serves pathfinding/collision duties
 * - WorldStateManager tracks logical registration/query/movement
 * - existing Phaser entities can be migrated gradually
 */
export class WorldStateManager {
  private readonly grid: StateBackedWorldGrid;
  private readonly state: WorldState;
  private gridResolver: WorldGridResolver | null = null;

  constructor(
    grid: StateBackedWorldGrid,
    initialState?: Partial<WorldState> | null,
    gridResolver?: WorldGridResolver,
  ) {
    this.grid = grid;
    this.gridResolver = gridResolver ?? null;
    this.state = initialState
      ? migrateWorldState(initialState, grid.cols, grid.rows)
      : createInitialWorldState(grid.cols, grid.rows);
  }

  setWorldGridResolver(gridResolver: WorldGridResolver | null): void {
    this.gridResolver = gridResolver;
  }

  initialize(meta?: Partial<WorldMetaState>): void {
    this.state.meta = {
      ...this.state.meta,
      ...meta,
    };
  }

  setMeta(patch: Partial<WorldMetaState>): void {
    this.state.meta = {
      ...this.state.meta,
      ...patch,
    };
  }

  registerEntity(entity: Omit<EntityState, 'cellX' | 'cellY'>): EntityState {
    if (this.state.entities[entity.id]) {
      this.unregisterEntity(entity.id);
    }
    const grid = this.getGridForWorld(this.resolveRecordWorldId(entity));
    const { col, row } = grid.worldToCell(entity.x, entity.y);
    const next: EntityState = { ...entity, cellX: col, cellY: row };
    this.state.entities[next.id] = next;
    grid.addEntityToCell(col, row, next.id);
    return next;
  }

  unregisterEntity(entityId: string): void {
    const current = this.state.entities[entityId];
    if (!current) return;
    this.getGridForWorld(this.resolveRecordWorldId(current)).removeEntityFromCell(current.cellX, current.cellY, entityId);
    delete this.state.entities[entityId];
  }

  updateEntityPosition(entityId: string, x: number, y: number, worldId?: string): void {
    const current = this.state.entities[entityId];
    if (!current) return;
    const previousWorldId = this.resolveRecordWorldId(current);
    const nextWorldId = worldId ?? previousWorldId;
    const previousGrid = this.getGridForWorld(previousWorldId);
    const nextGrid = this.getGridForWorld(nextWorldId);
    const nextCell = nextGrid.worldToCell(x, y);
    if (previousGrid !== nextGrid || current.cellX !== nextCell.col || current.cellY !== nextCell.row) {
      previousGrid.removeEntityFromCell(current.cellX, current.cellY, entityId);
      nextGrid.addEntityToCell(nextCell.col, nextCell.row, entityId);
      current.cellX = nextCell.col;
      current.cellY = nextCell.row;
    }
    current.x = x;
    current.y = y;
    if (worldId) current.worldId = worldId;
  }

  patchEntity(entityId: string, patch: Partial<Omit<EntityState, 'id'>>): void {
    const current = this.state.entities[entityId];
    if (!current) return;
    const previousWorldId = this.resolveRecordWorldId(current);
    const previousCell = { col: current.cellX, row: current.cellY };
    Object.assign(current, patch);
    const nextWorldId = this.resolveRecordWorldId(current);
    const nextGrid = this.getGridForWorld(nextWorldId);
    const nextCell = nextGrid.worldToCell(current.x, current.y);
    const previousGrid = this.getGridForWorld(previousWorldId);
    if (previousGrid !== nextGrid || previousCell.col !== nextCell.col || previousCell.row !== nextCell.row) {
      previousGrid.removeEntityFromCell(previousCell.col, previousCell.row, entityId);
      nextGrid.addEntityToCell(nextCell.col, nextCell.row, entityId);
      current.cellX = nextCell.col;
      current.cellY = nextCell.row;
    }
  }

  registerObject(object: Omit<ObjectState, 'cellX' | 'cellY'>): ObjectState {
    if (this.state.objects[object.id]) {
      this.unregisterObject(object.id);
    }
    const grid = this.getGridForWorld(this.resolveRecordWorldId(object));
    const { col, row } = grid.worldToCell(object.x, object.y);
    const next: ObjectState = { ...object, cellX: col, cellY: row };
    this.state.objects[next.id] = next;
    grid.setObjectOnCell(col, row, { id: next.id, kind: next.kind }, {
      walkable: next.blocking !== true,
      interactable: Boolean(next.interactable),
      transparent: true,
    });
    return next;
  }

  unregisterObject(objectId: string): void {
    const current = this.state.objects[objectId];
    if (!current) return;
    this.getGridForWorld(this.resolveRecordWorldId(current)).clearObjectOnCell(current.cellX, current.cellY, objectId);
    delete this.state.objects[objectId];
  }

  patchObject(objectId: string, patch: Partial<Omit<ObjectState, 'id'>>): void {
    const current = this.state.objects[objectId];
    if (!current) return;
    const previousWorldId = this.resolveRecordWorldId(current);
    const previousCell = { col: current.cellX, row: current.cellY };
    Object.assign(current, patch);
    const nextWorldId = this.resolveRecordWorldId(current);
    const previousGrid = this.getGridForWorld(previousWorldId);
    const nextGrid = this.getGridForWorld(nextWorldId);
    const nextCell = nextGrid.worldToCell(current.x, current.y);
    if (previousGrid !== nextGrid || previousCell.col !== nextCell.col || previousCell.row !== nextCell.row) {
      previousGrid.clearObjectOnCell(previousCell.col, previousCell.row, objectId);
      current.cellX = nextCell.col;
      current.cellY = nextCell.row;
    }
    nextGrid.setObjectOnCell(current.cellX, current.cellY, { id: current.id, kind: current.kind }, {
      walkable: current.blocking !== true,
      interactable: Boolean(current.interactable),
      transparent: true,
    });
  }

  registerDrop(drop: Omit<DropState, 'cellX' | 'cellY'>): DropState {
    if (this.state.drops[drop.id]) {
      this.unregisterDrop(drop.id);
    }
    const grid = this.getGridForWorld(this.resolveRecordWorldId(drop));
    const { col, row } = grid.worldToCell(drop.x, drop.y);
    const next: DropState = { ...drop, cellX: col, cellY: row };
    this.state.drops[next.id] = next;
    grid.addDropToCell(col, row, next.id);
    return next;
  }

  unregisterDrop(dropId: string): void {
    const current = this.state.drops[dropId];
    if (!current) return;
    this.getGridForWorld(this.resolveRecordWorldId(current)).removeDropFromCell(current.cellX, current.cellY, dropId);
    delete this.state.drops[dropId];
  }

  updateDropPosition(dropId: string, x: number, y: number, worldId?: string): void {
    const current = this.state.drops[dropId];
    if (!current) return;
    const previousWorldId = this.resolveRecordWorldId(current);
    const nextWorldId = worldId ?? previousWorldId;
    const previousGrid = this.getGridForWorld(previousWorldId);
    const nextGrid = this.getGridForWorld(nextWorldId);
    const nextCell = nextGrid.worldToCell(x, y);
    if (previousGrid !== nextGrid || current.cellX !== nextCell.col || current.cellY !== nextCell.row) {
      previousGrid.removeDropFromCell(current.cellX, current.cellY, dropId);
      nextGrid.addDropToCell(nextCell.col, nextCell.row, dropId);
      current.cellX = nextCell.col;
      current.cellY = nextCell.row;
    }
    current.x = x;
    current.y = y;
    if (worldId) current.worldId = worldId;
  }

  patchDrop(dropId: string, patch: Partial<Omit<DropState, 'id'>>): void {
    const current = this.state.drops[dropId];
    if (!current) return;
    const previousWorldId = this.resolveRecordWorldId(current);
    const previousCell = { col: current.cellX, row: current.cellY };
    Object.assign(current, patch);
    const nextWorldId = this.resolveRecordWorldId(current);
    const previousGrid = this.getGridForWorld(previousWorldId);
    const nextGrid = this.getGridForWorld(nextWorldId);
    const nextCell = nextGrid.worldToCell(current.x, current.y);
    if (previousGrid !== nextGrid || previousCell.col !== nextCell.col || previousCell.row !== nextCell.row) {
      previousGrid.removeDropFromCell(previousCell.col, previousCell.row, dropId);
      nextGrid.addDropToCell(nextCell.col, nextCell.row, dropId);
      current.cellX = nextCell.col;
      current.cellY = nextCell.row;
    }
  }

  registerCrop(crop: CropState): CropState {
    if (this.state.crops[crop.id]) {
      this.unregisterCrop(crop.id);
    }
    this.state.crops[crop.id] = crop;
    this.getGridForWorld(crop.worldId).setCropOnCell(crop.tx, crop.ty, crop);
    return crop;
  }

  unregisterCrop(cropId: string): void {
    const current = this.state.crops[cropId];
    if (!current) return;
    this.getGridForWorld(current.worldId).clearCropOnCell(current.tx, current.ty, cropId);
    delete this.state.crops[cropId];
  }

  patchCrop(cropId: string, patch: Partial<Omit<CropState, 'id'>>): void {
    const current = this.state.crops[cropId];
    if (!current) return;
    const previousWorldId = current.worldId;
    const previousTile = { tx: current.tx, ty: current.ty };
    Object.assign(current, patch);
    const previousGrid = this.getGridForWorld(previousWorldId);
    const nextGrid = this.getGridForWorld(current.worldId);
    if (previousGrid !== nextGrid || previousTile.tx !== current.tx || previousTile.ty !== current.ty) {
      previousGrid.clearCropOnCell(previousTile.tx, previousTile.ty, cropId);
    }
    nextGrid.setCropOnCell(current.tx, current.ty, current);
  }

  registerChickenState(chicken: Omit<ChickenState, 'cellX' | 'cellY'>): ChickenState {
    if (this.state.chickens[chicken.id]) {
      this.unregisterChickenState(chicken.id);
    }
    const grid = this.getGridForWorld(chicken.worldId);
    const { col, row } = grid.worldToCell(chicken.x, chicken.y);
    const next: ChickenState = { ...chicken, cellX: col, cellY: row };
    this.state.chickens[next.id] = next;
    this.registerEntity({
      id: next.id,
      kind: 'chicken',
      x: next.x,
      y: next.y,
      worldId: next.worldId,
      facing: next.facing,
      state: next.state,
      meta: {
        ...(next.meta ?? {}),
        interactable: false,
      },
    });
    return next;
  }

  unregisterChickenState(chickenId: string): void {
    const current = this.state.chickens[chickenId];
    if (!current) return;
    delete this.state.chickens[chickenId];
    this.unregisterEntity(chickenId);
  }

  updateChickenPosition(chickenId: string, x: number, y: number, worldId?: string): void {
    const current = this.state.chickens[chickenId];
    if (!current) return;
    const nextWorldId = worldId ?? current.worldId;
    const nextCell = this.getGridForWorld(nextWorldId).worldToCell(x, y);
    current.x = x;
    current.y = y;
    if (worldId) current.worldId = worldId;
    current.cellX = nextCell.col;
    current.cellY = nextCell.row;
    this.updateEntityPosition(chickenId, x, y, worldId);
  }

  patchChickenState(chickenId: string, patch: Partial<Omit<ChickenState, 'id'>>): void {
    const current = this.state.chickens[chickenId];
    if (!current) return;
    Object.assign(current, patch);
    const nextCell = this.getGridForWorld(current.worldId).worldToCell(current.x, current.y);
    current.cellX = nextCell.col;
    current.cellY = nextCell.row;
    this.patchEntity(chickenId, {
      x: current.x,
      y: current.y,
      worldId: current.worldId,
      facing: current.facing,
      state: current.state,
      meta: {
        ...(current.meta ?? {}),
        interactable: false,
      },
    });
  }

  registerTreeState(tree: Omit<TreeState, 'cellX' | 'cellY'>): TreeState {
    if (this.state.trees[tree.id]) {
      this.unregisterTreeState(tree.id);
    }
    const { col, row } = this.getGridForWorld(tree.worldId).worldToCell(tree.x, tree.y);
    const next: TreeState = { ...tree, cellX: col, cellY: row };
    this.state.trees[next.id] = next;
    this.registerObject({
      id: next.id,
      kind: 'tree',
      x: next.x,
      y: next.y,
      worldId: next.worldId,
      blocking: !next.isChopped,
      interactable: !next.isChopped,
      state: next.stage,
      meta: {
        ...(next.meta ?? {}),
        hasFruit: next.hasFruit,
        isChopped: next.isChopped,
      },
    });
    return next;
  }

  unregisterTreeState(treeId: string): void {
    const current = this.state.trees[treeId];
    if (!current) return;
    delete this.state.trees[treeId];
    this.unregisterObject(treeId);
  }

  patchTreeState(treeId: string, patch: Partial<Omit<TreeState, 'id'>>): void {
    const current = this.state.trees[treeId];
    if (!current) return;
    Object.assign(current, patch);
    this.patchObject(treeId, {
      x: current.x,
      y: current.y,
      worldId: current.worldId,
      blocking: !current.isChopped,
      interactable: !current.isChopped,
      state: current.stage,
      meta: {
        ...(current.meta ?? {}),
        hasFruit: current.hasFruit,
        isChopped: current.isChopped,
      },
    });
  }

  registerNestState(nest: Omit<NestState, 'cellX' | 'cellY'>): NestState {
    if (this.state.nests[nest.id]) {
      this.unregisterNestState(nest.id);
    }
    const { col, row } = this.grid.worldToCell(nest.x, nest.y);
    const next: NestState = { ...nest, cellX: col, cellY: row };
    this.state.nests[next.id] = next;
    this.registerObject({
      id: next.id,
      kind: 'nest',
      x: next.x,
      y: next.y,
      worldId: next.worldId,
      interactable: !next.removed && next.state !== 'occupied',
      blocking: false,
      state: next.state,
      meta: {
        ...(next.meta ?? {}),
        hasEgg: next.hasEgg,
        occupiedByChickenId: next.occupiedByChickenId,
        removed: next.removed,
      },
    });
    return next;
  }

  unregisterNestState(nestId: string): void {
    const current = this.state.nests[nestId];
    if (!current) return;
    delete this.state.nests[nestId];
    this.unregisterObject(nestId);
  }

  patchNestState(nestId: string, patch: Partial<Omit<NestState, 'id'>>): void {
    const current = this.state.nests[nestId];
    if (!current) return;
    Object.assign(current, patch);
    this.patchObject(nestId, {
      x: current.x,
      y: current.y,
      worldId: current.worldId,
      interactable: !current.removed && current.state !== 'occupied',
      blocking: false,
      state: current.state,
      meta: {
        ...(current.meta ?? {}),
        hasEgg: current.hasEgg,
        occupiedByChickenId: current.occupiedByChickenId,
        removed: current.removed,
      },
    });
  }

  registerNpcMindState(npcMind: NpcMindState): NpcMindState {
    const next = cloneJson(migrateNpcMindState(npcMind, npcMind.npcId, this.state.meta.absoluteGameMinutes));
    this.state.npcMinds[next.npcId] = next;
    return next;
  }

  patchNpcMindState(npcId: string, patch: Partial<Omit<NpcMindState, 'npcId'>>): void {
    const current = this.state.npcMinds[npcId];
    if (!current) return;
    const patched = {
      ...current,
      ...patch,
      profile: patch.profile
        ? { ...patch.profile }
        : current.profile,
      body: patch.body
        ? { ...patch.body }
        : current.body,
      heart: patch.heart
        ? { ...patch.heart }
        : current.heart,
      personality: patch.personality
        ? { ...patch.personality }
        : current.personality,
      memoryIndex: patch.memoryIndex
        ? cloneJson(patch.memoryIndex)
        : current.memoryIndex,
      beliefs: patch.beliefs
        ? cloneJson(patch.beliefs)
        : current.beliefs,
      ontology: patch.ontology
        ? cloneJson(patch.ontology)
        : current.ontology,
      goals: patch.goals
        ? cloneJson(patch.goals)
        : current.goals,
      inventoryView: patch.inventoryView
        ? cloneJson(patch.inventoryView)
        : current.inventoryView,
      skillProgress: patch.skillProgress
        ? cloneJson(patch.skillProgress)
        : current.skillProgress,
      director: patch.director
        ? cloneJson(patch.director)
        : current.director,
      currentIntent: patch.currentIntent
        ? { ...patch.currentIntent }
        : current.currentIntent,
      recentMemories: patch.recentMemories
        ? { ...patch.recentMemories }
        : current.recentMemories,
      knownLandmarks: patch.knownLandmarks
        ? { ...patch.knownLandmarks }
        : current.knownLandmarks,
      needs: patch.needs
        ? { ...patch.needs }
        : current.needs,
      relationships: patch.relationships
        ? { ...patch.relationships }
        : current.relationships,
      schedule: patch.schedule
        ? { ...patch.schedule }
        : current.schedule,
      skills: patch.skills
        ? { ...patch.skills }
        : current.skills,
      skillState: patch.skillState
        ? { ...patch.skillState }
        : current.skillState,
      meta: patch.meta
        ? { ...patch.meta }
        : current.meta,
    };
    this.state.npcMinds[npcId] = migrateNpcMindState(patched, npcId, this.state.meta.absoluteGameMinutes);
  }

  getFarmClaim(ref: FarmPlotRef): FarmClaimRecord | null {
    return this.state.farmClaims[this.farmClaimKey(ref)] ?? null;
  }

  claimFarmPlot(claim: FarmClaimRecord): { ok: boolean; reason?: string; claim?: FarmClaimRecord } {
    const key = this.farmClaimKey(claim);
    const existing = this.state.farmClaims[key];
    if (existing && existing.npcId !== claim.npcId) {
      return { ok: false, reason: 'claimed_by_other', claim: existing };
    }
    this.state.farmClaims[key] = { ...claim };
    return { ok: true, claim: this.state.farmClaims[key] };
  }

  releaseFarmPlot(ref: FarmPlotRef, npcId?: string): boolean {
    const key = this.farmClaimKey(ref);
    const existing = this.state.farmClaims[key];
    if (!existing) return false;
    if (npcId && existing.npcId !== npcId) return false;
    delete this.state.farmClaims[key];
    return true;
  }

  getFarmClaims(): Record<string, FarmClaimRecord> {
    return { ...this.state.farmClaims };
  }

  getNpcMindState(npcId: string): NpcMindState | null {
    return this.state.npcMinds[npcId] ?? null;
  }

  getNpcMindStates(): NpcMindState[] {
    return Object.values(this.state.npcMinds);
  }

  getState(): Readonly<WorldState> {
    return this.state;
  }

  getCell(x: number, y: number): TileCell | null {
    return this.grid.getCell(x, y);
  }

  getEntity(id: string): EntityState | null {
    return this.state.entities[id] ?? null;
  }

  getObject(id: string): ObjectState | null {
    return this.state.objects[id] ?? null;
  }

  getDrop(id: string): DropState | null {
    return this.state.drops[id] ?? null;
  }

  getCrop(id: string): CropState | null {
    return this.state.crops[id] ?? null;
  }

  getChickenState(id: string): ChickenState | null {
    return this.state.chickens[id] ?? null;
  }

  getTreeState(id: string): TreeState | null {
    return this.state.trees[id] ?? null;
  }

  getNestState(id: string): NestState | null {
    return this.state.nests[id] ?? null;
  }

  getChickenStates(): ChickenState[] {
    return Object.values(this.state.chickens);
  }

  getTreeStates(): TreeState[] {
    return Object.values(this.state.trees);
  }

  getNestStates(): NestState[] {
    return Object.values(this.state.nests);
  }

  getEntitiesInCell(x: number, y: number): EntityState[] {
    const ids = this.grid.getCell(x, y)?.entityIds ?? [];
    return ids.map(id => this.state.entities[id]).filter(Boolean);
  }

  getDropsInCell(x: number, y: number): DropState[] {
    const ids = this.grid.getCell(x, y)?.dropIds ?? [];
    return ids.map(id => this.state.drops[id]).filter(Boolean);
  }

  getReadonlySnapshot(): Readonly<WorldState> {
    return this.state;
  }

  exportSaveData(): WorldState {
    if (typeof structuredClone === 'function') {
      return structuredClone(this.state);
    }
    return JSON.parse(JSON.stringify(this.state)) as WorldState;
  }

  exportByWorldId(defaultWorldId = 'world:main'): Record<string, WorldState> {
    const result: Record<string, WorldState> = {};
    const getPartition = (worldIdInput: string | undefined): WorldState => {
      const worldId = worldIdInput || defaultWorldId;
      if (!result[worldId]) {
        const grid = this.getGridForWorld(worldId);
        result[worldId] = createInitialWorldState(grid.cols, grid.rows, this.state.meta);
      }
      return result[worldId];
    };
    const cloneRecord = <T>(value: T): T => {
      if (typeof structuredClone === 'function') return structuredClone(value);
      return JSON.parse(JSON.stringify(value)) as T;
    };

    Object.entries(this.state.entities).forEach(([id, record]) => {
      const worldId = this.resolveRecordWorldId(record) ?? defaultWorldId;
      getPartition(worldId).entities[id] = { ...cloneRecord(record), worldId };
    });
    Object.entries(this.state.objects).forEach(([id, record]) => {
      const worldId = this.resolveRecordWorldId(record) ?? defaultWorldId;
      getPartition(worldId).objects[id] = { ...cloneRecord(record), worldId };
    });
    Object.entries(this.state.drops).forEach(([id, record]) => {
      const worldId = this.resolveRecordWorldId(record) ?? defaultWorldId;
      getPartition(worldId).drops[id] = { ...cloneRecord(record), worldId };
    });
    Object.entries(this.state.crops).forEach(([id, record]) => {
      const worldId = record.worldId ?? defaultWorldId;
      getPartition(worldId).crops[id] = { ...cloneRecord(record), worldId };
    });
    Object.entries(this.state.chickens).forEach(([id, record]) => {
      const worldId = record.worldId ?? defaultWorldId;
      getPartition(worldId).chickens[id] = { ...cloneRecord(record), worldId };
    });
    Object.entries(this.state.trees).forEach(([id, record]) => {
      const worldId = record.worldId ?? defaultWorldId;
      getPartition(worldId).trees[id] = { ...cloneRecord(record), worldId };
    });
    Object.entries(this.state.nests).forEach(([id, record]) => {
      const worldId = record.worldId ?? defaultWorldId;
      getPartition(worldId).nests[id] = { ...cloneRecord(record), worldId };
    });
    Object.entries(this.state.farmClaims).forEach(([id, record]) => {
      const worldId = record.worldId ?? defaultWorldId;
      getPartition(worldId).farmClaims[id] = { ...cloneRecord(record), worldId };
    });
    Object.entries(this.state.npcMinds).forEach(([id, record]) => {
      const worldId = this.resolveRecordWorldId(this.state.entities[id]) ?? defaultWorldId;
      getPartition(worldId).npcMinds[id] = cloneRecord(record);
    });

    if (Object.keys(result).length === 0) {
      getPartition(defaultWorldId);
    }
    return result;
  }

  importSaveData(input: Partial<WorldState> | null | undefined): void {
    const next = migrateWorldState(input, this.state.grid.cols, this.state.grid.rows);
    this.state.grid = next.grid;
    this.state.entities = next.entities;
    this.state.objects = next.objects;
    this.state.drops = next.drops;
    this.state.crops = next.crops;
    this.state.chickens = next.chickens;
    this.state.trees = next.trees;
    this.state.nests = next.nests;
    this.state.npcMinds = next.npcMinds;
    this.state.farmClaims = next.farmClaims;
    this.state.meta = next.meta;
  }

  importByWorldId(worldStates: Record<string, Partial<WorldState> | null | undefined> | null | undefined): void {
    const merged = createInitialWorldState(this.state.grid.cols, this.state.grid.rows, this.state.meta);
    if (!worldStates || typeof worldStates !== 'object') {
      this.importSaveData(merged);
      return;
    }
    for (const [worldId, input] of Object.entries(worldStates)) {
      const grid = this.getGridForWorld(worldId);
      const next = migrateWorldState(input, grid.cols, grid.rows);
      Object.assign(merged.entities, this.stampWorldRecord(next.entities, worldId));
      Object.assign(merged.objects, this.stampWorldRecord(next.objects, worldId));
      Object.assign(merged.drops, this.stampWorldRecord(next.drops, worldId));
      Object.assign(merged.crops, this.stampWorldRecord(next.crops, worldId));
      Object.assign(merged.chickens, this.stampWorldRecord(next.chickens, worldId));
      Object.assign(merged.trees, this.stampWorldRecord(next.trees, worldId));
      Object.assign(merged.nests, this.stampWorldRecord(next.nests, worldId));
      Object.assign(merged.farmClaims, this.stampWorldRecord(next.farmClaims, worldId));
      Object.assign(merged.npcMinds, next.npcMinds);
      merged.meta = { ...merged.meta, ...next.meta };
    }
    this.importSaveData(merged);
  }

  syncEntity(entity: WithPosition): void {
    if (!this.state.entities[entity.id]) return;
    this.updateEntityPosition(entity.id, entity.x, entity.y, entity.worldId);
  }

  private getGridForWorld(worldId: string | undefined): StateBackedWorldGrid {
    return this.gridResolver?.(worldId) ?? this.grid;
  }

  private resolveRecordWorldId(record: { worldId?: string; meta?: Record<string, unknown> } | null | undefined): string | undefined {
    return record?.worldId
      ?? (typeof record?.meta?.worldId === 'string' ? record.meta.worldId : undefined);
  }

  private stampWorldRecord<T extends { worldId?: string }>(
    record: Record<string, T>,
    worldId: string,
  ): Record<string, T> {
    return Object.fromEntries(
      Object.entries(record ?? {}).map(([id, value]) => [id, { ...value, worldId: value.worldId ?? worldId }]),
    ) as Record<string, T>;
  }

  private farmClaimKey(ref: FarmPlotRef): string {
    return `${ref.worldId}:${ref.tx},${ref.ty}`;
  }
}
