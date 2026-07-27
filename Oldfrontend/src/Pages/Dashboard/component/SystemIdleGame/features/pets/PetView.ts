import Phaser from 'phaser';
import { CHAR_FRAME_H, CHAR_FRAME_W } from '../../constants';
import type {
  PetAnimationClipDefinition,
  PetAnimationProfile,
  PetBehaviorMode,
  PetColor,
  PetDefinition,
  PetLifeStage,
  PetTarget,
} from './PetTypes';
import type { PetTravelDirection } from './travel/PetTravelTypes';

export interface PetViewOptions {
  id: string;
  definition: PetDefinition;
  ownerNpcId?: string;
  displayName?: string;
  canSpeak?: boolean;
  lifeStage?: PetLifeStage;
  color?: PetColor;
}

const COW_COLUMNS = 8;

export class PetView {
  readonly id: string;
  readonly definitionId: string;
  readonly itemId: string;
  readonly petId: string;
  readonly ownerNpcId: string;
  readonly displayName: string;
  readonly canSpeak: boolean;
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  private readonly definition: PetDefinition;
  private readonly scene: Phaser.Scene;
  private lifeStage: PetLifeStage;
  private color: PetColor;
  private target: PetTarget | null = null;
  private behavior: PetBehaviorMode = 'idle';
  private facing: 'down' | 'up' | 'left' | 'right' = 'down';
  private travelTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, options: PetViewOptions) {
    const definition = options.definition;
    this.scene = scene;
    this.definition = definition;
    this.id = options.id;
    this.definitionId = definition.id;
    this.itemId = definition.itemId;
    this.petId = definition.id;
    this.ownerNpcId = options.ownerNpcId ?? definition.ownerNpcId ?? 'player';
    this.displayName = options.displayName ?? definition.displayName;
    this.canSpeak = options.canSpeak ?? definition.canSpeak;
    this.lifeStage = options.lifeStage ?? definition.defaultLifeStage ?? 'adult';
    this.color = options.color ?? (definition.defaultColor && definition.defaultColor !== 'random' ? definition.defaultColor : 'light');

    this.sprite = scene.physics.add.sprite(x, y, this.textureKeyForAppearance(), 0);
    this.sprite
      .setScale(definition.scale ?? 1)
      .setCollideWorldBounds(true)
      .setDepth(y + 72);

    if (typeof definition.tint === 'number' && !this.hasCustomPetSheet()) {
      this.sprite.setTint(definition.tint);
    }

    this.configureBody();
    this.registerAnimations();
    this.setBehavior('idle', null);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get currentBehavior(): PetBehaviorMode {
    return this.behavior;
  }

  get currentLifeStage(): PetLifeStage {
    return this.lifeStage;
  }

  get currentColor(): PetColor {
    return this.color;
  }

  getReferenceFrameDataUrl(): string | null {
    const textureKey = this.textureKeyForAppearance();
    if (!this.scene.textures.exists(textureKey)) return null;
    const frame = this.scene.textures.getFrame(textureKey, 0);
    const sourceImage = frame?.source?.image as CanvasImageSource | undefined;
    if (!frame || !sourceImage) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(frame.width));
    canvas.height = Math.max(1, Math.floor(frame.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sourceImage,
      frame.cutX,
      frame.cutY,
      frame.width,
      frame.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas.toDataURL('image/png');
  }

  setAppearance(lifeStage: PetLifeStage, color: PetColor): void {
    this.lifeStage = lifeStage;
    this.color = color;
    this.sprite.setTexture(this.textureKeyForAppearance(), 0);
    this.configureBody();
    this.registerAnimations();
    this.setBehavior(this.behavior, this.target);
  }

  setBehavior(behavior: PetBehaviorMode, target: PetTarget | null): void {
    this.behavior = behavior;
    this.target = target;
    if (target) return;
    if (this.hasCustomPetSheet()) {
      this.playStationaryBehavior(behavior);
      this.stopVelocity();
      return;
    }
    this.stop();
  }

  beginTravelDeparture(direction: PetTravelDirection, onComplete?: () => void): void {
    this.cancelTravelTween();
    this.target = null;
    this.behavior = 'traveling';
    this.stopVelocity();

    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;

    const vector = directionVector(direction);
    const bounds = this.scene.physics.world.bounds;
    const destinationX = Phaser.Math.Clamp(this.sprite.x + vector.x * 132, bounds.x + 16, bounds.right - 16);
    const destinationY = Phaser.Math.Clamp(this.sprite.y + vector.y * 132, bounds.y + 16, bounds.bottom - 16);

    this.facing = direction;

    this.sprite
      .setVisible(true)
      .setAlpha(1)
      .setDepth(this.sprite.y + 72);

    if (this.hasCustomPetSheet()) {
      this.applyCustomPetHorizontalFlip(vector.x);
      this.playAction('move', true);
    } else {
      this.sprite.play(`walk-${this.facing}`, true);
    }

    this.travelTween = this.scene.tweens.add({
      targets: this.sprite,
      x: destinationX,
      y: destinationY,
      alpha: 0,
      duration: 1600,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.sprite.setDepth(this.sprite.y + 72);
      },
      onComplete: () => {
        this.travelTween = null;
        if (!this.sprite.active) return;
        this.stopVelocity();
        this.sprite.setVisible(false).setAlpha(0);
        onComplete?.();
      },
    });
  }

  beginTravelReturn(playerPosition: { x: number; y: number } | null, onComplete?: () => void): void {
    this.cancelTravelTween();
    this.target = null;
    this.behavior = 'idle';
    this.stopVelocity();

    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;

    const bounds = this.scene.physics.world.bounds;
    const baseX = playerPosition?.x ?? this.sprite.x;
    const baseY = playerPosition?.y ?? this.sprite.y;
    const startX = Phaser.Math.Clamp(baseX + 58, bounds.x + 16, bounds.right - 16);
    const startY = Phaser.Math.Clamp(baseY + 18, bounds.y + 16, bounds.bottom - 16);
    this.sprite
      .setPosition(startX, startY)
      .setVisible(true)
      .setAlpha(0)
      .setDepth(startY + 72);
    this.playStationaryBehavior('idle');

    this.travelTween = this.scene.tweens.add({
      targets: this.sprite,
      alpha: 1,
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.travelTween = null;
        if (!this.sprite.active) return;
        this.sprite.setAlpha(1).setVisible(true);
        const nextBody = this.sprite.body as Phaser.Physics.Arcade.Body | null;
        if (nextBody) nextBody.enable = true;
        onComplete?.();
      },
    });
  }

  hideForTravel(): void {
    this.cancelTravelTween();
    this.stopVelocity();
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;
    this.sprite.setVisible(false).setAlpha(0);
  }

  ensureVisibleAfterTravel(): void {
    this.cancelTravelTween();
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = true;
    this.sprite.setVisible(true).setAlpha(1);
  }

  updateMotion(
    deltaMs: number,
    canMoveAxis?: (nextX: number, nextY: number, axis: 'x' | 'y') => boolean,
  ): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.sprite.setDepth(this.sprite.y + 72);

    if (!this.target || this.behavior === 'sleep' || this.behavior === 'sit' || this.behavior === 'idle' || this.behavior === 'eat' || this.behavior === 'happy') {
      this.stopVelocity();
      if (!this.target && !this.hasCustomPetSheet()) this.stop();
      return;
    }

    const dx = this.target.x - this.sprite.x;
    const dy = this.target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= this.target.radius) {
      this.target = null;
      this.stop();
      return;
    }

    const dt = Math.max(0.001, deltaMs / 1000);
    const speed = this.target.speed;
    let vx = (dx / dist) * speed;
    let vy = (dy / dist) * speed;
    if (vx !== 0 && canMoveAxis && !canMoveAxis(this.sprite.x + vx * dt, this.sprite.y, 'x')) vx = 0;
    if (vy !== 0 && canMoveAxis && !canMoveAxis(this.sprite.x, this.sprite.y + vy * dt, 'y')) vy = 0;
    body.setVelocity(vx, vy);
    this.facing = Math.abs(vx) > Math.abs(vy)
      ? (vx < 0 ? 'left' : 'right')
      : (vy < 0 ? 'up' : 'down');

    if (this.hasCustomPetSheet()) {
      this.applyCustomPetHorizontalFlip(dx);
      this.playAction('move', false);
    } else {
      const anim = `walk-${this.facing}`;
      if (this.sprite.anims.currentAnim?.key !== anim) {
        this.sprite.play(anim, true);
      }
    }

    if (dist < speed * dt) {
      this.sprite.setPosition(this.target.x, this.target.y);
      this.target = null;
      this.stop();
    }
  }

  stop(): void {
    this.stopVelocity();
    if (this.hasCustomPetSheet()) {
      this.playStationaryBehavior(this.behavior);
      return;
    }
    const anim = `idle-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== anim) {
      this.sprite.play(anim, true);
    }
  }

  destroy(): void {
    this.cancelTravelTween();
    this.sprite.destroy();
  }

  private cancelTravelTween(): void {
    if (!this.travelTween) return;
    this.travelTween.stop();
    this.travelTween.remove();
    this.travelTween = null;
  }

  private stopVelocity(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
  }

  private configureBody(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (this.definition.species === 'cow') {
      body.setSize(20, 14);
      body.setOffset(6, 17);
      body.setImmovable(false);
      return;
    }
    body.setSize(12, 10);
    body.setOffset((CHAR_FRAME_W - 12) / 2, CHAR_FRAME_H / 2);
    body.setImmovable(false);
  }

  private hasCustomPetSheet(): boolean {
    return Boolean(this.profileForStage() && this.sheetForAppearance());
  }

  private textureKeyForAppearance(): string {
    return this.sheetForAppearance()?.textureKey ?? this.definition.spriteKey ?? 'player';
  }

  private sheetForAppearance(): { textureKey: string } | null {
    return this.definition.spriteSheets?.find((sheet) => sheet.lifeStage === this.lifeStage && sheet.color === this.color) ?? null;
  }

  private profileForStage(): PetAnimationProfile | null {
    return this.definition.animationProfiles?.find((profile) => profile.lifeStage === this.lifeStage) ?? null;
  }

  private registerAnimations(): void {
    const profile = this.profileForStage();
    const textureKey = this.textureKeyForAppearance();
    if (!profile || !this.scene.textures.exists(textureKey)) return;
    for (const [action, clip] of Object.entries(profile.clips)) {
      const key = this.animKey(action);
      if (this.scene.anims.exists(key)) continue;
      this.scene.anims.create({
        key,
        frames: this.scene.anims.generateFrameNumbers(textureKey, {
          frames: framesForClip(clip),
        }),
        frameRate: clip.frameRate ?? 4,
        repeat: clip.repeat ?? -1,
      });
    }
  }

  private playAction(action: string, restart = false): void {
    const key = this.animKey(action);
    if (!this.scene.anims.exists(key)) return;
    if (!restart && this.sprite.anims.currentAnim?.key === key) return;
    this.sprite.play(key, true);
  }

  private applyCustomPetHorizontalFlip(horizontalDelta: number): void {
    if (!this.hasCustomPetSheet() || Math.abs(horizontalDelta) < 0.5) return;
    this.sprite.setFlipX(horizontalDelta < 0);
  }

  private playStationaryBehavior(behavior: PetBehaviorMode): void {
    if (behavior === 'sit') {
      this.playActionThen('sit_down', 'rest');
      return;
    }
    if (behavior === 'inspect_interest') {
      this.playActionThen('sniff', 'idle');
      return;
    }
    if (behavior === 'happy') {
      this.playActionThen('happy', 'idle');
      return;
    }
    this.playAction(this.actionForStationaryBehavior(behavior), true);
  }

  private playActionThen(action: string, nextAction: string): void {
    const key = this.animKey(action);
    const nextKey = this.animKey(nextAction);
    if (!this.scene.anims.exists(key)) {
      this.playAction(nextAction, true);
      return;
    }
    this.sprite.play(key, true);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + key, () => {
      if (this.sprite.active && this.scene.anims.exists(nextKey)) this.sprite.play(nextKey, true);
    });
  }

  private animKey(action: string): string {
    return `${this.textureKeyForAppearance()}:${action}`;
  }

  private actionForStationaryBehavior(behavior: PetBehaviorMode): string {
    if (behavior === 'sleep') return this.lifeStage === 'adult' ? 'deep_sleep' : 'rest';
    if (behavior === 'sit') return 'rest';
    if (behavior === 'eat') return 'eat';
    if (behavior === 'happy') return 'happy';
    if (behavior === 'inspect_interest') return 'sniff';
    return Math.random() < 0.22 && this.scene.anims.exists(this.animKey('idle_alt')) ? 'idle_alt' : 'idle';
  }
}

function framesForClip(clip: PetAnimationClipDefinition): number[] {
  const row = Math.max(1, Math.floor(Number(clip.row || 1)));
  const start = Math.max(1, Math.floor(Number(clip.start || 1)));
  const end = Math.max(start, Math.floor(Number(clip.end || start)));
  const base = (row - 1) * COW_COLUMNS;
  const frames: number[] = [];
  for (let frame = start; frame <= end; frame += 1) {
    frames.push(base + frame - 1);
  }
  return frames;
}

function directionVector(direction: PetTravelDirection): { x: number; y: number } {
  switch (direction) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
    default:
      return { x: 1, y: 0 };
  }
}
