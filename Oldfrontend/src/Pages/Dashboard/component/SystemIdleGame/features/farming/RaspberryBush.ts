/**
 * RaspberryBush entity — a world shrub that regrows berries over time.
 *
 * Sprite layout in Basic_Grass_Biom_things.png (source 16 px tiles):
 *   ripe  : col 0, row 3 → src x=0,  y=48, 16×16  (raspberry_bush_ripe)
 *   empty : col 1, row 3 → src x=16, y=48, 16×16  (raspberry_bush_empty)
 *
 * Mechanics:
 *   - Press F when ripe → spawns a 'raspberry' DropItem on the ground
 *   - Bush switches to 'empty' and regrows after GROW_GAME_MINUTES
 */

import Phaser from 'phaser';
import type { Interactable } from '../../types';
import { rectFromCenter } from '../collision';

// ─── Source regions (px in Basic_Grass_Biom_things.png) ──────────────────────
export type BushStage = 'ripe' | 'empty';

const SRC: Record<BushStage, [number, number, number, number]> = {
  ripe:  [0,  48, 16, 16],   // col 0, row 3 — raspberry_bush_ripe
  empty: [16, 48, 16, 16],   // col 1, row 3 — raspberry_bush_empty
};

const SCALE = 2;
const GROW_GAME_MINUTES = 450; // old 90 real seconds at 5 game-min/sec
const INTERACT_RADIUS = 56;    // px

// ─── RaspberryBush entity ─────────────────────────────────────────────────────
export class RaspberryBush implements Interactable {
  readonly id:     string;
  readonly worldX: number;
  readonly worldY: number;

  private scene:        Phaser.Scene;
  private sprite:       Phaser.GameObjects.Image;
  private stage:        BushStage;
  private ripeAtGameMinute: number | null = null;
  private spawnDrop:    (x: number, y: number, itemId: string) => void;
  private blockerId:    string | null = null;

  constructor(
    scene:         Phaser.Scene,
    x:             number,
    y:             number,
    id:            string,
    spawnDrop:     (x: number, y: number, itemId: string) => void,
    obstacles?:    Phaser.Physics.Arcade.StaticGroup,
    initialStage:  BushStage = 'ripe',
  ) {
    this.scene  = scene;
    this.worldX = x;
    this.worldY = y;
    this.id     = id;
    this.spawnDrop = spawnDrop;
    this.stage  = initialStage;

    this.ensureTextures();

    this.sprite = scene.add
      .image(x, y, 'bush-tex-ripe')
      .setOrigin(0.5, 1)
      .setDepth(y + 5);

    // Collision body — same footprint as the static decorative bush
    if (obstacles) {
      this.blockerId = `nature:${this.resolveWorldId()}:${id}:raspberry-bush`;
      (scene as any).collisionBlockers?.upsert?.({
        id: this.blockerId,
        worldId: this.resolveWorldId(),
        rects: [rectFromCenter(x, y - 4, 20, 12)],
        blocksPlayer: true,
        blocksNpcNav: true,
        debugLabel: 'raspberry bush',
        debugKind: 'nature',
      });
    }

    this.applyStage(initialStage);

    if (initialStage === 'empty') this.ripeAtGameMinute = this.nowGameMinute() + GROW_GAME_MINUTES;
  }

  // ── Canvas texture extraction ──────────────────────────────────────────────
  private ensureTextures(): void {
    const make = (key: string, sx: number, sy: number, sw: number, sh: number) => {
      if (this.scene.textures.exists(key)) return;
      const img = this.scene.textures.get('objects').getSourceImage() as HTMLImageElement;
      const cvs = document.createElement('canvas');
      cvs.width  = sw * SCALE;
      cvs.height = sh * SCALE;
      const ctx  = cvs.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * SCALE, sh * SCALE);
      this.scene.textures.addCanvas(key, cvs);
    };
    make('bush-tex-ripe',  ...SRC.ripe);
    make('bush-tex-empty', ...SRC.empty);
  }

  // ── Stage transitions ──────────────────────────────────────────────────────
  private applyStage(stage: BushStage): void {
    this.stage = stage;
    this.sprite
      .setTexture(stage === 'ripe' ? 'bush-tex-ripe' : 'bush-tex-empty')
      .setDepth(this.worldY + 5);
    if (this.blockerId) (this.scene as any).collisionBlockers?.setEnabled?.(this.blockerId, stage === 'ripe');
  }

  private startGrowTimer(): void {
    this.ripeAtGameMinute = this.nowGameMinute() + GROW_GAME_MINUTES;
  }

  private nowGameMinute(): number {
    return (this.scene as any).dayCycle?.absoluteGameMinutes ?? 0;
  }

  private refreshGrowth(): void {
    if (this.stage === 'empty' && this.ripeAtGameMinute !== null && this.nowGameMinute() >= this.ripeAtGameMinute) {
      this.ripeAtGameMinute = null;
      this.applyStage('ripe');
    }
  }

  // ── Interactable interface ─────────────────────────────────────────────────
  isNearPlayer(px: number, py: number, radius = INTERACT_RADIUS): boolean {
    const dx = px - this.worldX;
    const dy = py - this.worldY;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    this.refreshGrowth();
    if (this.stage !== 'ripe') return;
    this.harvest();
  }

  update(): void {
    this.refreshGrowth();
  }

  // ── Harvest ───────────────────────────────────────────────────────────────
  private harvest(): void {
    // Spawn drop item just in front of the bush base.
    this.spawnDrop(this.worldX, this.worldY - 8, 'raspberry');

    // Floating berry icon rises and fades as visual feedback
    const icon = this.scene.add
      .image(this.worldX, this.worldY - 20, 'drop-raspberry')
      .setDisplaySize(16, 16)
      .setDepth(9999);
    this.scene.tweens.add({
      targets:  icon,
      y:        this.worldY - 56,
      alpha:    0,
      duration: 700,
      ease:     'Cubic.Out',
      onComplete: () => icon.destroy(),
    });

    // Bush goes dormant and regrows
    this.applyStage('empty');
    this.startGrowTimer();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  destroy(): void {
    if (this.blockerId) (this.scene as any).collisionBlockers?.remove?.(this.blockerId);
    this.blockerId = null;
    this.sprite.destroy();
  }

  private resolveWorldId(): string {
    return (this.scene as any).getWorldIdAt?.(this.worldX, this.worldY)
      ?? (this.scene as any).mapRuntimeManager?.getActiveWorldId?.()
      ?? (this.scene as any).currentMapDefinition?.ref?.worldId
      ?? 'world:main';
  }
}
