import Phaser from 'phaser';
import { ITEM_DEF_MAP } from '../../entities/DropItem';
import type { StateBackedWorldGrid } from '../../shared/StateBackedWorldGrid';
import { LAYER, T } from '../../world/utils';
import { resolveFacingToolTargetCell, type ToolTargetPlayer } from './ToolTargeting';

interface ToolTargetPreviewSystemOptions {
  scene: Phaser.Scene;
  getPlayer: () => ToolTargetPlayer | null | undefined;
  getWorldGrid: () => StateBackedWorldGrid | null | undefined;
}

const OUTLINE_COLOR = 0xf8f5e8;
const SUPPORTED_TOOLS = new Set(['axe', 'scythe', 'water']);

export class ToolTargetPreviewSystem {
  private readonly scene: Phaser.Scene;
  private readonly getPlayer: ToolTargetPreviewSystemOptions['getPlayer'];
  private readonly getWorldGrid: ToolTargetPreviewSystemOptions['getWorldGrid'];
  private marker: Phaser.GameObjects.Graphics | null = null;

  constructor(options: ToolTargetPreviewSystemOptions) {
    this.scene = options.scene;
    this.getPlayer = options.getPlayer;
    this.getWorldGrid = options.getWorldGrid;
  }

  update(options: { inputPaused?: boolean } = {}): void {
    if (options.inputPaused) {
      this.hide();
      return;
    }

    const player = this.getPlayer() as (ToolTargetPlayer & { currentTool?: string; heldItemId?: string }) | null | undefined;
    if (!player || !this.shouldShowForPlayer(player)) {
      this.hide();
      return;
    }

    const target = resolveFacingToolTargetCell(this.getWorldGrid(), player);
    if (!target) {
      this.hide();
      return;
    }

    this.ensureMarker();
    if (!this.marker) return;
    const left = target.x - T / 2;
    const top = target.y - T / 2;
    this.marker
      .clear()
      .fillStyle(OUTLINE_COLOR, 0.035)
      .fillRect(left, top, T, T)
      .lineStyle(1, OUTLINE_COLOR, 0.38)
      .strokeRect(left + 0.5, top + 0.5, T - 1, T - 1)
      .setDepth(LAYER.ACTOR(target.y) - 12)
      .setVisible(true);
  }

  destroy(): void {
    this.marker?.destroy();
    this.marker = null;
  }

  private ensureMarker(): void {
    if (this.marker) return;
    this.marker = this.scene.add.graphics().setVisible(false);
  }

  private hide(): void {
    this.marker?.setVisible(false);
  }

  private shouldShowForPlayer(player: { currentTool?: string; heldItemId?: string }): boolean {
    const heldItem = player.heldItemId ? ITEM_DEF_MAP.get(player.heldItemId) : undefined;
    if (heldItem && ['placeable', 'house_blueprint', 'storage_chest'].includes(heldItem.itemType)) return false;
    const tool = player.currentTool;
    if (tool && SUPPORTED_TOOLS.has(tool)) return true;
    if (heldItem?.itemId?.endsWith('_seed')) return true;
    return false;
  }
}
