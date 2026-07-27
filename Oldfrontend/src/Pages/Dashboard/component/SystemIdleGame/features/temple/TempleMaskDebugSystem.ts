import Phaser from 'phaser';
import { normalizeWorldId as normalizeCoreWorldId } from '@timeplan-game/core/game/worldIds';
import { getTempleMaskDebugRect } from './TempleMaskRuntime';

const MASK_DEBUG_DEPTH = 9997;

export class TempleMaskDebugSystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private enabled = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics()
      .setDepth(MASK_DEBUG_DEPTH)
      .setScrollFactor(1)
      .setVisible(false);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.graphics.setVisible(enabled);
    if (!enabled) this.graphics.clear();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(): void {
    if (!this.enabled) return;
    this.graphics.clear();

    const rect = getTempleMaskDebugRect(this.scene as any);
    const activeWorldId = normalizeWorldId((this.scene as any).mapRuntimeManager?.getActiveWorldId?.()
      ?? (this.scene as any).currentMapDefinition?.ref?.worldId);
    if (!rect || normalizeWorldId(rect.centerWorldId) !== activeWorldId) return;

    this.graphics.fillStyle(0x020716, 0.2);
    this.graphics.fillRect(rect.left, rect.top, rect.width, rect.height);

    this.graphics.lineStyle(3, 0xffd166, 0.98);
    this.graphics.strokeRect(rect.left, rect.top, rect.width, rect.height);

    this.graphics.lineStyle(1, 0xffd166, 0.26);
    for (let x = rect.left + rect.tileWidth; x < rect.left + rect.width; x += rect.tileWidth) {
      this.graphics.beginPath();
      this.graphics.moveTo(x, rect.top);
      this.graphics.lineTo(x, rect.top + rect.height);
      this.graphics.strokePath();
    }
    for (let y = rect.top + rect.tileHeight; y < rect.top + rect.height; y += rect.tileHeight) {
      this.graphics.beginPath();
      this.graphics.moveTo(rect.left, y);
      this.graphics.lineTo(rect.left + rect.width, y);
      this.graphics.strokePath();
    }

  }

  destroy(): void {
    this.graphics.destroy();
  }
}

function normalizeWorldId(worldId: string | undefined | null): string {
  return normalizeCoreWorldId(worldId);
}
