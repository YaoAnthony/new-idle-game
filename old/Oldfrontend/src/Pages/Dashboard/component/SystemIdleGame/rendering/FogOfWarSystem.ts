import Phaser from 'phaser';

export interface FogOfWarOptions {
  color?: number;
  alpha?: number;
  depth?: number;
  blur?: {
    quality?: number;
    offsetX?: number;
    offsetY?: number;
    strength?: number;
    steps?: number;
  };
}

export interface FogOfWarMapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FogOfWarRevealer =
  | {
      kind: 'circle';
      id: string;
      x: number;
      y: number;
      worldId: string;
      radius: number;
      strength: number;
      softness: number;
    }
  | {
      kind: 'polygon';
      id: string;
      x: number;
      y: number;
      worldId: string;
      points: Array<{ x: number; y: number }>;
      strength: number;
      softness: number;
    };

export interface FogOfWarUpdateInput {
  activeWorldId: string;
  mapBounds: FogOfWarMapBounds;
  revealers: FogOfWarRevealer[];
}

const FOG_OF_WAR_DEPTH = 9910;
const GAUSSIAN_REVEAL_TEXTURE_PREFIX = 'idle-game-fow-gaussian-reveal';
const DEFAULT_COLOR = 0x00020a;
const DEFAULT_ALPHA = 0.95;
const MIN_MAP_SIZE = 1;
const GAUSSIAN_TEXTURE_SIZE = 768;
const DEFAULT_BLUR = {
  quality: 2,
  offsetX: 5,
  offsetY: 5,
  strength: 1,
  steps: 6,
};

