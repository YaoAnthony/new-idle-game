/**
 * Player entity — wraps a Phaser.Physics.Arcade.Sprite.
 * Handles: keyboard movement, action animations (axe / water),
 * tool switching, and exposes game-state for save.
 */

import Phaser from 'phaser';
import { getPlayerMovementSpeed } from '@timeplan-game/core/protagonist/skillTree';
import type { ToolType, Direction } from '../types';
import { CHAR_FRAME_W, CHAR_FRAME_H, GAME_MINUTES_PER_REAL_SECOND, MINS_PER_DAY } from '../constants';
import { gameBus } from '../shared/EventBus';
import { PLAYER_MAX_HUNGER, normalizePlayerHunger } from '../shared/food';
import { MAX_ACTOR_HEALTH, normalizeActorHealth } from '../shared/health';
import { PathingComponent } from '../shared/PathingComponent';
import type { Pathfinder } from '../systems/Pathfinder';
import { createPhaserKeys, isAnyPhaserKeyDown } from '../features/input/InputBindings';

const PLAYER_HUNGER_GAME_MINUTES_PER_POINT = MINS_PER_DAY / (PLAYER_MAX_HUNGER / 2);
const PLAYER_HUNGER_MOVING_MULTIPLIER = 1.5;

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  currentTool: ToolType  = 'empty';
  facing:      Direction = 'down';
  isActing               = false;

  private movementKeys: Record<Direction, Phaser.Input.Keyboard.Key[]>;
  private hunger = PLAYER_MAX_HUNGER;
  private health = MAX_ACTOR_HEALTH;
  private hungerDrainGameMinutes = 0;
  private pathing: PathingComponent | null = null;
  private movementSpeed = getPlayerMovementSpeed();

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
  ) {

    this.sprite = scene.physics.add.sprite(x, y, 'player', 0);
    this.sprite.setScale(2).setCollideWorldBounds(true);

    // Tight hitbox — formula: body.y = sprite.y + scaleY*(offsetY - displayOriginY)
    // scaleY=2, displayOriginY=24 (set before setScale call, so unscaled)
    // We want body.y ≈ sprite.y (center of sprite world origin), so offsetY=24
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 10);
    body.setOffset(
      (CHAR_FRAME_W - 12) / 2,   // keep the narrower body centered horizontally
      CHAR_FRAME_H / 2,           // = 24 → body.y = sprite.y + 2*(24-24) = sprite.y
    );

    this.sprite.play('idle-down');
    this.sprite.setDepth(y + 96);

    this.movementKeys = {
      up: [],
      down: [],
      left: [],
      right: [],
    };
    this.applyInputBindings();

    // Action keys are bound in GameScene so proximity can decide tool use vs. interaction.
  }

  /** Called every frame from GameScene.update() */
  update(deltaSeconds = 0, gameMinutesDelta?: number): void {
    if (this.isDowned()) {
      this.stopForDowned();
      return;
    }
    if (this.isActing) return;   // freeze movement during action animation
    if (this.hasManualMovementInput()) {
      this.clearNavigation();
      this.handleMovement(deltaSeconds);
      this.updateHunger(deltaSeconds, gameMinutesDelta);
      this.sprite.setDepth(this.sprite.y + 96);
      return;
    }
    if (this.pathing?.isMoving()) {
      const status = this.pathing.update(this.sprite, this.sprite.scene);
      this.updateAnimationFromVelocity();
      if (status === 'arrived' || status === 'failed') {
        this.pathing.clearNavigation();
        this.pathing = null;
        this.sprite.play(`idle-${this.facing}`);
      }
      this.updateHunger(deltaSeconds, gameMinutesDelta);
      this.sprite.setDepth(this.sprite.y + 96);
      return;
    }
    this.handleMovement(deltaSeconds);
    this.updateHunger(deltaSeconds, gameMinutesDelta);
    this.sprite.setDepth(this.sprite.y + 96);
  }

  tickHunger(deltaSeconds = 0, gameMinutesDelta?: number): void {
    this.updateHunger(deltaSeconds, gameMinutesDelta);
  }

  setTool(tool: ToolType): void {
    this.currentTool = tool;
    gameBus.emit('player:tool_change', { tool });
  }

  applyInputBindings(): void {
    this.movementKeys = {
      up: createPhaserKeys(this.sprite.scene, 'moveUp'),
      down: createPhaserKeys(this.sprite.scene, 'moveDown'),
      left: createPhaserKeys(this.sprite.scene, 'moveLeft'),
      right: createPhaserKeys(this.sprite.scene, 'moveRight'),
    };
  }

  /** Trigger the action animation for the current tool. */
  performAction(onImpact?: () => void): boolean {
    if (this.isDowned() || this.isActing || this.currentTool === 'empty') return false;

    this.isActing = true;
    const animKey = `${this.currentTool}-${this.facing}`;
    console.log('[Player] performAction —', animKey);
    let impactApplied = false;
    const applyImpact = () => {
      if (impactApplied) return;
      impactApplied = true;
      onImpact?.();
    };

    // Phaser auto-switches texture to the animation's texture key ('actions')
    this.sprite.play(animKey);
    this.sprite.once('animationcomplete', () => {
      applyImpact();
      this.isActing = false;
      // Switch back to character walk/idle texture
      this.sprite.play(`idle-${this.facing}`);
    });

    // Safety timeout: if animationcomplete never fires (animation missing/broken),
    // reset isActing after 1 second so the player doesn't get permanently stuck.
    this.sprite.scene.time.delayedCall(1000, () => {
      if (this.isActing) {
        console.warn('[Player] isActing stuck — force-releasing after 1s');
        applyImpact();
        this.isActing = false;
        this.sprite.play(`idle-${this.facing}`);
      }
    });
    return true;
  }

  getState(): { x: number; y: number; facing: Direction; hunger: number; health: number } {
    return {
      x:      Math.round(this.sprite.x),
      y:      Math.round(this.sprite.y),
      facing: this.facing,
      hunger: this.hunger,
      health: this.health,
    };
  }

  getHunger(): number {
    return this.hunger;
  }

  setHunger(value: unknown): void {
    const next = normalizePlayerHunger(value);
    if (next === this.hunger) return;
    this.hunger = next;
    gameBus.emit('player:hunger_changed', { hunger: this.hunger, max: PLAYER_MAX_HUNGER });
  }

  restoreHunger(amount: number): number {
    const before = this.hunger;
    this.setHunger(before + amount);
    return this.hunger - before;
  }

  getHealth(): number {
    return this.health;
  }

  setHealth(value: unknown): void {
    const next = normalizeActorHealth(value);
    if (next === this.health) return;
    this.health = next;
    if (this.isDowned()) this.stopForDowned();
    gameBus.emit('player:health_changed', {
      health: this.health,
      max: MAX_ACTOR_HEALTH,
      downed: this.isDowned(),
    });
  }

  damage(amount: number): number {
    const before = this.health;
    this.setHealth(before - Number(amount || 0));
    const changed = before - this.health;
    if (changed > 0) gameBus.emit('game:save_requested', { reason: 'player:damage' });
    return changed;
  }

  heal(amount: number): number {
    const before = this.health;
    this.setHealth(before + Number(amount || 0));
    const changed = this.health - before;
    if (changed > 0) gameBus.emit('game:save_requested', { reason: 'player:heal' });
    return changed;
  }

  isDowned(): boolean {
    return this.health <= 0;
  }

  getMovementSpeed(): number {
    return this.movementSpeed;
  }

  setMovementSpeed(speed: number): void {
    const numeric = Number(speed);
    const next = Number.isFinite(numeric) && numeric > 0 ? numeric : getPlayerMovementSpeed();
    if (next === this.movementSpeed) return;
    this.movementSpeed = next;
    this.clearNavigation();
  }

  navigateTo(x: number, y: number, pathfinder: Pathfinder | null, onArrive?: () => void): boolean {
    if (this.isDowned()) return false;
    this.clearNavigation();
    const pathing = new PathingComponent(this.movementSpeed, 6, pathfinder);
    pathing.navigateTo(this.sprite.x, this.sprite.y, x, y, onArrive);
    if (pathing.status === 'failed') return false;
    this.pathing = pathing;
    return true;
  }

  clearNavigation(): void {
    this.pathing?.clearNavigation();
    this.pathing = null;
  }

  // ── Private ────────────────────────────────────────────────────────────────
  private hasManualMovementInput(): boolean {
    return isAnyPhaserKeyDown(this.movementKeys.left)
      || isAnyPhaserKeyDown(this.movementKeys.right)
      || isAnyPhaserKeyDown(this.movementKeys.up)
      || isAnyPhaserKeyDown(this.movementKeys.down);
  }

  private handleMovement(deltaSeconds: number): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    let vx = 0, vy = 0;

    if (isAnyPhaserKeyDown(this.movementKeys.left)) vx -= this.movementSpeed;
    if (isAnyPhaserKeyDown(this.movementKeys.right)) vx += this.movementSpeed;
    if (isAnyPhaserKeyDown(this.movementKeys.up)) vy -= this.movementSpeed;
    if (isAnyPhaserKeyDown(this.movementKeys.down)) vy += this.movementSpeed;

    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }
    [vx, vy] = this.constrainByWorldGrid(vx, vy, deltaSeconds);
    [vx, vy] = this.constrainByTempleMask(vx, vy, deltaSeconds);
    body.setVelocity(vx, vy);

    this.updateAnimationFromVelocity();
  }

  private updateAnimationFromVelocity(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;

    if (vx !== 0 || vy !== 0) {
      const dir = this.velToDir(vx, vy);
      this.facing = dir;
      if (this.sprite.anims.currentAnim?.key !== `walk-${dir}`) {
        this.sprite.play(`walk-${dir}`);
      }
    } else {
      const cur = this.sprite.anims.currentAnim?.key ?? '';
      if (cur.startsWith('walk-')) {
        this.sprite.play(`idle-${cur.slice(5)}`);
      }
    }
  }

  private updateHunger(deltaSeconds: number, gameMinutesDelta?: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || this.hunger <= 0 || this.isDowned()) return;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const moving = Math.abs(body.velocity.x) > 1 || Math.abs(body.velocity.y) > 1;
    const elapsedGameMinutes = Number.isFinite(gameMinutesDelta) && Number(gameMinutesDelta) > 0
      ? Number(gameMinutesDelta)
      : deltaSeconds * GAME_MINUTES_PER_REAL_SECOND;
    const drainGameMinutes = elapsedGameMinutes * (moving ? PLAYER_HUNGER_MOVING_MULTIPLIER : 1);
    this.hungerDrainGameMinutes += drainGameMinutes;

    while (this.hungerDrainGameMinutes >= PLAYER_HUNGER_GAME_MINUTES_PER_POINT && this.hunger > 0) {
      this.hungerDrainGameMinutes -= PLAYER_HUNGER_GAME_MINUTES_PER_POINT;
      this.setHunger(this.hunger - 1);
      gameBus.emit('game:save_requested', { reason: 'player:hunger_drain' });
    }
  }

  private constrainByWorldGrid(vx: number, vy: number, deltaSeconds: number): [number, number] {
    if (vx === 0 && vy === 0) return [vx, vy];

    let nextVx = vx;
    let nextVy = vy;

    if (nextVx !== 0 && !this.canMoveByWorldGrid(nextVx, 0, deltaSeconds)) {
      nextVx = 0;
    }
    if (nextVy !== 0 && !this.canMoveByWorldGrid(0, nextVy, deltaSeconds)) {
      nextVy = 0;
    }
    if (nextVx !== 0 && nextVy !== 0 && !this.canMoveByWorldGrid(nextVx, nextVy, deltaSeconds)) {
      if (this.canMoveByWorldGrid(nextVx, 0, deltaSeconds)) {
        nextVy = 0;
      } else if (this.canMoveByWorldGrid(0, nextVy, deltaSeconds)) {
        nextVx = 0;
      } else {
        nextVx = 0;
        nextVy = 0;
      }
    }

    return [nextVx, nextVy];
  }

  private canMoveByWorldGrid(vx: number, vy: number, deltaSeconds: number): boolean {
    const grid = (this.sprite.scene as any).worldGrid;
    if (!grid?.worldToCell || !grid?.canMoveBetween) return true;

    const stepSeconds = Phaser.Math.Clamp(
      Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 1 / 60,
      1 / 60,
      1 / 20,
    );
    const fromPoint = this.gridProbePoint(0, 0);
    const toPoint = this.gridProbePoint(vx * stepSeconds, vy * stepSeconds);
    const from = grid.worldToCell(fromPoint.x, fromPoint.y);
    const to = grid.worldToCell(
      toPoint.x,
      toPoint.y,
    );

    if (from.col === to.col && from.row === to.row) return true;
    return Boolean(grid.canMoveBetween(from.col, from.row, to.col, to.row));
  }

  private constrainByTempleMask(vx: number, vy: number, deltaSeconds: number): [number, number] {
    if (vx === 0 && vy === 0) return [vx, vy];
    const scene = this.sprite.scene as any;
    const bounds = this.getActorMaskBounds();
    scene.actorMovementBoundary?.enforceSprite?.({
      kind: 'player',
      id: 'player',
      worldId: this.getWorldId(),
      x: this.sprite.x,
      y: this.sprite.y,
      halfWidth: bounds.halfWidth,
      halfHeight: bounds.halfHeight,
    }, this.sprite);

    let nextVx = vx;
    let nextVy = vy;

    if (nextVx !== 0 && !this.canMoveAlongTempleMaskAxis(nextVx, 0, 'x', deltaSeconds)) {
      nextVx = 0;
    }
    if (nextVy !== 0 && !this.canMoveAlongTempleMaskAxis(0, nextVy, 'y', deltaSeconds)) {
      nextVy = 0;
    }

    return [nextVx, nextVy];
  }

  private canMoveAlongTempleMaskAxis(vx: number, vy: number, axis: 'x' | 'y', deltaSeconds: number): boolean {
    const stepSeconds = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 1 / 60;
    const bounds = this.getActorMaskBounds();
    return (this.sprite.scene as any).actorMovementBoundary?.canMoveAxis?.({
      kind: 'player',
      id: 'player',
      worldId: this.getWorldId(),
      x: this.sprite.x,
      y: this.sprite.y,
      halfWidth: bounds.halfWidth,
      halfHeight: bounds.halfHeight,
    }, this.sprite.x + vx * stepSeconds, this.sprite.y + vy * stepSeconds, axis) ?? true;
  }

  private getWorldId(): string {
    return (this.sprite.scene as any).actorWorldPresence?.getActorWorldId?.('player')
      ?? (this.sprite.scene as any).mapRuntimeManager?.getActiveWorldId?.()
      ?? (this.sprite.scene as any).currentMapDefinition?.ref?.worldId
      ?? 'world:main';
  }

  private getActorMaskBounds(): { halfWidth: number; halfHeight: number } {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return { halfWidth: 0, halfHeight: 0 };
    return { halfWidth: body.width / 2, halfHeight: body.height / 2 };
  }

  private gridProbePoint(dx: number, dy: number): { x: number; y: number } {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const bodyX = body?.x ?? this.sprite.x;
    const bodyY = body?.y ?? this.sprite.y;
    const bodyW = body?.width ?? 0;
    const bodyH = body?.height ?? 0;

    const x = dx < 0
      ? bodyX
      : dx > 0
        ? bodyX + bodyW
        : bodyX + bodyW / 2;
    const y = dy < 0
      ? bodyY
      : dy > 0
        ? bodyY + bodyH
        : bodyY + bodyH / 2;

    return {
      x: x + dx,
      y: y + dy,
    };
  }

  private velToDir(vx: number, vy: number): Direction {
    if (Math.abs(vy) > Math.abs(vx) * 1.6) return vy < 0 ? 'up' : 'down';
    return vx < 0 ? 'left' : 'right';
  }

  private stopForDowned(): void {
    this.isActing = false;
    this.clearNavigation();
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setVelocity(0, 0);
    const idleKey = `idle-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== idleKey) {
      this.sprite.play(idleKey);
    }
    this.sprite.setDepth(this.sprite.y + 96);
  }
}
