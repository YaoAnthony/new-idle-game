export type EntityKind =
  | 'player'
  | 'npc'
  | 'remote_player'
  | 'tree'
  | 'chest'
  | 'bed'
  | 'furniture'
  | 'fence'
  | 'nest'
  | 'chicken'
  | 'house'
  | 'storage_chest'
  | 'pet'
  | 'mob'
  | 'weapon'
  | 'projectile'
  | 'drop'
  | 'crop'
  | (string & {});

export interface EntityBounds {
  width: number;
  height: number;
}

export interface EntityUpdateContext {
  timeMs: number;
  deltaMs: number;
  dtSeconds: number;
  absoluteGameMinutes?: number;
}

export interface EntityRegistration<TRef = unknown> {
  id: string;
  kind: EntityKind;
  ref: TRef;
  x?: number;
  y?: number;
  worldId?: string;
  tags?: Iterable<string>;
  capabilities?: Iterable<string>;
  bounds?: EntityBounds;
  meta?: Record<string, unknown>;
  update?: (context: EntityUpdateContext) => void;
}

export interface EntityRecord<TRef = unknown> {
  id: string;
  kind: EntityKind;
  ref: TRef;
  x?: number;
  y?: number;
  worldId?: string;
  tags: Set<string>;
  capabilities: Set<string>;
  bounds?: EntityBounds;
  meta: Record<string, unknown>;
  update?: (context: EntityUpdateContext) => void;
}

/**
 * Shared runtime entity registry.
 *
 * This is intentionally not a domain owner: trees, NPCs, houses, and creatures
 * keep their behavior in their feature systems. EntitySystem only indexes live
 * runtime objects so callers can find/query/update them without knowing which
 * feature system owns each kind.
 */
export class EntitySystem {
  private readonly records = new Map<string, EntityRecord>();
  private readonly idsByKind = new Map<EntityKind, Set<string>>();
  private readonly idsByTag = new Map<string, Set<string>>();
  private readonly idsByCapability = new Map<string, Set<string>>();

  register<TRef>(input: EntityRegistration<TRef>): EntityRecord<TRef> {
    const existing = this.records.get(input.id);
    if (existing) this.removeAllIndexes(existing);

    const record: EntityRecord<TRef> = {
      id: input.id,
      kind: input.kind,
      ref: input.ref,
      x: input.x,
      y: input.y,
      worldId: input.worldId,
      tags: new Set(input.tags ?? []),
      capabilities: new Set(input.capabilities ?? []),
      bounds: input.bounds,
      meta: { ...(input.meta ?? {}) },
      update: input.update,
    };
    this.records.set(record.id, record);
    this.addAllIndexes(record);
    return record;
  }

  unregister(id: string): boolean {
    const existing = this.records.get(id);
    if (!existing) return false;
    this.removeAllIndexes(existing);
    return this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
    this.idsByKind.clear();
    this.idsByTag.clear();
    this.idsByCapability.clear();
  }

  findById<TRef = unknown>(id: string): TRef | null {
    return (this.records.get(id)?.ref as TRef | undefined) ?? null;
  }

  getRecord<TRef = unknown>(id: string): EntityRecord<TRef> | null {
    return (this.records.get(id) as EntityRecord<TRef> | undefined) ?? null;
  }

  queryByKind<TRef = unknown>(kind: EntityKind): TRef[] {
    return this.queryRecordsByKind<TRef>(kind).map((record) => record.ref);
  }

  queryRecordsByKind<TRef = unknown>(kind: EntityKind): Array<EntityRecord<TRef>> {
    return this.queryRecordsFromIds<TRef>(this.idsByKind.get(kind));
  }

  queryByTag<TRef = unknown>(tag: string): TRef[] {
    return this.queryRecordsByTag<TRef>(tag).map((record) => record.ref);
  }

  queryRecordsByTag<TRef = unknown>(tag: string): Array<EntityRecord<TRef>> {
    return this.queryRecordsFromIds<TRef>(this.idsByTag.get(tag));
  }

  queryByCapability<TRef = unknown>(capability: string): TRef[] {
    return this.queryRecordsByCapability<TRef>(capability).map((record) => record.ref);
  }

