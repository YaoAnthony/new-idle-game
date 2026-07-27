/**
 * House — configurable tiled wooden house with door proximity animation.
 *
 * Supports two presets out of the box:
 *   • Standard  (10 cols × 6 rows, door at col 3) — player's cosy home
 *   • Manor     (14 cols × 8 rows, door at col 6) — mayor's grand manor
 *
 * The layout is generated procedurally from cols/rows/doorCol/chimneys so any
 * size works.  An optional `tint` lets each house have a distinct colour.
 *
 * Depth rules (same as before):
 *   row 0  (roof)         → 600     — always above player
 *   rows 1-(ROWS-2) (walls) → wy+10  — Y-sorted
 *   row ROWS-1 (floor)    → -9      — ground level
 */

import Phaser from 'phaser';
import { OBJ_SCALE } from '../constants';
import { rectFromCenter } from '../features/collision';

const T = 16 * OBJ_SCALE; // 32 px per displayed tile

// ── Tile key → [srcX, srcY] in Wooden House.png (each cell 16×16 px) ────────
const SRC: Record<string, [number, number]> = {
  B: [16,  0],   // chimney
  D: [48,  0],   // door open
  H: [ 0, 16],   // roof-left
  I: [16, 16],   // roof-mid
  J: [32, 16],   // roof-right
  K: [48, 16],   // door closed
  O: [ 0, 32],   // wall-left
  P: [16, 32],   // wall-mid
  Q: [32, 32],   // wall-right
  R: [48, 32],   // door half-open
  V: [ 0, 48],   // floor-left
  W: [16, 48],   // floor-mid
  X: [32, 48],   // floor-right
  Y: [48, 48],   // door ajar
};

const DOOR_DIST = 120; // px — proximity that triggers the door

export interface HouseOptions {
  /** Total tile columns.  Default 10. */
  cols?: number;
  /** Total tile rows (roof + wall rows + floor).  Default 6. */
  rows?: number;
  /** Column index (0-based) for the door.  Default 3. */
  doorCol?: number;
  /** Columns that get a chimney tile in the roof row.  Default [4]. */
  chimneys?: number[];
  /**
   * Phaser tint applied to every tile except the animated door.
   * Omit (or use 0xffffff) for the default warm-wood look.
   */
  tint?: number;
}

export class House {
  private scene:         Phaser.Scene;
  readonly houseX:       number;
  readonly houseY:       number;
  private doorSprite!:   Phaser.GameObjects.Image;
  private doorColliderId = '';
  private doorOpen      = false;
  private doorAnimating = false;

  // ── Resolved configuration ────────────────────────────────────────────────
  private readonly COLS:     number;
  private readonly ROWS:     number;
  private readonly DOOR_COL: number;
  private readonly DOOR_ROW: number;   // always the last row
  private readonly CHIMNEYS: number[];
  private readonly TINT:     number | undefined;

  constructor(
    scene:     Phaser.Scene,
    houseX:    number,
    houseY:    number,
    obstacles: Phaser.Physics.Arcade.StaticGroup,
    options:   HouseOptions = {},
  ) {
    this.scene  = scene;
    this.houseX = houseX;
    this.houseY = houseY;

    this.COLS     = options.cols     ?? 10;
    this.ROWS     = options.rows     ?? 6;
    this.DOOR_COL = options.doorCol  ?? 3;
    this.DOOR_ROW = this.ROWS - 1;           // floor is always the bottom row
    this.CHIMNEYS = options.chimneys ?? [4];
    this.TINT     = options.tint;

    this.extractTextures();
    this.placeTiles();
    this.buildWalls(obstacles);
  }

