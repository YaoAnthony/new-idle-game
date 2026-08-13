import Phaser from 'phaser';
import type { Interactable } from '../../types';
import { CHEST_INTERACT_RADIUS } from '../../constants';
import { gameBus } from '../../shared/EventBus';
import { LAYER } from '../../world/utils';
import { cloneStorageChestSave, type StorageChestFacing, type StorageChestSave } from './StorageChestTypes';

function storageChestUiDepth(y: number, offset = 20): number {
  return Math.min(LAYER.ACTOR(y) + offset, LAYER.OVERLAY - 8);
}

const CHEST_FRAMES: Record<StorageChestFacing, { closed: number; opening: number[]; flipX: boolean }> = {
  down: { closed: 0, opening: [0, 1, 2], flipX: false },
  left: { closed: 5, opening: [5, 6, 7, 8, 9], flipX: false },
  right: { closed: 5, opening: [5, 6, 7, 8, 9], flipX: true },
};

function normalizeFacing(facing: unknown): StorageChestFacing {
  return facing === 'left' || facing === 'right' ? facing : 'down';
}

export class StorageChestView implements Interactable {
  readonly id: string;
  readonly sprite: Phaser.GameObjects.Sprite;

  private readonly label: Phaser.GameObjects.Text;
  private chest: StorageChestSave;
  private runtimeVisible = true;
  private opening = false;

  constructor(private readonly scene: Phaser.Scene, chest: StorageChestSave) {
    this.id = chest.id;
    this.chest = cloneStorageChestSave(chest);
    this.sprite = scene.add.sprite(chest.x, chest.y, 'chest', 0);
    this.sprite.setScale(0.72).setDepth(LAYER.ACTOR(chest.y));
    this.applyFrame(false);
    this.label = scene.add.text(chest.x, chest.y - 18, 'Storage', {
      fontSize: '8px',
      color: '#fff0a8',
      backgroundColor: '#00000088',
      padding: { x: 3, y: 2 },
      fontFamily: '"Courier New", monospace',
    }).setOrigin(0.5, 1).setDepth(storageChestUiDepth(chest.y));
  }

  updateChest(chest: StorageChestSave): void {
    this.chest = cloneStorageChestSave(chest);
    this.sprite.setPosition(chest.x, chest.y).setDepth(LAYER.ACTOR(chest.y));
    if (!this.opening) this.applyFrame(false);
    this.label.setPosition(chest.x, chest.y - 18).setDepth(storageChestUiDepth(chest.y));
    this.setVisible(this.runtimeVisible);
  }

  get data(): StorageChestSave {
    return cloneStorageChestSave(this.chest);
  }

  isNearPlayer(px: number, py: number, radius = CHEST_INTERACT_RADIUS): boolean {
    if (!this.runtimeVisible) return false;
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    if (!this.runtimeVisible) return;
    this.playOpenAnimation(() => gameBus.emit('game:storage_chest_open_requested', {
      chestId: this.id,
      roomId: (this.scene as any).roomId || (this.scene as any).currentRoomId || undefined,
    }));
  }

  setVisible(visible: boolean): void {
    this.runtimeVisible = visible;
    this.sprite.setVisible(visible);
    this.sprite.setActive(visible);
    this.label.setVisible(visible);
    this.label.setActive(visible);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | undefined;
    if (body) body.enable = visible;
  }

  setRuntimeVisible(visible: boolean): void {
    this.setVisible(visible);
  }

  destroy(): void {
    this.label.destroy();
    this.sprite.destroy();
  }

  private get facing(): StorageChestFacing {
    return normalizeFacing(this.chest.facing);
  }

  private applyFrame(open: boolean): void {
    const config = CHEST_FRAMES[this.facing];
    this.sprite.setFlipX(config.flipX);
    this.sprite.setFrame(open ? config.opening[config.opening.length - 1] : config.closed);
  }

  private playOpenAnimation(onOpened: () => void): void {
    if (this.opening) return;
    this.opening = true;
    const config = CHEST_FRAMES[this.facing];
    this.sprite.setFlipX(config.flipX);
    let index = 0;
    const step = () => {
      if (!this.runtimeVisible || !this.sprite.active) {
        this.opening = false;
        return;
      }
      this.sprite.setFrame(config.opening[index]);
      index += 1;
      if (index < config.opening.length) {
        this.scene.time.delayedCall(45, step);
        return;
      }
      onOpened();
      this.scene.time.delayedCall(520, () => {
        this.opening = false;
        if (!this.sprite.active) return;
        this.applyFrame(false);
      });
    };
    step();
  }
}
