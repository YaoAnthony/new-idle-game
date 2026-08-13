/**
 * WeatherSystem - manages weather overlays and particles.
 *
 * Uses Phaser's built-in ParticleEmitter for precipitation. Fog puffs live in
 * world space, so camera movement passes through them instead of pinning them
 * to the screen.
 */

import Phaser from 'phaser';

export type WeatherType = 'clear' | 'rain' | 'storm' | 'fog';

type RainProfile = 'rain' | 'storm';

const RAIN_COLOR = 0x9cc9de;
const RAIN_TEXTURE_KEY = 'weather-rain-drop';
const FOG_TEXTURE_KEY = 'weather-fog-puff';

const WEATHER_DEPTH = 9700;
const WEATHER_OVERLAY_DEPTH = 9701;
const FOG_DEPTH = 9702;
const LIGHTNING_DEPTH = 9902;

interface FogPuff {
  sprite: Phaser.GameObjects.Image;
  velocityX: number;
  velocityY: number;
  baseAlpha: number;
  phase: number;
  pulseSpeed: number;
}

export class WeatherSystem {
  private scene:       Phaser.Scene;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private weatherOverlay: Phaser.GameObjects.Rectangle | null = null;
  private lightningOverlay: Phaser.GameObjects.Rectangle | null = null;
  private lightningBolt: Phaser.GameObjects.Graphics | null = null;
  private fogPuffs: FogPuff[] = [];
  private thunderEvents: Phaser.Time.TimerEvent[] = [];
  private nextLightningAt = Number.POSITIVE_INFINITY;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private destroyed = false;

  current: WeatherType = 'clear';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._buildTexture();
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  // -- Public API -------------------------------------------------------------

  setWeather(type: WeatherType): void {
    if (this.destroyed) return;
    if (this.current === type) return;

    this.current = type;
    if (type === 'rain') {
      this._startRain('rain');
      return;
    }
    if (type === 'storm') {
      this._startRain('storm');
      return;
    }
    if (type === 'fog') {
      this._startFog();
      return;
    }
    this._clearEffects();
  }

  update(timeMs: number, deltaMs: number): void {
    if (this.destroyed || this.current === 'clear') return;

    const { width, height } = this._getViewportSize();
    if (
      (this.current === 'rain' || this.current === 'storm')
      && (width !== this.viewportWidth || height !== this.viewportHeight)
    ) {
      this._startRain(this.current);
    } else {
      this._resizeScreenOverlays(width, height);
    }

    if (this.current === 'storm' && timeMs >= this.nextLightningAt) {
      this._flashLightning(timeMs);
    }
    if (this.current === 'fog') {
      this._updateFog(timeMs, deltaMs);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this._clearEffects();
  }

  // -- Private ---------------------------------------------------------------

  /**
   * Generate tiny in-memory textures so weather has no asset dependency.
   * `scene.add.graphics` stays compatible with the current Phaser 3.88 build.
   */
  private _buildTexture(): void {
    if (this.scene.textures.exists(RAIN_TEXTURE_KEY)) {
      this.scene.textures.remove(RAIN_TEXTURE_KEY);
    }
    const rain = this.scene.add.graphics();
    rain.fillStyle(RAIN_COLOR, 1);
    rain.fillRect(0, 0, 2, 12);
    rain.generateTexture(RAIN_TEXTURE_KEY, 2, 12);
    rain.destroy();

    if (this.scene.textures.exists(FOG_TEXTURE_KEY)) {
      this.scene.textures.remove(FOG_TEXTURE_KEY);
    }
    const fog = this.scene.add.graphics();
    fog.fillStyle(0xe8f0ee, 0.05);
    fog.fillCircle(64, 64, 64);
    fog.fillStyle(0xf4fbf8, 0.08);
    fog.fillCircle(64, 64, 48);
    fog.fillStyle(0xffffff, 0.09);
    fog.fillCircle(64, 64, 28);
    fog.generateTexture(FOG_TEXTURE_KEY, 128, 128);
    fog.destroy();
  }

  private _startRain(profile: RainProfile): void {
    this._clearEffects();

    const { width, height } = this._getViewportSize();
    this.viewportWidth = width;
    this.viewportHeight = height;

    const isStorm = profile === 'storm';

    this.emitters.push(
      this._createRainEmitter(width, {
        speedX: isStorm ? { min: 95, max: 155 } : { min: 30, max: 70 },
        speedY: isStorm ? { min: 700, max: 920 } : { min: 430, max: 640 },
        rotate: isStorm ? -17 : -9,
        scale: isStorm ? { min: 0.55, max: 1.25 } : { min: 0.45, max: 1.0 },
        lifespan: isStorm ? { min: 620, max: 1050 } : { min: 850, max: 1350 },
        quantity: isStorm ? 8 : 3,
        frequency: isStorm ? 12 : 24,
        alpha: isStorm ? { min: 0.28, max: 0.62 } : { min: 0.2, max: 0.48 },
        depth: WEATHER_DEPTH,
      }),
      this._createRainEmitter(width, {
        speedX: isStorm ? { min: 150, max: 240 } : { min: 60, max: 105 },
        speedY: isStorm ? { min: 1040, max: 1420 } : { min: 650, max: 920 },
        rotate: isStorm ? -22 : -12,
        scale: isStorm ? { min: 1.25, max: 2.65 } : { min: 0.85, max: 1.8 },
        lifespan: isStorm ? { min: 420, max: 720 } : { min: 620, max: 980 },
        quantity: isStorm ? 5 : 2,
        frequency: isStorm ? 14 : 28,
        alpha: isStorm ? { min: 0.55, max: 0.95 } : { min: 0.3, max: 0.7 },
        depth: WEATHER_DEPTH + 2,
      }),
    );

    this.weatherOverlay = this.scene.add
      .rectangle(0, 0, width, height, isStorm ? 0x071120 : 0x112244, isStorm ? 0.34 : 0.14)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WEATHER_OVERLAY_DEPTH);

    if (isStorm) {
      this.lightningOverlay = this.scene.add
        .rectangle(0, 0, width, height, 0xeef7ff, 0)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(LIGHTNING_DEPTH);
      this.lightningBolt = this.scene.add.graphics()
        .setScrollFactor(0)
        .setDepth(LIGHTNING_DEPTH + 1)
        .setVisible(false);
      this.nextLightningAt = (this.scene.time?.now ?? 0) + Phaser.Math.Between(2400, 6800);
    }
  }