  queryRecordsByCapability<TRef = unknown>(capability: string): Array<EntityRecord<TRef>> {
    return this.queryRecordsFromIds<TRef>(this.idsByCapability.get(capability));
  }

  queryNear<TRef = unknown>(
    x: number,
    y: number,
    radius: number,
    predicate?: (record: EntityRecord) => boolean,
  ): Array<EntityRecord<TRef>> {
    const radiusSq = radius * radius;
    return this.query<TRef>((record) => {
      if (typeof record.x !== 'number' || typeof record.y !== 'number') return false;
      const dx = record.x - x;
      const dy = record.y - y;
      if (dx * dx + dy * dy > radiusSq) return false;
      return predicate ? predicate(record) : true;
    });
  }

  query<TRef = unknown>(predicate: (record: EntityRecord) => boolean): Array<EntityRecord<TRef>> {
    return [...this.records.values()]
      .filter(predicate)
      .map((record) => record as EntityRecord<TRef>);
  }

  update(id: string, patch: Partial<Omit<EntityRegistration, 'id' | 'kind' | 'ref'>>): void {
    const record = this.records.get(id);
    if (!record) return;
    if ('x' in patch) record.x = patch.x;
    if ('y' in patch) record.y = patch.y;
    if ('worldId' in patch) record.worldId = patch.worldId;
    if (patch.tags) {
      for (const tag of record.tags) this.removeStringIndex(this.idsByTag, tag, id);
      record.tags = new Set(patch.tags);
      for (const tag of record.tags) this.addStringIndex(this.idsByTag, tag, id);
    }
    if (patch.capabilities) {
      for (const capability of record.capabilities) this.removeStringIndex(this.idsByCapability, capability, id);
      record.capabilities = new Set(patch.capabilities);
      for (const capability of record.capabilities) this.addStringIndex(this.idsByCapability, capability, id);
    }
    if ('bounds' in patch) record.bounds = patch.bounds;
    if (patch.meta) record.meta = { ...record.meta, ...patch.meta };
    if (patch.update) record.update = patch.update;
  }

  updatePosition(id: string, x: number, y: number, worldId?: string): void {
    this.update(id, { x, y, worldId });
  }

  updateAll(context: EntityUpdateContext): void {
    for (const record of [...this.records.values()]) {
      record.update?.(context);
    }
  }

  private queryRecordsFromIds<TRef = unknown>(ids: Set<string> | undefined): Array<EntityRecord<TRef>> {
    if (!ids) return [];
    return [...ids]
      .map((id) => this.records.get(id) as EntityRecord<TRef> | undefined)
      .filter((record): record is EntityRecord<TRef> => Boolean(record));
  }

  private addAllIndexes(record: EntityRecord): void {
    this.addKindIndex(record.kind, record.id);
    for (const tag of record.tags) this.addStringIndex(this.idsByTag, tag, record.id);
    for (const capability of record.capabilities) {
      this.addStringIndex(this.idsByCapability, capability, record.id);
    }
  }

  private removeAllIndexes(record: EntityRecord): void {
    this.removeKindIndex(record.kind, record.id);
    for (const tag of record.tags) this.removeStringIndex(this.idsByTag, tag, record.id);
    for (const capability of record.capabilities) {
      this.removeStringIndex(this.idsByCapability, capability, record.id);
    }
  }

  private addKindIndex(kind: EntityKind, id: string): void {
    let ids = this.idsByKind.get(kind);
    if (!ids) {
      ids = new Set<string>();
      this.idsByKind.set(kind, ids);
    }
    ids.add(id);
  }

  private removeKindIndex(kind: EntityKind, id: string): void {
    const ids = this.idsByKind.get(kind);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) this.idsByKind.delete(kind);
  }

  private addStringIndex(index: Map<string, Set<string>>, key: string, id: string): void {
    let ids = index.get(key);
    if (!ids) {
      ids = new Set<string>();
      index.set(key, ids);
    }
    ids.add(id);
  }

  private removeStringIndex(index: Map<string, Set<string>>, key: string, id: string): void {
    const ids = index.get(key);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) index.delete(key);
  }
}