export class FogOfWarSystem {
  private renderTexture: Phaser.GameObjects.RenderTexture | null = null;
  private readonly revealGraphics: Phaser.GameObjects.Graphics;
  private readonly revealStamp: Phaser.GameObjects.Image;
  private enabled = true;
  private color = DEFAULT_COLOR;
  private alpha = DEFAULT_ALPHA;
  private depth = FOG_OF_WAR_DEPTH;
  private blur = { ...DEFAULT_BLUR };
  private lastBounds: FogOfWarMapBounds | null = null;
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, options: FogOfWarOptions = {}) {
    this.setOptions(options);
    this.revealGraphics = scene.make.graphics({}, false);
    this.revealStamp = scene.make.image({
      x: 0,
      y: 0,
      key: this.ensureGaussianRevealTexture(0.55),
      add: false,
    }, false);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.renderTexture?.setVisible(false);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setOptions(options: FogOfWarOptions): void {
    if (typeof options.color === 'number') this.color = options.color;
    if (typeof options.alpha === 'number') this.alpha = Phaser.Math.Clamp(options.alpha, 0, 1);
    if (options.blur) {
      this.blur = {
        quality: options.blur.quality ?? this.blur.quality,
        offsetX: options.blur.offsetX ?? this.blur.offsetX,
        offsetY: options.blur.offsetY ?? this.blur.offsetY,
        strength: options.blur.strength ?? this.blur.strength,
        steps: options.blur.steps ?? this.blur.steps,
      };
      this.applyBlurEffect();
    }
    if (typeof options.depth === 'number') {
      this.depth = options.depth;
      this.renderTexture?.setDepth(this.depth);
    }
  }

  update(input: FogOfWarUpdateInput): void {
    if (this.destroyed) return;
    if (!this.enabled) {
      this.renderTexture?.setVisible(false);
      return;
    }

    this.ensureRenderTexture(input.mapBounds);
    const renderTexture = this.renderTexture;
    if (!renderTexture) return;

    renderTexture
      .setVisible(true)
      .clear()
      .fill(this.color, this.alpha);

    const activeRevealers = input.revealers.filter((revealer) => (
      revealer.worldId === input.activeWorldId && revealer.strength > 0.01
    ));
    for (const revealer of activeRevealers) {
      this.eraseRevealer(renderTexture, revealer);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.renderTexture?.destroy();
    this.renderTexture = null;
    this.revealGraphics.destroy();
    this.revealStamp.destroy();
  }

  private ensureRenderTexture(bounds: FogOfWarMapBounds): void {
    const normalized = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(MIN_MAP_SIZE, Math.ceil(bounds.width)),
      height: Math.max(MIN_MAP_SIZE, Math.ceil(bounds.height)),
    };
    const needsNewTexture = !this.renderTexture
      || !this.lastBounds
      || normalized.x !== this.lastBounds.x
      || normalized.y !== this.lastBounds.y
      || normalized.width !== this.lastBounds.width
      || normalized.height !== this.lastBounds.height;

    if (!needsNewTexture) return;
    this.renderTexture?.destroy();
    this.renderTexture = this.scene.add
      .renderTexture(normalized.x, normalized.y, normalized.width, normalized.height)
      .setOrigin(0, 0)
      .setScrollFactor(1)
      .setDepth(this.depth)
      .setBlendMode(Phaser.BlendModes.NORMAL);
    this.lastBounds = normalized;
    this.applyBlurEffect();
  }

  private applyBlurEffect(): void {
    const postFX = this.renderTexture?.postFX;
    if (!postFX) return;
    postFX.clear();
    postFX.addBlur(
      this.blur.quality,
      this.blur.offsetX,
      this.blur.offsetY,
      this.blur.strength,
      0xffffff,
      this.blur.steps,
    );
  }

  private eraseRevealer(renderTexture: Phaser.GameObjects.RenderTexture, revealer: FogOfWarRevealer): void {
    if (revealer.kind === 'circle') {
      this.eraseSoftCircle(renderTexture, revealer);
    } else {
      this.revealGraphics.clear();
      this.drawPolygon(revealer);
      renderTexture.erase(this.revealGraphics);
      this.revealGraphics.clear();
    }
  }

  private eraseSoftCircle(
    renderTexture: Phaser.GameObjects.RenderTexture,
    revealer: Extract<FogOfWarRevealer, { kind: 'circle' }>,
  ): void {
    const radius = Math.max(1, revealer.radius);
    const strength = Phaser.Math.Clamp(revealer.strength, 0, 1);
    const softness = Phaser.Math.Clamp(revealer.softness, 0, 1);
    if (strength <= 0.01) return;

    this.revealStamp
      .setTexture(this.ensureGaussianRevealTexture(softness))
      .setOrigin(0.5)
      .setPosition(revealer.x, revealer.y)
      .setDisplaySize(radius * 2, radius * 2)
      .setAlpha(strength);
    renderTexture.erase(this.revealStamp);
  }

  private drawPolygon(revealer: Extract<FogOfWarRevealer, { kind: 'polygon' }>): void {
    if (revealer.points.length < 2) return;
    const strength = Phaser.Math.Clamp(revealer.strength, 0, 1);
    this.revealGraphics.fillStyle(0xffffff, strength);
    this.revealGraphics.beginPath();
    this.revealGraphics.moveTo(revealer.x, revealer.y);
    for (const point of revealer.points) {
      this.revealGraphics.lineTo(point.x, point.y);
    }
    this.revealGraphics.closePath();
    this.revealGraphics.fillPath();
  }

  private ensureGaussianRevealTexture(softness: number): string {
    const bucket = Math.round(Phaser.Math.Clamp(softness, 0, 1) * 100);
    const key = `${GAUSSIAN_REVEAL_TEXTURE_PREFIX}-${bucket}`;
    if (this.scene.textures.exists(key)) return key;

    const canvas = this.createGaussianRevealCanvas(bucket / 100);
    this.scene.textures.addCanvas(key, canvas);
    this.scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    return key;
  }

  private createGaussianRevealCanvas(softness: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = GAUSSIAN_TEXTURE_SIZE;
    canvas.height = GAUSSIAN_TEXTURE_SIZE;

    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const image = ctx.createImageData(GAUSSIAN_TEXTURE_SIZE, GAUSSIAN_TEXTURE_SIZE);
    const data = image.data;
    const center = (GAUSSIAN_TEXTURE_SIZE - 1) / 2;
    const radius = center;
    const core = Phaser.Math.Clamp(1 - softness * 0.92, 0.04, 0.96);
    const sigma = 0.28;

    for (let y = 0; y < GAUSSIAN_TEXTURE_SIZE; y += 1) {
      const dy = (y - center) / radius;
      for (let x = 0; x < GAUSSIAN_TEXTURE_SIZE; x += 1) {
        const dx = (x - center) / radius;
        const normalizedDistance = Math.sqrt(dx * dx + dy * dy);
        const offset = (y * GAUSSIAN_TEXTURE_SIZE + x) * 4;
        const alpha = normalizedDistance <= core
          ? 1
          : this.gaussianFalloff((normalizedDistance - core) / Math.max(0.001, 1 - core), sigma);
        const byteAlpha = alpha < 0.003 || normalizedDistance > 1 ? 0 : Math.round(alpha * 255);

        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = byteAlpha;
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  private gaussianFalloff(distance: number, sigma: number): number {
    const clamped = Math.max(0, distance);
    return Math.exp(-(clamped * clamped) / (2 * sigma * sigma));
  }
}