  // ── Generate the layout grid from configuration ───────────────────────────
  private buildLayout(): string[][] {
    const { COLS, ROWS, DOOR_COL, DOOR_ROW, CHIMNEYS } = this;
    return Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: COLS }, (_, col) => {
        if (row === 0) {
          // Roof row
          if (col === 0)                   return 'H';
          if (col === COLS - 1)            return 'J';
          if (CHIMNEYS.includes(col))      return 'B';
          return 'I';
        }
        if (row === DOOR_ROW) {
          // Floor row
          if (col === 0)          return 'V';
          if (col === COLS - 1)   return 'X';
          if (col === DOOR_COL)   return 'K'; // door closed on spawn
          return 'W';
        }
        // Wall rows
        if (col === 0)          return 'O';
        if (col === COLS - 1)   return 'Q';
        return 'P';
      })
    );
  }

  // ── Extract each tile key into a standalone T×T canvas texture ───────────
  private extractTextures(): void {
    const src = this.scene.textures.get('house').getSourceImage() as HTMLImageElement;
    for (const [key, [sx, sy]] of Object.entries(SRC)) {
      const k = `house-tile-${key}`;
      if (this.scene.textures.exists(k)) continue;
      const cvs = document.createElement('canvas');
      cvs.width = T; cvs.height = T;
      cvs.getContext('2d')!.drawImage(src, sx, sy, 16, 16, 0, 0, T, T);
      this.scene.textures.addCanvas(k, cvs);
    }
  }

  // ── Place all visual tiles ────────────────────────────────────────────────
  private placeTiles(): void {
    const { scene, houseX, houseY, COLS, ROWS, DOOR_ROW, DOOR_COL, TINT } = this;
    const layout = this.buildLayout();

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const wx    = houseX + col * T;
        const wy    = houseY + row * T;
        const depth = row === 0        ? 600       // roof — always on top
                    : row < ROWS - 1   ? wy + 10   // walls — Y-sorted
                    :                   -9;          // floor — ground layer
        const tKey = layout[row][col];

        if (row === DOOR_ROW && col === DOOR_COL) {
          // The door sprite is kept separately so it can animate
          this.doorSprite = scene.add.image(wx, wy, 'house-tile-K')
            .setOrigin(0, 0).setDepth(depth);
          continue;
        }

        const img = scene.add.image(wx, wy, `house-tile-${tKey}`)
          .setOrigin(0, 0).setDepth(depth);
        if (TINT !== undefined) img.setTint(TINT);
      }
    }
  }

  // ── Collision walls — full perimeter, interior walkable ───────────────────
  private buildWalls(_obstacles: Phaser.Physics.Arcade.StaticGroup): void {
    const { houseX: hx, houseY: hy, COLS, ROWS, DOOR_COL, DOOR_ROW } = this;

    // Top wall (spans inner width, 1 tile tall)
    const innerLeft  = hx + T;
    const innerRight = hx + COLS * T - T;
    this.registerWallBlocker('top',
      (innerLeft + innerRight) / 2, hy + T / 2,
      innerRight - innerLeft, T,
    );

    // Left wall (full height)
    this.registerWallBlocker('left',
      hx + T * 3 / 4, hy + ROWS * T / 2, T / 2, ROWS * T);

    // Right wall (full height)
    this.registerWallBlocker('right',
      hx + COLS * T - T * 3 / 4, hy + ROWS * T / 2, T / 2, ROWS * T);

    // Bottom-left of door: cols 1 … DOOR_COL-1
    const leftCols = DOOR_COL - 1;
    if (leftCols > 0) {
      this.registerWallBlocker('bottom-left',
        hx + T + (leftCols * T) / 2,
        hy + DOOR_ROW * T + T / 2,
        leftCols * T, T,
      );
    }

    // Bottom-right of door: cols DOOR_COL+1 … COLS-2
    const rightCols = COLS - DOOR_COL - 2;
    if (rightCols > 0) {
      this.registerWallBlocker('bottom-right',
        hx + (DOOR_COL + 1) * T + (rightCols * T) / 2,
        hy + DOOR_ROW * T + T / 2,
        rightCols * T, T,
      );
    }

    // Door collision tile (toggleable — tagged so Pathfinder always treats it passable)
    this.doorColliderId = this.registerWallBlocker(
      'door',
      hx + DOOR_COL * T + T / 2,
      hy + DOOR_ROW * T + T / 2,
      T, T,
    );
  }

  private registerWallBlocker(
    localId: string,
    cx: number, cy: number, w: number, h: number,
  ): string {
    const id = `legacy-house:${this.houseX}:${this.houseY}:${localId}`;
    (this.scene as any).collisionBlockers?.upsert?.({
      id,
      worldId: (this.scene as any).mapRuntimeManager?.getActiveWorldId?.()
        ?? (this.scene as any).currentMapDefinition?.ref?.worldId
        ?? 'world:main',
      rects: [rectFromCenter(cx, cy, w, h)],
      blocksPlayer: true,
      blocksNpcNav: true,
      debugLabel: `house ${localId}`,
      debugKind: 'building',
    });
    return id;
  }

  // ── Called every frame ────────────────────────────────────────────────────
  /** npcX/npcY optional — door also opens when an NPC approaches. */
  update(
    playerX: number,
    playerY: number,
    npcX?: number,
    npcY?: number,
    extraActors: Array<{ x: number; y: number }> = [],
  ): void {
    const doorWX = this.houseX + this.DOOR_COL * T + T / 2;
    const doorWY = this.houseY + this.DOOR_ROW * T + T / 2;
    const pdx = playerX - doorWX, pdy = playerY - doorWY;
    const playerNear = pdx * pdx + pdy * pdy < DOOR_DIST * DOOR_DIST;
    const npcNear    = npcX !== undefined && npcY !== undefined
      ? (npcX - doorWX) ** 2 + (npcY - doorWY) ** 2 < DOOR_DIST * DOOR_DIST
      : false;
    const otherNpcNear = extraActors.some((actor) =>
      (actor.x - doorWX) ** 2 + (actor.y - doorWY) ** 2 < DOOR_DIST * DOOR_DIST
    );
    const near = playerNear || npcNear || otherNpcNear;

    if ( near && !this.doorOpen && !this.doorAnimating) this.animateDoor(['K','Y','R','D'], true);
    if (!near &&  this.doorOpen && !this.doorAnimating) this.animateDoor(['D','R','Y','K'], false);
  }

  private animateDoor(frames: string[], opening: boolean): void {
    this.doorAnimating = true;
    let i = 0;
    const pulse = () => {
      if (i < frames.length) {
        this.doorSprite.setTexture(`house-tile-${frames[i++]}`);
        this.scene.time.delayedCall(100, pulse);
      } else {
        this.doorOpen      = opening;
        this.doorAnimating = false;
        (this.scene as any).collisionBlockers?.setEnabled?.(this.doorColliderId, !opening);
      }
    };
    pulse();
  }
}