  private _startFog(): void {
    this._clearEffects();

    const { width, height } = this._getViewportSize();
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.weatherOverlay = this.scene.add
      .rectangle(0, 0, width, height, 0xcfd8d3, 0.22)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WEATHER_OVERLAY_DEPTH);

    const view = this._getCameraWorldView();
    const count = Math.max(14, Math.ceil((view.width * view.height) / 28000));
    for (let i = 0; i < count; i += 1) {
      const scaleX = Phaser.Math.FloatBetween(3.0, 6.8);
      const scaleY = Phaser.Math.FloatBetween(1.1, 2.4);
      const sprite = this.scene.add
        .image(
          Phaser.Math.FloatBetween(view.x - view.width * 0.35, view.x + view.width * 1.35),
          Phaser.Math.FloatBetween(view.y - view.height * 0.35, view.y + view.height * 1.35),
          FOG_TEXTURE_KEY,
        )
        .setOrigin(0.5)
        .setDepth(FOG_DEPTH)
        .setAlpha(Phaser.Math.FloatBetween(0.12, 0.24));
      sprite.setScale(scaleX, scaleY);
      this.fogPuffs.push({
        sprite,
        velocityX: Phaser.Math.FloatBetween(6, 18),
        velocityY: Phaser.Math.FloatBetween(-3, 3),
        baseAlpha: sprite.alpha,
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        pulseSpeed: Phaser.Math.FloatBetween(0.45, 0.8),
      });
    }
  }

  private _updateFog(timeMs: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const view = this._getCameraWorldView();
    for (const puff of this.fogPuffs) {
      const sprite = puff.sprite;
      sprite.x += puff.velocityX * dt;
      sprite.y += puff.velocityY * dt;
      sprite.setAlpha(puff.baseAlpha + Math.sin(timeMs * 0.001 * puff.pulseSpeed + puff.phase) * 0.035);

      const padX = Math.max(180, sprite.displayWidth * 0.55);
      const padY = Math.max(120, sprite.displayHeight * 0.55);
      const left = view.x - padX;
      const right = view.x + view.width + padX;
      const top = view.y - padY;
      const bottom = view.y + view.height + padY;
      if (sprite.x > right) sprite.x = left;
      if (sprite.x < left) sprite.x = right;
      if (sprite.y > bottom) sprite.y = top;
      if (sprite.y < top) sprite.y = bottom;
    }
  }

  private _flashLightning(timeMs: number): void {
    if (!this.lightningOverlay) return;

    const { width, height } = this._getViewportSize();
    const flashAlpha = Phaser.Math.FloatBetween(0.42, 0.72);
    this.lightningOverlay.setAlpha(flashAlpha);
    this.scene.tweens.killTweensOf(this.lightningOverlay);
    this.scene.tweens.add({
      targets: this.lightningOverlay,
      alpha: 0,
      duration: Phaser.Math.Between(170, 320),
      ease: 'Quad.easeOut',
    });
    this._drawLightningBolt(width, height);
    this._scheduleThunder();
    this.scene.cameras?.main?.shake(140, 0.0022);
    this.nextLightningAt = timeMs + Phaser.Math.Between(3600, 10500);
  }

  private _resizeScreenOverlays(width: number, height: number): void {
    if (width === this.viewportWidth && height === this.viewportHeight) return;

    this.viewportWidth = width;
    this.viewportHeight = height;
    this.weatherOverlay?.setDisplaySize(width, height);
    this.lightningOverlay?.setDisplaySize(width, height);
  }

  private _getViewportSize(): { width: number; height: number } {
    const camera = this.scene.cameras?.main;
    return {
      width: Math.max(1, camera?.width ?? this.scene.scale.width),
      height: Math.max(1, camera?.height ?? this.scene.scale.height),
    };
  }

  private _getCameraWorldView(): { x: number; y: number; width: number; height: number } {
    const camera = this.scene.cameras?.main;
    const worldView = camera?.worldView;
    if (worldView) {
      return {
        x: worldView.x,
        y: worldView.y,
        width: Math.max(1, worldView.width),
        height: Math.max(1, worldView.height),
      };
    }
    const width = Math.max(1, (camera?.width ?? this.scene.scale.width) / Math.max(1, camera?.zoom ?? 1));
    const height = Math.max(1, (camera?.height ?? this.scene.scale.height) / Math.max(1, camera?.zoom ?? 1));
    return {
      x: camera?.scrollX ?? 0,
      y: camera?.scrollY ?? 0,
      width,
      height,
    };
  }

  private _clearEffects(): void {
    this.emitters.forEach((emitter) => emitter.destroy());
    this.emitters = [];
    this.weatherOverlay?.destroy();
    this.weatherOverlay = null;
    this.lightningOverlay?.destroy();
    this.lightningOverlay = null;
    this.lightningBolt?.destroy();
    this.lightningBolt = null;
    this.fogPuffs.forEach((puff) => puff.sprite.destroy());
    this.fogPuffs = [];
    this.thunderEvents.forEach((event) => event.remove(false));
    this.thunderEvents = [];
    (this.scene as any).gameAudioSystem?.stopByTag?.('weather.thunder', 250);
    this.nextLightningAt = Number.POSITIVE_INFINITY;
  }

  private _createRainEmitter(
    width: number,
    options: {
      speedX: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
      speedY: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
      rotate: number;
      scale: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
      lifespan: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
      quantity: number;
      frequency: number;
      alpha: Phaser.Types.GameObjects.Particles.EmitterOpOnEmitType;
      depth: number;
    },
  ): Phaser.GameObjects.Particles.ParticleEmitter {
    const emitter = this.scene.add.particles(0, 0, RAIN_TEXTURE_KEY, {
      x: { min: -112, max: width + 112 },
      y: { min: -120, max: 0 },
      speedX: options.speedX,
      speedY: options.speedY,
      rotate: options.rotate,
      scale: options.scale,
      lifespan: options.lifespan,
      quantity: options.quantity,
      frequency: options.frequency,
      blendMode: Phaser.BlendModes.ADD,
      alpha: options.alpha,
    });
    emitter.setScrollFactor(0);
    emitter.setDepth(options.depth);
    return emitter;
  }

  private _drawLightningBolt(width: number, height: number): void {
    if (!this.lightningBolt) return;

    const bolt = this.lightningBolt;
    bolt.clear();
    bolt.setVisible(true);
    bolt.setAlpha(1);
    const startX = Phaser.Math.Between(Math.floor(width * 0.12), Math.floor(width * 0.88));
    const endY = Phaser.Math.Between(Math.floor(height * 0.25), Math.floor(height * 0.58));
    let x = startX;
    let y = -12;
    bolt.lineStyle(3, 0xf6fbff, 0.95);
    bolt.beginPath();
    bolt.moveTo(x, y);

    while (y < endY) {
      x += Phaser.Math.Between(-34, 34);
      y += Phaser.Math.Between(24, 48);
      bolt.lineTo(x, y);
      if (Math.random() < 0.28) {
        const branchX = x + Phaser.Math.Between(-48, 48);
        const branchY = y + Phaser.Math.Between(18, 42);
        bolt.moveTo(x, y);
        bolt.lineTo(branchX, branchY);
        bolt.moveTo(x, y);
      }
    }
    bolt.strokePath();
    bolt.lineStyle(1, 0xbdefff, 0.65);
    bolt.strokePath();

    this.scene.tweens.killTweensOf(bolt);
    this.scene.tweens.add({
      targets: bolt,
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => {
        bolt.clear();
        bolt.setVisible(false);
      },
    });
  }

  private _scheduleThunder(): void {
    if (Math.random() > 0.86) return;
    const delay = Phaser.Math.Between(160, 1250);
    const event = this.scene.time.delayedCall(delay, () => {
      this.thunderEvents = this.thunderEvents.filter((item) => item !== event);
      if (this.destroyed || this.current !== 'storm') return;
      (this.scene as any).gameAudioSystem?.playSfx?.('weather.thunder', {
        volume: Phaser.Math.FloatBetween(0.36, 0.72),
        rate: Phaser.Math.FloatBetween(0.92, 1.05),
        detune: Phaser.Math.Between(-80, 45),
        tag: 'weather.thunder',
      });
    });
    this.thunderEvents.push(event);
  }
}
