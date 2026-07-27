import Phaser from 'phaser';
import type { Interactable } from '../../types';
import type { TreeSaveState } from '../../../../../../Types/Profile';
import { rectFromCenter } from '../collision';
import type { TreeGrowthStage, TreeState } from '../../shared/worldStateTypes';

const SRC: Record<string, [number, number, number, number]> = {
  A: [0, 0, 16, 32],
  B: [16, 0, 32, 32],
  C: [48, 0, 32, 32],
  chopA: [48, 32, 16, 16],
  chopBC: [64, 32, 16, 16],
  fruit: [32, 32, 16, 16],
};

const SCALE = 2;
const TREE_INTERACT_RADIUS = 72;
const TREE_DEPTH_OFFSET = 110;

interface TreeViewCallbacks {
  getState: (id: string) => TreeState | null;
  onInteract: (id: string) => void;
  onChop: (id: string) => void;
}

/**
 * Phaser view for tree state. Growth/fruit/chop state lives in WorldState.
 */
export class TreeView implements Interactable {
  readonly id: string;
  readonly worldX: number;
  readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly callbacks: TreeViewCallbacks;
  private readonly blockerId: string | null = null;
  private displayStage: TreeGrowthStage = 'A';

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    id: string,
    callbacks: TreeViewCallbacks,
    obstacles?: Phaser.Physics.Arcade.StaticGroup,
  ) {
    this.scene = scene;
    this.id = id;
    this.worldX = x;
    this.worldY = y;
    this.callbacks = callbacks;

    this.ensureTextures();
    this.sprite = scene.add
      .image(x, y, 'tree-tex-A')
      .setOrigin(0.5, 1)
      .setDepth(y + TREE_DEPTH_OFFSET);

    if (obstacles) {
      this.blockerId = `nature:${this.resolveWorldId()}:${id}:tree`;
      (scene as any).collisionBlockers?.upsert?.({
        id: this.blockerId,
        worldId: this.resolveWorldId(),
        rects: [rectFromCenter(x, y - 8, 28, 16)],
        blocksPlayer: true,
        blocksNpcNav: true,
        debugLabel: 'tree',
        debugKind: 'nature',
      });
    }
  }

  isNearPlayer(px: number, py: number, radius = TREE_INTERACT_RADIUS): boolean {
    const dx = px - this.worldX;
    const dy = py - this.worldY;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    this.callbacks.onInteract(this.id);
  }

  chop(): void {
    this.callbacks.onChop(this.id);
  }

  isChopped(): boolean {
    return this.callbacks.getState(this.id)?.isChopped ?? false;
  }

  getShadowTextureKey(): string | null {
    if (this.isChopped()) return null;
    const textureKey: Record<TreeGrowthStage, string | null> = {
      A: 'tree-tex-A',
      B: 'tree-tex-B',
      C: 'tree-tex-C',
      chopA: null,
      chopBC: null,
    };
    return textureKey[this.displayStage] ?? 'tree-tex-A';
  }

  getState(): TreeSaveState {
    const state = this.callbacks.getState(this.id);
    return {
      id: this.id,
      stage: state?.stage ?? this.displayStage,
      hasFruit: state?.hasFruit ?? false,
    };
  }

  syncFromState(state: TreeState): void {
    this.displayStage = state.stage;
    const textureKey: Record<TreeGrowthStage, string> = {
      A: 'tree-tex-A',
      B: 'tree-tex-B',
      C: 'tree-tex-C',
      chopA: 'tree-tex-chopA',
      chopBC: 'tree-tex-chopBC',
    };
    this.sprite.setTexture(textureKey[state.stage]).setDepth(this.worldY + TREE_DEPTH_OFFSET);
  }

  playFruitHarvestEffect(): void {
    const icon = this.scene.add
      .image(this.worldX, this.worldY - 40, 'tree-tex-fruit')
      .setDepth(9999);
    this.scene.tweens.add({
      targets: icon,
      y: this.worldY - 90,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.Out',
      onComplete: () => icon.destroy(),
    });
  }

  highlight(): void {
    const g = this.scene.add.graphics().setDepth(this.worldY + 20);
    g.lineStyle(2, 0x44ff88, 1);
    g.strokeCircle(this.worldX, this.worldY - 20, 30);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 700,
      onComplete: () => g.destroy(),
    });
  }

  playChopParticles(): void {
    for (let i = 0; i < 5; i++) {
      const p = this.scene.add.graphics().setDepth(this.worldY + 25);
      p.fillStyle(0x44aa22, 1);
      p.fillRect(-3, -3, 6, 6);
      p.x = this.worldX + Phaser.Math.Between(-10, 10);
      p.y = this.worldY - 20;
      this.scene.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(-20, 20),
        y: p.y + Phaser.Math.Between(-30, 10),
        alpha: 0,
        duration: 500 + Phaser.Math.Between(0, 300),
        onComplete: () => p.destroy(),
      });
    }
  }

  destroy(): void {
    if (this.blockerId) (this.scene as any).collisionBlockers?.remove?.(this.blockerId);
    this.sprite.destroy();
  }

  private resolveWorldId(): string {
    return (this.scene as any).getWorldIdAt?.(this.worldX, this.worldY)
      ?? (this.scene as any).mapRuntimeManager?.getActiveWorldId?.()
      ?? (this.scene as any).currentMapDefinition?.ref?.worldId
      ?? 'world:main';
  }

  private ensureTextures(): void {
    const make = (key: string, sx: number, sy: number, sw: number, sh: number) => {
      if (this.scene.textures.exists(key)) return;
      const img = this.scene.textures.get('objects').getSourceImage() as HTMLImageElement;
      const cvs = document.createElement('canvas');
      cvs.width = sw * SCALE;
      cvs.height = sh * SCALE;
      const ctx = cvs.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * SCALE, sh * SCALE);
      this.scene.textures.addCanvas(key, cvs);
    };

    make('tree-tex-A', ...SRC.A);
    make('tree-tex-B', ...SRC.B);
    make('tree-tex-C', ...SRC.C);
    make('tree-tex-chopA', ...SRC.chopA);
    make('tree-tex-chopBC', ...SRC.chopBC);
    make('tree-tex-fruit', ...SRC.fruit);
  }
}
