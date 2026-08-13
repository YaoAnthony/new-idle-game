/**
 * Reward chest world object.
 *
 * This is intentionally separate from the small Sprout Lands storage chest
 * sprite. Reward chests need to be readable on the current Tiled map, own their
 * reward payload, and present open/closed state directly in the world.
 */

import Phaser from 'phaser';
import type { Interactable } from '../types';
import type { ChestRewardItem, GameChest } from '../../../../../Types/Profile';
import { CHEST_INTERACT_RADIUS } from '../constants';
import { gameBus } from '../shared/EventBus';
import { LAYER } from '../world/utils';

type ChestRewards = { coins: number; items: ChestRewardItem[] };

const CLOSED_TEXTURE = 'reward-chest-object-closed';
const OPEN_TEXTURE = 'reward-chest-object-open';
const TEXTURE_W = 112;
const TEXTURE_H = 82;
const CHEST_VISUAL_SCALE = 0.46;

function chestDepth(y: number, offset = 0): number {
  return Math.min(LAYER.ACTOR(y) + offset, LAYER.OVERLAY - 8);
}

function isSceneDrawable(scene: Phaser.Scene | null | undefined): scene is Phaser.Scene {
  const candidate = scene as any;
  const sys = candidate?.sys;
  return Boolean(
    candidate
    && candidate.add
    && candidate.time
    && candidate.tweens
    && sys?.displayList
    && sys?.updateList
    && (typeof sys.isActive !== 'function' || sys.isActive()),
  );
}

function normalizeRewards(rewards: ChestRewards): ChestRewards {
  return {
    coins: Math.max(0, Number(rewards?.coins ?? 0)),
    items: Array.isArray(rewards?.items) ? rewards.items : [],
  };
}

function rewardItemCount(rewards: ChestRewards): number {
  return rewards.items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);
}

function rewardSummary(rewards: ChestRewards): string {
  const parts: string[] = [];
  if (rewards.coins > 0) parts.push(`金币 ${rewards.coins}`);
  const items = rewardItemCount(rewards);
  if (items > 0) parts.push(`物品 ${items}`);
  return parts.length ? parts.join(' · ') : '空宝箱';
}

function ensureRewardChestTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(CLOSED_TEXTURE) && scene.textures.exists(OPEN_TEXTURE)) return;

  const create = (key: string, open: boolean) => {
    if (scene.textures.exists(key)) return;
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_W;
    canvas.height = TEXTURE_H;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Ground shadow is drawn by Phaser; the texture itself stays transparent.
    const bodyX = 14;
    const bodyY = 34;
    const bodyW = 84;
    const bodyH = 36;
    const lidX = open ? 23 : 18;
    const lidY = open ? 13 : 20;
    const lidW = open ? 68 : 76;
    const lidH = open ? 18 : 24;

    if (open) {
      ctx.fillStyle = '#2a140b';
      ctx.fillRect(22, 29, 68, 14);
      ctx.fillStyle = '#ffe36c';
      ctx.fillRect(30, 31, 52, 5);
      ctx.fillStyle = '#fff4a6';
      ctx.fillRect(42, 28, 28, 4);
    }

    ctx.fillStyle = '#5b2d16';
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
    ctx.fillStyle = '#8d4c20';
    ctx.fillRect(bodyX + 4, bodyY + 4, bodyW - 8, bodyH - 8);
    ctx.fillStyle = '#d58a31';
    ctx.fillRect(bodyX + 8, bodyY + 6, bodyW - 16, 8);
    ctx.fillStyle = '#3a1a0c';
    ctx.fillRect(bodyX, bodyY + bodyH - 7, bodyW, 7);

    ctx.fillStyle = '#f4c64e';
    ctx.fillRect(bodyX + 8, bodyY - 2, 7, bodyH + 6);
    ctx.fillRect(bodyX + bodyW - 15, bodyY - 2, 7, bodyH + 6);
    ctx.fillRect(bodyX + 2, bodyY + 14, bodyW - 4, 5);
    ctx.fillStyle = '#fff0a2';
    ctx.fillRect(bodyX + 9, bodyY, 5, bodyH + 2);
    ctx.fillRect(bodyX + bodyW - 14, bodyY, 5, bodyH + 2);

    ctx.fillStyle = open ? '#bf6f2a' : '#6b3418';
    ctx.fillRect(lidX, lidY, lidW, lidH);
    ctx.fillStyle = open ? '#f0a63f' : '#a45b24';
    ctx.fillRect(lidX + 4, lidY + 4, lidW - 8, lidH - 8);
    ctx.fillStyle = '#f7d160';
    ctx.fillRect(lidX + 7, lidY + 2, lidW - 14, 5);
    ctx.fillRect(lidX + 10, lidY, 7, lidH);
    ctx.fillRect(lidX + lidW - 17, lidY, 7, lidH);

    ctx.fillStyle = '#f9d866';
    ctx.fillRect(49, bodyY + 13, 14, 18);
    ctx.fillStyle = '#3a1a0c';
    ctx.fillRect(53, bodyY + 18, 6, 8);
    ctx.fillStyle = '#fff4ae';
    ctx.fillRect(51, bodyY + 15, 10, 3);

    ctx.strokeStyle = '#251108';
    ctx.lineWidth = 4;
    ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);
    ctx.strokeRect(lidX, lidY, lidW, lidH);

    scene.textures.addCanvas(key, canvas);
  };

  create(CLOSED_TEXTURE, false);
  create(OPEN_TEXTURE, true);
}

