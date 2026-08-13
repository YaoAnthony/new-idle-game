import Phaser from 'phaser';
import { getBuildingDefinition } from '../../catalog/GameRuntimeCatalog';
import { ITEM_DEF_MAP, type ItemDef } from '../../entities/DropItem';
import { resolveBuildingPlacementForItem } from '../building/placement/BuildingPlacementResolver';
import {
  normalizePlacementFootprint,
  resolvePlacementCenterFromTopLeft,
  resolvePlacementTopLeftCell,
  type PlacementFootprint,
} from '../building/placement/BuildingPlacementGeometry';
import type { StateBackedWorldGrid } from '../../shared/StateBackedWorldGrid';
import type { Direction } from '../../types';
import { ensureItemTexture, ensureVisualKeyTexture } from '../../visuals';
import { LAYER, T } from '../../world/utils';

interface PreviewPlayer {
  sprite: { x: number; y: number };
  facing?: Direction;
  heldItemId?: string;
}

interface FurniturePlacementPreviewSystemOptions {
  scene: Phaser.Scene;
  getPlayer: () => PreviewPlayer | null | undefined;
  getWorldGrid: () => StateBackedWorldGrid | null | undefined;
}

const VALID_TINT = 0x76f0a0;
const INVALID_TINT = 0xff5f6d;

interface PlacementDisplaySize {
  w: number;
  h: number;
}

export class FurniturePlacementPreviewSystem {
  private readonly scene: Phaser.Scene;
  private readonly getPlayer: FurniturePlacementPreviewSystemOptions['getPlayer'];
  private readonly getWorldGrid: FurniturePlacementPreviewSystemOptions['getWorldGrid'];
  private sprite: Phaser.GameObjects.Image | null = null;
  private marker: Phaser.GameObjects.Graphics | null = null;
  private activeItemId: string | null = null;

  constructor(options: FurniturePlacementPreviewSystemOptions) {
    this.scene = options.scene;
    this.getPlayer = options.getPlayer;
    this.getWorldGrid = options.getWorldGrid;
  }

  update(options: { inputPaused?: boolean } = {}): void {
    if (options.inputPaused) {
      this.hide();
      return;
    }

    const player = this.getPlayer();
    const itemId = player?.heldItemId;
    const item = itemId ? ITEM_DEF_MAP.get(itemId) : undefined;
    if (!player || !item || !isPlacementPreviewItem(item)) {
      this.hide();
      return;
    }

    const grid = this.getWorldGrid();
    if (!grid) {
      this.hide();
      return;
    }

    const footprint = this.getPlacementFootprint(item);
    const target = this.getTargetCell(grid, player, footprint);
    if (!target) {
      this.hide();
      return;
    }

    this.ensurePreview(item);
    if (!this.sprite || !this.marker) return;

    const displaySize = this.getPlacementDisplaySize(item, footprint);
    const center = this.getFootprintCenter(target, footprint);
    const canPlace = this.canPlaceAt(grid, target.col, target.row, item, footprint);
    this.sprite
      .setPosition(center.x, center.y)
      .setDisplaySize(displaySize.w, displaySize.h)
      .setDepth(LAYER.ACTOR(center.y) - 8)
      .setTint(canPlace ? VALID_TINT : INVALID_TINT)
      .setAlpha(canPlace ? 0.48 : 0.34)
      .setVisible(true);

    this.marker
      .setDepth(LAYER.ACTOR(center.y) - 9)
      .setVisible(true);
    this.drawMarker(center.x, center.y, footprint, canPlace);
  }

  destroy(): void {
    this.sprite?.destroy();
    this.marker?.destroy();
    this.sprite = null;
    this.marker = null;
    this.activeItemId = null;
  }

  private hide(): void {
    this.sprite?.setVisible(false);
    this.marker?.setVisible(false);
  }

  private ensurePreview(item: ItemDef): void {
    if (this.sprite && this.activeItemId === item.itemId) return;

    this.sprite?.destroy();
    const textureKey = this.getPlacementTextureKey(item);
    this.sprite = this.scene.add
      .image(0, 0, textureKey)
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    if (!this.marker) {
      this.marker = this.scene.add.graphics().setVisible(false);
    }

    this.activeItemId = item.itemId;
  }

