import Phaser from 'phaser';
import type { WorldGrid } from '../../shared/WorldGrid';
import { rectCells } from './CollisionBlockerGeometry';
import {
  getCollisionBlockerDebugColor,
  CollisionBlockerDebugOverlay,
} from './CollisionBlockerDebugOverlay';
import type {
  CollisionBlockerEntry,
  CollisionBlockerNavEdge,
  CollisionBlockerSnapshot,
} from './CollisionBlockerTypes';

type GridResolver = (worldId: string) => WorldGrid | null | undefined;
type ActiveWorldResolver = () => string | null | undefined;

interface StoredBlocker {
  entry: CollisionBlockerEntry;
  bodies: Phaser.Physics.Arcade.Image[];
  enabled: boolean;
  navCells: string[];
  navEdges: string[];
}

export class CollisionBlockerRuntime {
  private readonly entries = new Map<string, StoredBlocker>();
  private readonly navCellCounts = new Map<string, number>();
  private readonly navEdgeCounts = new Map<string, number>();
  private readonly debugOverlay: CollisionBlockerDebugOverlay;
  private debugEnabled = false;
  private lastActiveWorldId: string | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly obstacles: Phaser.Physics.Arcade.StaticGroup,
    private readonly getWorldGrid: GridResolver,
    private readonly getActiveWorldId: ActiveWorldResolver,
  ) {
    this.debugOverlay = new CollisionBlockerDebugOverlay(scene);
  }

  upsert(entry: CollisionBlockerEntry): void {
    const normalized: CollisionBlockerEntry = {
      ...entry,
      rects: entry.rects.filter((rect) => rect.w > 0 && rect.h > 0),
      navEdges: entry.navEdges?.filter(Boolean) ?? [],
    };
    this.remove(entry.id);
    const stored: StoredBlocker = {
      entry: normalized,
      bodies: normalized.blocksPlayer ? this.createBodies(normalized) : [],
      enabled: true,
      navCells: [],
      navEdges: [],
    };
    this.entries.set(normalized.id, stored);
    this.addNavigation(stored);
    this.syncActiveWorld();
    this.refreshDebug();
  }

  remove(id: string): void {
    const stored = this.entries.get(id);
    if (!stored) return;
    this.removeNavigation(stored);
    for (const body of stored.bodies) body.destroy();
    this.entries.delete(id);
    this.refreshDebug();
  }

  removeByPrefix(prefix: string): void {
    for (const id of [...this.entries.keys()]) {
      if (id.startsWith(prefix)) this.remove(id);
    }
  }

  setEnabled(id: string, enabled: boolean): void {
    const stored = this.entries.get(id);
    if (!stored || stored.enabled === enabled) return;
    stored.enabled = enabled;
    for (const image of stored.bodies) {
      image.setActive(enabled);
      const body = image.body as Phaser.Physics.Arcade.StaticBody | null;
      if (body) {
        body.enable = enabled;
        body.debugShowBody = enabled && this.debugEnabled;
      }
    }
    if (enabled) this.addNavigation(stored);
    else this.removeNavigation(stored);
    this.refreshDebug();
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    for (const stored of this.entries.values()) {
      this.applyBodyDebug(stored);
    }
    this.debugOverlay.setEnabled(enabled, this.snapshot(), this.resolveActiveWorldId() ?? undefined);
  }

  update(): void {
    this.syncActiveWorld();
    if (this.debugEnabled) this.refreshDebug();
  }

  destroy(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
    this.debugOverlay.destroy();
  }

  snapshot(): CollisionBlockerSnapshot[] {
    return [...this.entries.values()].map((stored) => ({
      ...stored.entry,
      enabled: stored.enabled,
    }));
  }

  private createBodies(entry: CollisionBlockerEntry): Phaser.Physics.Arcade.Image[] {
    return entry.rects.map((rect, index) => {
      const image = this.obstacles.create(rect.cx, rect.cy, '__WHITE') as Phaser.Physics.Arcade.Image;
      image.setVisible(false);
      image.setName(`${entry.id}:body:${index}`);
      image.setData('collisionBlockerId', entry.id);
      image.setData('collisionBlockerLabel', entry.debugLabel);
      image.setData('collisionBlockerWorldId', entry.worldId);
      const body = image.body as Phaser.Physics.Arcade.StaticBody;
      this.scene.physics.world.remove(body);
      body.setSize(rect.w, rect.h, true);
      body.reset(rect.cx, rect.cy);
      this.scene.physics.world.add(body);
      return image;
    });
  }

  private addNavigation(stored: StoredBlocker): void {
    if (!stored.entry.blocksNpcNav) return;
    stored.navCells = [];
    stored.navEdges = [];
    for (const rect of stored.entry.rects) {
      for (const cell of rectCells(rect)) {
        const key = this.navCellKey(stored.entry.worldId, cell.col, cell.row);
        this.incrementNavCell(key);
        stored.navCells.push(key);
      }
    }
    for (const edge of stored.entry.navEdges ?? []) {
      const key = this.navEdgeKey(stored.entry.worldId, edge);
      this.incrementNavEdge(key);
      stored.navEdges.push(key);
    }
  }

  private removeNavigation(stored: StoredBlocker): void {
    for (const key of stored.navCells) this.decrementNavCell(key);
    for (const key of stored.navEdges) this.decrementNavEdge(key);
    stored.navCells = [];
    stored.navEdges = [];
  }

  private incrementNavCell(key: string): void {
    const next = (this.navCellCounts.get(key) ?? 0) + 1;
    this.navCellCounts.set(key, next);
    if (next === 1) this.applyNavCell(key, true);
  }

  private decrementNavCell(key: string): void {
    const next = (this.navCellCounts.get(key) ?? 0) - 1;
    if (next > 0) {
      this.navCellCounts.set(key, next);
      return;
    }
    this.navCellCounts.delete(key);
    this.applyNavCell(key, false);
  }

  private incrementNavEdge(key: string): void {
    const next = (this.navEdgeCounts.get(key) ?? 0) + 1;
    this.navEdgeCounts.set(key, next);
    if (next === 1) this.applyNavEdge(key, true);
  }

  private decrementNavEdge(key: string): void {
    const next = (this.navEdgeCounts.get(key) ?? 0) - 1;
    if (next > 0) {
      this.navEdgeCounts.set(key, next);
      return;
    }
    this.navEdgeCounts.delete(key);
    this.applyNavEdge(key, false);
  }

  private applyNavCell(key: string, blocked: boolean): void {
    const parsed = this.parseNavCellKey(key);
    this.getWorldGrid(parsed.worldId)?.setNavigationBlock(parsed.col, parsed.row, blocked);
  }

  private applyNavEdge(key: string, blocked: boolean): void {
    const parsed = this.parseNavEdgeKey(key);
    this.getWorldGrid(parsed.worldId)?.setNavigationEdgeBlock(parsed.col, parsed.row, parsed.edge, blocked);
  }

  private syncActiveWorld(): void {
    const activeWorldId = this.resolveActiveWorldId();
    if (activeWorldId === this.lastActiveWorldId) return;
    this.lastActiveWorldId = activeWorldId;
    for (const stored of this.entries.values()) {
      const enabled = stored.enabled && (!activeWorldId || stored.entry.worldId === activeWorldId);
      for (const image of stored.bodies) {
        const body = image.body as Phaser.Physics.Arcade.StaticBody | null;
        if (body) body.enable = enabled;
      }
      this.applyBodyDebug(stored);
    }
    this.refreshDebug();
  }

  private applyBodyDebug(stored: StoredBlocker): void {
    const color = getCollisionBlockerDebugColor({ ...stored.entry, enabled: stored.enabled });
    for (const image of stored.bodies) {
      const body = image.body as Phaser.Physics.Arcade.StaticBody | null;
      if (!body) continue;
      body.debugShowBody = this.debugEnabled && stored.enabled && body.enable;
      body.debugBodyColor = color;
    }
  }

  private refreshDebug(): void {
    if (!this.debugEnabled) return;
    this.debugOverlay.render(this.snapshot(), this.resolveActiveWorldId() ?? undefined);
  }

  private resolveActiveWorldId(): string | null {
    return this.getActiveWorldId?.() ?? null;
  }

  private navCellKey(worldId: string, col: number, row: number): string {
    return `${worldId}:${col}:${row}`;
  }

  private parseNavCellKey(key: string): { worldId: string; col: number; row: number } {
    const parts = key.split(':');
    const row = Number(parts.pop());
    const col = Number(parts.pop());
    return { worldId: parts.join(':'), col, row };
  }

  private navEdgeKey(worldId: string, edge: CollisionBlockerNavEdge): string {
    return `${worldId}:${edge.col}:${edge.row}:${edge.edge}`;
  }

  private parseNavEdgeKey(key: string): { worldId: string; col: number; row: number; edge: CollisionBlockerNavEdge['edge'] } {
    const parts = key.split(':');
    const edge = Number(parts.pop()) as CollisionBlockerNavEdge['edge'];
    const row = Number(parts.pop());
    const col = Number(parts.pop());
    return { worldId: parts.join(':'), col, row, edge };
  }
}
