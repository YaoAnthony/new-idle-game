/**
 * SpatialIndex — grid-bucket O(1)-amortised spatial queries.
 *
 * Divides the world into fixed-size buckets. Insert/remove/move are O(1).
 * queryRadius scans only the buckets that overlap the query circle,
 * avoiding the O(n) full-list scan used by PerceptionSystem and ActionExecutor.
 *
 * Usage:
 *   const idx = new SpatialIndex(worldW, worldH);
 *   idx.insert({ id: 'tree-1', wx: 96, wy: 160, ref: treeObj });
 *   const nearby = idx.queryRadius(playerX, playerY, 350);
 */

export interface SpatialEntry {
  id:  string;
  wx:  number;
  wy:  number;
  ref: unknown;
}

export class SpatialIndex {
  private readonly bucketW:  number;
  private readonly bucketH:  number;
  private readonly cols:     number;
  private readonly rows:     number;
  private readonly buckets:  Map<number, SpatialEntry[]>;
  /** Fast lookup: entry id → current bucket key (for O(1) remove/move) */
  private readonly idToBucket = new Map<string, number>();

  constructor(
    worldW:     number,
    worldH:     number,
    bucketSize: number = 64,
  ) {
    this.bucketW = bucketSize;
    this.bucketH = bucketSize;
    this.cols    = Math.ceil(worldW / bucketSize);
    this.rows    = Math.ceil(worldH / bucketSize);
    this.buckets = new Map();
  }

  // ── Bucket key helpers ────────────────────────────────────────────────────

  private cellOf(wx: number, wy: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(wx / this.bucketW)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(wy / this.bucketH)));
    return r * this.cols + c;
  }

  private getOrCreate(key: number): SpatialEntry[] {
    let b = this.buckets.get(key);
    if (!b) { b = []; this.buckets.set(key, b); }
    return b;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  insert(entry: SpatialEntry): void {
    const key = this.cellOf(entry.wx, entry.wy);
    this.getOrCreate(key).push(entry);
    this.idToBucket.set(entry.id, key);
  }

  remove(id: string, wx: number, wy: number): void {
    const key = this.idToBucket.get(id) ?? this.cellOf(wx, wy);
    const bucket = this.buckets.get(key);
    if (bucket) {
      const i = bucket.findIndex(e => e.id === id);
      if (i !== -1) bucket.splice(i, 1);
    }
    this.idToBucket.delete(id);
  }

  move(id: string, prevWx: number, prevWy: number, newWx: number, newWy: number, ref: unknown): void {
    this.remove(id, prevWx, prevWy);
    this.insert({ id, wx: newWx, wy: newWy, ref });
  }

  /** Return all entries whose (wx,wy) is within `radius` of (cx,cy). */
  queryRadius(cx: number, cy: number, radius: number): SpatialEntry[] {
    const r2 = radius * radius;

    // Expand to bucket coordinates
    const c0 = Math.max(0, Math.floor((cx - radius) / this.bucketW));
    const c1 = Math.min(this.cols - 1, Math.floor((cx + radius) / this.bucketW));
    const r0 = Math.max(0, Math.floor((cy - radius) / this.bucketH));
    const r1 = Math.min(this.rows - 1, Math.floor((cy + radius) / this.bucketH));

    const results: SpatialEntry[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const bucket = this.buckets.get(r * this.cols + c);
        if (!bucket) continue;
        for (const e of bucket) {
          const dx = e.wx - cx, dy = e.wy - cy;
          if (dx * dx + dy * dy <= r2) results.push(e);
        }
      }
    }
    return results;
  }

  /** Return all entries across all buckets (use sparingly). */
  queryAll(): SpatialEntry[] {
    const results: SpatialEntry[] = [];
    for (const bucket of this.buckets.values()) {
      for (const e of bucket) results.push(e);
    }
    return results;
  }

  clear(): void {
    this.buckets.clear();
    this.idToBucket.clear();
  }
}