  private getTargetCell(
    grid: StateBackedWorldGrid,
    player: PreviewPlayer,
    footprint: PlacementFootprint,
  ): { col: number; row: number; x: number; y: number } | null {
    const origin = grid.worldToCell(player.sprite.x, player.sprite.y);
    const target = resolvePlacementTopLeftCell(origin, player.facing ?? 'down', footprint);
    const col = target.col;
    const row = target.row;
    const cell = grid.getCell(col, row);
    if (!cell) return null;

    const { cx, cy } = grid.cellToWorld(col, row);
    return { col, row, x: cx, y: cy };
  }

  private canPlaceAt(
    grid: StateBackedWorldGrid,
    col: number,
    row: number,
    item: ItemDef,
    footprint: PlacementFootprint,
  ): boolean {
    if (!isPlacementPreviewItem(item)) return false;

    const scene = this.scene as any;
    for (let dx = 0; dx < footprint.w; dx += 1) {
      for (let dy = 0; dy < footprint.h; dy += 1) {
        const cell = grid.getCell(col + dx, row + dy);
        if (!cell) return false;
        if (cell.terrain === 'water' || cell.terrain === 'border' || cell.terrain === 'pond') return false;
        if (cell.objectId || cell.cropId) return false;
        if (cell.entityIds.some((entityId) => entityId !== 'player')) return false;

        const { cx, cy } = grid.cellToWorld(col + dx, row + dy);
        if (
          scene.buildingSystem?.hasBlockingBuildingNear?.(cx, cy, 28)
          || (scene.creatureSystem?.nests ?? []).some((nest: any) =>
            !nest.gone && Math.hypot(nest.x - cx, nest.y - cy) < 28,
          )
          || scene.petSystem?.hasBlockingPetNear?.(cx, cy, 28)
        ) {
          return false;
        }
      }
    }
    return true;
  }

  private drawMarker(x: number, y: number, footprint: PlacementFootprint, canPlace: boolean): void {
    if (!this.marker) return;
    const color = canPlace ? VALID_TINT : INVALID_TINT;
    const width = footprint.w * T;
    const height = footprint.h * T;
    const left = x - width / 2;
    const top = y - height / 2;
    this.marker.clear();
    this.marker.fillStyle(color, canPlace ? 0.12 : 0.18);
    this.marker.fillRect(left, top, width, height);
    this.marker.lineStyle(2, color, 0.8);
    this.marker.strokeRect(left + 1, top + 1, width - 2, height - 2);
  }

  private getPlacementTextureKey(item: ItemDef): string {
    const definition = this.getPlacementBuildingDefinition(item);
    const visualKey = definition?.constructionStages?.[0]?.visualKey
      ?? definition?.levels?.[0]?.visualKey
      ?? definition?.visualKey;
    if (visualKey) {
      const size = Math.max(
        T,
        Number(definition?.displaySize?.w ?? 0),
        Number(definition?.displaySize?.h ?? 0),
        Number(definition?.footprint?.w ?? 1) * T,
        Number(definition?.footprint?.h ?? 1) * T,
      );
      return ensureVisualKeyTexture(this.scene, visualKey, {
        namespace: 'placement-preview',
        size,
        fallbackTint: item.tint,
      });
    }
    return ensureItemTexture(this.scene, item.itemId, { namespace: 'placement-preview', size: T, fallbackTint: item.tint });
  }

  private getPlacementBuildingDefinition(item: ItemDef) {
    const resolution = resolveBuildingPlacementForItem(item.itemId);
    return resolution ? getBuildingDefinition(resolution.definitionId) : null;
  }

  private getPlacementFootprint(item: ItemDef): PlacementFootprint {
    const footprint = this.getPlacementBuildingDefinition(item)?.footprint;
    return normalizePlacementFootprint(footprint);
  }

  private getPlacementDisplaySize(item: ItemDef, footprint: PlacementFootprint): PlacementDisplaySize {
    const definition = this.getPlacementBuildingDefinition(item);
    const displaySize = definition?.displaySize;
    return {
      w: Math.max(T, Number(displaySize?.w ?? footprint.w * T)),
      h: Math.max(T, Number(displaySize?.h ?? footprint.h * T)),
    };
  }

  private getFootprintCenter(
    target: { col: number; row: number; x: number; y: number },
    footprint: PlacementFootprint,
  ): { x: number; y: number } {
    return resolvePlacementCenterFromTopLeft({ cx: target.x, cy: target.y }, footprint, T);
  }
}

function isPlacementPreviewItem(item: ItemDef): boolean {
  return item.itemType === 'placeable' || item.itemType === 'storage_chest';
}
