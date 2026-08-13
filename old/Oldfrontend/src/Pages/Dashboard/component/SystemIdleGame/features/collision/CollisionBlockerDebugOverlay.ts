import Phaser from 'phaser';
import type { CollisionBlockerDebugKind, CollisionBlockerSnapshot } from './CollisionBlockerTypes';
import { NavigationEdge } from '../../shared/WorldGrid';
import { T } from '../../world/utils';

export const COLLISION_BLOCKER_DEBUG_COLORS: Record<CollisionBlockerDebugKind, number> = {
  terrain: 0xff3333,
  building: 0xff6fb1,
  furniture: 0xff9bd2,
  nature: 0x33cc66,
  vehicle: 0x9b5cff,
  system: 0xa78bfa,
  'npc-nav-only': 0x00d9ff,
  'nav-edge': 0xffa500,
};

export function getCollisionBlockerDebugColor(entry: CollisionBlockerSnapshot): number {
  if (entry.navEdges?.length && !entry.rects.length) return COLLISION_BLOCKER_DEBUG_COLORS['nav-edge'];
  if (!entry.blocksPlayer && entry.blocksNpcNav) return COLLISION_BLOCKER_DEBUG_COLORS['npc-nav-only'];
  return COLLISION_BLOCKER_DEBUG_COLORS[entry.debugKind ?? 'system'];
}

export class CollisionBlockerDebugOverlay {
  private graphics: Phaser.GameObjects.Graphics | null = null;
  private labels: Phaser.GameObjects.Text[] = [];
  private enabled = false;

  constructor(private readonly scene: Phaser.Scene) {}

  setEnabled(enabled: boolean, entries: readonly CollisionBlockerSnapshot[] = [], activeWorldId?: string): void {
    this.enabled = enabled;
    this.render(entries, activeWorldId);
  }

  render(entries: readonly CollisionBlockerSnapshot[], activeWorldId?: string): void {
    if (!this.enabled) {
      this.clear();
      return;
    }
    const graphics = this.ensureGraphics();
    graphics.clear();
    this.clearLabels();

    for (const entry of entries) {
      if (!entry.enabled) continue;
      if (activeWorldId && entry.worldId !== activeWorldId) continue;
      const color = getCollisionBlockerDebugColor(entry);
      graphics.lineStyle(2, color, 0.95);
      graphics.fillStyle(color, 0.08);
      for (const rect of entry.rects) {
        const x = rect.cx - rect.w / 2;
        const y = rect.cy - rect.h / 2;
        graphics.fillRect(x, y, rect.w, rect.h);
        graphics.strokeRect(x, y, rect.w, rect.h);
      }
      for (const navEdge of entry.navEdges ?? []) {
        this.strokeNavEdge(graphics, navEdge.col, navEdge.row, navEdge.edge, color);
      }
      if (entry.debugKind !== 'terrain' && entry.rects.length > 0) {
        const first = entry.rects[0];
        this.labels.push(this.scene.add.text(first.cx, first.cy - first.h / 2 - 8, entry.debugLabel, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#ffffff',
          backgroundColor: '#00000099',
          padding: { x: 3, y: 1 },
        }).setOrigin(0.5, 1).setDepth(9998).setScrollFactor(1));
      }
    }
  }

  destroy(): void {
    this.clear();
    this.graphics?.destroy();
    this.graphics = null;
  }

  private ensureGraphics(): Phaser.GameObjects.Graphics {
    if (!this.graphics || !this.graphics.active) {
      this.graphics = this.scene.add.graphics().setDepth(9997);
    }
    this.graphics.setVisible(true);
    return this.graphics;
  }

  private clear(): void {
    this.graphics?.clear();
    this.graphics?.setVisible(false);
    this.clearLabels();
  }

  private clearLabels(): void {
    for (const label of this.labels) label.destroy();
    this.labels.length = 0;
  }

  private strokeNavEdge(
    graphics: Phaser.GameObjects.Graphics,
    col: number,
    row: number,
    edge: number,
    color: number,
  ): void {
    const x = col * T;
    const y = row * T;
    graphics.lineStyle(3, color, 0.95);
    switch (edge) {
      case NavigationEdge.NORTH:
        graphics.lineBetween(x, y, x + T, y);
        break;
      case NavigationEdge.EAST:
        graphics.lineBetween(x + T, y, x + T, y + T);
        break;
      case NavigationEdge.SOUTH:
        graphics.lineBetween(x, y + T, x + T, y + T);
        break;
      case NavigationEdge.WEST:
      default:
        graphics.lineBetween(x, y, x, y + T);
        break;
    }
  }
}
