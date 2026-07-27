import Phaser from 'phaser';
import type { Npc } from '../entities/Npc';

const COLORS = [
  0x4fd1ff,
  0xffd166,
  0xff6b9a,
  0x90ee90,
  0xc084fc,
] as const;

export class PathDebugSystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private enabled = false;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics()
      .setDepth(9996)
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

  update(npcs: Npc[]): void {
    if (!this.enabled) return;
    this.graphics.clear();

    npcs.forEach((npc, index) => {
      const points = npc.getPathDebugPoints();
      if (points.length < 2) return;

      const color = COLORS[index % COLORS.length];
      this.drawPath(points, color);
    });
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private drawPath(points: [number, number][], color: number): void {
    this.graphics.lineStyle(3, color, 0.95);
    this.graphics.beginPath();
    this.graphics.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      this.graphics.lineTo(points[i][0], points[i][1]);
    }
    this.graphics.strokePath();

    this.graphics.fillStyle(color, 1);
    for (let i = 1; i < points.length; i += 1) {
      const [x, y] = points[i];
      this.graphics.fillCircle(x, y, i === points.length - 1 ? 5 : 3);
    }

    const [startX, startY] = points[0];
    this.graphics.lineStyle(1, 0xffffff, 0.85);
    this.graphics.strokeCircle(startX, startY, 7);
  }
}