export class Chest implements Interactable {
  readonly sprite: Phaser.GameObjects.Container;
  readonly id: string;
  rewards: ChestRewards;
  isOpen = false;

  private readonly body: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly contentsLabel: Phaser.GameObjects.Text;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private rewardEmitted = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    id: string,
    rewards: ChestRewards,
  ) {
    this.id = id;
    this.rewards = normalizeRewards(rewards);
    ensureRewardChestTextures(scene);

    this.sprite = scene.add.container(x, y).setDepth(chestDepth(y));
    this.shadow = scene.add.ellipse(0, -3, 48, 12, 0x000000, 0.24);
    this.body = scene.add.image(0, 0, CLOSED_TEXTURE).setOrigin(0.5, 1).setScale(CHEST_VISUAL_SCALE);
    this.contentsLabel = scene.add.text(0, -45, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: '#fff2b7',
      backgroundColor: '#1c120acc',
      padding: { x: 3, y: 2 },
      align: 'center',
    }).setOrigin(0.5, 1).setVisible(false);
    this.contentsLabel.setData('rewardSummary', rewardSummary(this.rewards));
    this.label = scene.add.text(0, -34, '宝箱', {
      fontFamily: '"Courier New", monospace',
      fontSize: '8px',
      color: '#ffe57a',
      backgroundColor: '#00000099',
      padding: { x: 3, y: 1 },
      align: 'center',
    }).setOrigin(0.5, 1);

    this.sprite.add([this.shadow, this.body, this.contentsLabel, this.label]);
  }

  syncFromData(data: GameChest): void {
    this.rewards = normalizeRewards(data.rewards);
    this.sprite.setPosition(data.x, data.y).setDepth(chestDepth(data.y));
    this.contentsLabel.setText('');
    if (!data.opened && this.isOpen) this.close(true);
  }

  isNearPlayer(px: number, py: number, radius = CHEST_INTERACT_RADIUS): boolean {
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    this.open();
  }

  open(): void {
    if (this.isOpen) {
      this.emitReward();
      return;
    }

    this.isOpen = true;
    this.body.setTexture(OPEN_TEXTURE);
    this.label.setText('已打开');
    this.contentsLabel.setText('');
    if (isSceneDrawable(this.sprite.scene)) {
      this.playOpenEffect();
      this.sprite.scene.time.delayedCall(360, () => this.emitReward());
    } else {
      this.emitReward();
    }
  }

  close(resetReward = false): void {
    this.isOpen = false;
    if (resetReward) this.rewardEmitted = false;
    this.body.setTexture(CLOSED_TEXTURE);
    this.label.setText('宝箱');
    this.contentsLabel.setText('');
  }

  highlight(): void {
    const scene = this.sprite.scene;
    if (!isSceneDrawable(scene)) return;
    const x = this.sprite.x;
    const y = this.sprite.y;
    const gfx = scene.add.graphics().setDepth(chestDepth(y, 42));
    let progress = 0;

    scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 160,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
    });

    const timer = scene.time.addEvent({
      delay: 24,
      repeat: 52,
      callback: () => {
        progress += 1 / 52;
        const alpha = Math.max(0, 1 - progress);
        gfx.clear();
        gfx.lineStyle(4, 0xffd65a, alpha);
        gfx.strokeEllipse(x, y - 17, 58 + progress * 18, 38 + progress * 12);
        gfx.lineStyle(1, 0xffffff, alpha * 0.55);
        gfx.strokeEllipse(x, y - 17, 68 + progress * 20, 48 + progress * 14);
        if (progress >= 1) {
          gfx.destroy();
          timer.destroy();
        }
      },
    });
  }

  destroy(): void {
    this.sprite.destroy(true);
  }

  private emitReward(): void {
    if (this.rewardEmitted) return;
    this.rewardEmitted = true;
    const chest: GameChest = {
      id: this.id,
      x: this.sprite.x,
      y: this.sprite.y,
      rewards: this.rewards,
      opened: false,
      createdAt: 0,
    };
    gameBus.emit('chest:interact', { chestId: this.id, rewards: this.rewards, chest });
  }

  private playOpenEffect(): void {
    const scene = this.sprite.scene;
    if (!isSceneDrawable(scene)) return;
    const baseX = this.sprite.x;
    const baseY = this.sprite.y;

    scene.tweens.add({
      targets: this.body,
      y: -4,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    for (let i = 0; i < 12; i += 1) {
      const coin = scene.add.circle(baseX, baseY - 28, 2.5, 0xffd65a, 1)
        .setStrokeStyle(1, 0xffffff, 0.9)
        .setDepth(chestDepth(baseY, 50));
      scene.tweens.add({
        targets: coin,
        x: baseX + Phaser.Math.Between(-22, 22),
        y: baseY - Phaser.Math.Between(44, 68),
        alpha: 0,
        duration: 700 + Phaser.Math.Between(0, 260),
        ease: 'Cubic.Out',
        onComplete: () => coin.destroy(),
      });
    }

  }
}
