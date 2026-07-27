/**
 * Npc entity — wandering NPC with persistent memory and GPT-driven planning.
 *
 * Every NPC_THINK_INTERVAL real seconds the NPC sends its memory to the
 * backend /profile/npc/think endpoint.  The backend returns a list of
 * planned actions (say / move / idle …) which the NPC executes in order.
 * While no planned actions exist the NPC wanders randomly.
 */

import Phaser from 'phaser';
import type { NpcMemoryEntry, NpcAction } from '../types';
import { NPC_SPEED, NPC_MAX_MEMORY, CHAR_FRAME_W, CHAR_FRAME_H } from '../constants';
import type { Pathfinder } from '../systems/Pathfinder';
import { PathingComponent } from '../shared/PathingComponent';
import { gameBus } from '../shared/EventBus';
import { MAX_ACTOR_HEALTH, normalizeActorHealth } from '../shared/health';
import type { NpcAutonomyMode } from '../shared/worldStateTypes';
import { normalizeNpcActionForRuntime } from '../actions/actor/ActionExecutor';
import { formatNpcEatFeedback } from '../shared/food';
import { getNpcDefinitionById } from '../shared/GameNpcCatalog';

const NPC_BODY_W = 10;
const NPC_BODY_H = 8;
const NPC_LABEL_OFFSET_Y = 24;
const NPC_BUBBLE_OFFSET_Y = 34;
const NPC_BUBBLE_OFFSET_X_CHOICES = [-14, -7, 0, 7, 14];
const NPC_BUBBLE_OFFSET_Y_CHOICES = [0, -3, -6];
const NPC_REPLY_HOLD_SECONDS = 4.5;
const FARM_ACTION_SKILL_BY_KIND = {
  till: 'farm_till_day',
  water: 'farm_water_day',
  plant: 'farm_sow_wheat_day',
  harvest: 'farm_harvest_day',
} as const;
type NpcMovementPolicy = 'free' | 'stationary';

interface NpcThinkingOptions {
  holdPosition?: boolean;
}

function stableHash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = ((value << 5) - value) + input.charCodeAt(i);
    value |= 0;
  }
  return Math.abs(value);
}

function clampBodySignal(value: unknown, fallback: number): number {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, numberValue));
}

function movementSpeedMultiplierFromHunger(hunger: number): number {
  if (hunger >= 60) return 1;
  if (hunger >= 30) return 0.75 + ((hunger - 30) / 30) * 0.25;
  if (hunger >= 10) return 0.55 + ((hunger - 10) / 20) * 0.2;
  return 0.45;
}

function idleMovementDesireFromFatigue(fatigue: number): number {
  if (fatigue <= 50) return 1;
  if (fatigue <= 80) return 0.4 + ((80 - fatigue) / 30) * 0.6;
  return 0.12 + ((100 - fatigue) / 20) * 0.28;
}

export class Npc {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly name:   string;

  memory:         NpcMemoryEntry[] = [];
  plannedActions: NpcAction[]      = [];

  private scene: Phaser.Scene;

  // Sync provider functions (can't use EventBus for sync getters)
  private _getNpcInventory: ((name: string) => Record<string, number>) | null = null;

  // Movement state
  private mode:  'idle' | 'walk' = 'idle';
  private velX   = 0;
  private velY   = 0;
  private timer  = 2;   // seconds until next decision

  // A* pathfinding — delegated to PathingComponent
  private pathing: PathingComponent | null = null;
  private readonly NAV_SPEED  = NPC_SPEED * 1.6;
  private readonly REACH_DIST = 24;
  private navigationTarget: { x: number; y: number; worldId?: string } | null = null;

  // Speech state
  private speechTimer   = 0;
  private _isThinking   = false;

  // AI state
  private brainEnabled = true;
  private autonomyMode: NpcAutonomyMode = 'free';
  private movementPolicy: NpcMovementPolicy = 'free';
  private movementSpeedMultiplier = 1;
  private idleMovementDesire = 1;
  private health = MAX_ACTOR_HEALTH;

  // ── Confirmation gate (ask_confirm action pauses the queue) ────────────
  private waitingForConfirm = false;

  // ── World context (set by GameScene after create) ──────────────────────
  private worldCtx: import('../actions/actor/ActionExecutor').WorldContext | null = null;

  // ── Follow mode ────────────────────────────────────────────────────────
  private playerSprite:  Phaser.Physics.Arcade.Sprite | null = null;
  private isFollowing    = false;
  private followCooldown = 0;

  // ── Dispatch mission ───────────────────────────────────────────────────
  private isDispatched = false;
  private conversationLockTimer = 0;
  private conversationPartner: Phaser.Physics.Arcade.Sprite | null = null;

  // Label / bubble text objects (set after construction via init())
  private labelText!: Phaser.GameObjects.Text;
  private bubbleText!: Phaser.GameObjects.Text;
  private readonly speechOffset: { x: number; y: number };
  private destroyed = false;

  /** Set the provider for the current auth token (sync getter, can't use bus). */
  setAuthProvider(fn: () => string | null): void {
    void fn;
  }

  /** Set the provider for NPC inventory lookup (sync getter, can't use bus). */
  setInventoryProvider(fn: (name: string) => Record<string, number>): void {
    this._getNpcInventory = fn;
  }

  /** Query the NPC's current carried items (via the injected inventory provider). */
  getInventory(name: string): Record<string, number> {
    return this._getNpcInventory?.(name) ?? {};
  }

  constructor(
    scene: Phaser.Scene,
    x: number, y: number,
    name: string,
  ) {
    this.scene = scene;
    this.name  = name;
    const offsetIndex = stableHash(name);
    this.speechOffset = {
      x: NPC_BUBBLE_OFFSET_X_CHOICES[offsetIndex % NPC_BUBBLE_OFFSET_X_CHOICES.length],
      y: NPC_BUBBLE_OFFSET_Y_CHOICES[Math.floor(offsetIndex / NPC_BUBBLE_OFFSET_X_CHOICES.length) % NPC_BUBBLE_OFFSET_Y_CHOICES.length],
    };

    this.sprite = scene.physics.add.sprite(x, y, 'player', 4);
    this.sprite.setScale(2).setTint(0x88ffaa).setCollideWorldBounds(true);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(NPC_BODY_W, NPC_BODY_H);
    body.setOffset(
      (CHAR_FRAME_W - NPC_BODY_W) / 2,
      CHAR_FRAME_H / 2,
    );
    this.sprite.play('idle-up');
    this.sprite.setDepth(y + 96);

    this.createLabels(x, y);
  }

  // ── Labels ─────────────────────────────────────────────────────────────────
  private createLabels(x: number, y: number): void {
    this.labelText = this.scene.add.text(x, y - NPC_LABEL_OFFSET_Y, this.name, {
      fontSize:        '9px',
      color:           '#ffff88',
      backgroundColor: '#00000099',
      padding:         { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(9998);

    this.bubbleText = this.createBubbleText(x, y);
  }

  private createBubbleText(x: number, y: number): Phaser.GameObjects.Text {
    return this.scene.add.text(x + this.speechOffset.x, y - NPC_BUBBLE_OFFSET_Y + this.speechOffset.y, '', {
      fontSize:        '9px',
      color:           '#222222',
      backgroundColor: '#ffffffdd',
      padding:         { x: 6, y: 4 },
      wordWrap:        { width: 132 },
    }).setOrigin(0.5, 1).setDepth(9999).setVisible(false);
  }

  private updateLabelPositions(): void {
    if (this.canMutateText(this.labelText)) {
      this.labelText.setPosition(this.sprite.x, this.sprite.y - NPC_LABEL_OFFSET_Y);
    }
    if (this.canMutateText(this.bubbleText) && this.bubbleText.visible) {
      this.bubbleText.setPosition(
        this.sprite.x + this.speechOffset.x,
        this.sprite.y - NPC_BUBBLE_OFFSET_Y + this.speechOffset.y,
      );
    }
  }

  private canMutateText(text?: Phaser.GameObjects.Text): text is Phaser.GameObjects.Text {
    return Boolean(
      !this.destroyed
      && text
      && text.scene
      && text.active
      && !(text as any).destroyed
    );
  }

  private safeSetBubbleText(text: string, visible: boolean): boolean {
    if (!this.canMutateText(this.bubbleText)) return false;
    try {
      this.bubbleText.setText(text).setVisible(visible);
      this.updateLabelPositions();
      return true;
    } catch (error) {
      console.warn('[Npc] bubble text update failed; recreating bubble text', {
        npcName: this.name,
        error,
      });
      try {
        this.bubbleText.destroy();
        this.bubbleText = this.createBubbleText(this.sprite.x, this.sprite.y);
        this.bubbleText.setText(text).setVisible(visible);
        this.updateLabelPositions();
        return true;
      } catch (retryError) {
        console.warn('[Npc] bubble text recreate failed', {
          npcName: this.name,
          error: retryError,
        });
        return false;
      }
    }
  }

  private safeSetBubbleVisible(visible: boolean): void {
    if (!this.canMutateText(this.bubbleText)) return;
    try {
      this.bubbleText.setVisible(visible);
    } catch (error) {
      console.warn('[Npc] bubble visibility update failed', { npcName: this.name, error });
    }
  }

  private safeSetLabelVisible(visible: boolean): void {
    if (!this.canMutateText(this.labelText)) return;
    try {
      this.labelText.setVisible(visible);
    } catch (error) {
      console.warn('[Npc] label visibility update failed', { npcName: this.name, error });
    }
  }

  setRuntimeVisible(visible: boolean, options: { preserveState?: boolean } = {}): void {
    if (this.destroyed || !this.sprite?.scene) return;

    if (!visible && !options.preserveState) {
      this.stopFollowing();
      this.clearNavigation();
      this.plannedActions = [];
      this.waitingForConfirm = false;
      this.conversationLockTimer = 0;
      this.conversationPartner = null;
      this.speechTimer = 0;
      this._isThinking = false;
    }

    this.sprite.setVisible(visible);
    this.sprite.setAlpha(visible ? 1 : 0);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.enable = visible;
      body.setVelocity(0, 0);
    }
    this.safeSetLabelVisible(visible);
    this.safeSetBubbleVisible(false);
    this.updateLabelPositions();
  }

  // ── Memory ─────────────────────────────────────────────────────────────────

  /**
   * Seed the local memory cache from the backend on game boot.
   * The backend is the source of truth — this is for local display only.
   */
  loadMemories(entries: NpcMemoryEntry[]): void {
    this.memory = [...entries];
    // Keep only the most recent NPC_MAX_MEMORY for local display
    if (this.memory.length > NPC_MAX_MEMORY) {
      this.memory = this.memory.slice(-NPC_MAX_MEMORY);
    }
  }

  /**
   * Append a memory entry to the local cache (used for immediate speech-bubble
   * display). The backend persists the authoritative copy via /npc/chat.
   */
  addMemory(text: string, source: NpcMemoryEntry['source'], absoluteGameMinutes: number): void {
    const entry: NpcMemoryEntry = {
      id:           `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      absoluteGameMinutes,
      text,
      source,
      importance:   source === 'player' ? 6 : 5,
      keywords:     text.split(/[\s，。！？、]+/).filter(t => t.length >= 2),
      lastAccessed: absoluteGameMinutes,
    };
    this.memory.push(entry);
    if (this.memory.length > NPC_MAX_MEMORY) {
      this.memory.splice(0, this.memory.length - NPC_MAX_MEMORY);
    }
  }

  // ── A* navigation ─────────────────────────────────────────────────────────
  /** Attach the scene's Pathfinder so this NPC can navigate around obstacles. */
  setPathfinder(pf: Pathfinder): void {
    const actorPathfinder = pf.fork?.((col, row, baseWeight) => {
      const bounds = this.getActorMaskBounds();
      const worldId = this.getCurrentWorldId() ?? 'world:main';
      return (this.scene as any).actorMovementBoundary?.resolvePathWeight?.({
        kind: 'npc',
        id: this.name,
        worldId,
        x: this.sprite.x,
        y: this.sprite.y,
        halfWidth: bounds.halfWidth,
        halfHeight: bounds.halfHeight,
        tags: this.getCatalogTags(),
      }, col, row, baseWeight, (this.scene as any).mapRuntimeManager?.getContext?.(worldId)?.mapDefinition
        ?? (this.scene as any).currentMapDefinition) ?? baseWeight;
    }) ?? pf;
    this.pathing = new PathingComponent(this.NAV_SPEED, this.REACH_DIST, actorPathfinder);
  }

  private ensurePathing(): PathingComponent {
    if (!this.pathing) {
      this.pathing = new PathingComponent(this.NAV_SPEED, this.REACH_DIST, null);
    }
    return this.pathing;
  }

  /** Provide access to the game world (trees, items) for chop/pickup actions. */
  setWorldContext(ctx: import('../actions/actor/ActionExecutor').WorldContext): void {
    this.worldCtx = ctx;
  }

  /** Pass the player sprite so the NPC can follow them. */
  setPlayerRef(sprite: Phaser.Physics.Arcade.Sprite): void {
    this.playerSprite = sprite;
  }

  setBodyMovementModifiers(body: { hunger?: number; fatigue?: number } | null | undefined): void {
    const hunger = clampBodySignal(body?.hunger, 100);
    const fatigue = clampBodySignal(body?.fatigue, 0);
    this.movementSpeedMultiplier = movementSpeedMultiplierFromHunger(hunger);
    this.idleMovementDesire = idleMovementDesireFromFatigue(fatigue);
  }

  /** Start following the player continuously. */
  startFollowing(): void {
    if (this.isDowned()) return;
    if (this.isStationary()) return;
    this.isFollowing = true;
  }

  /** Stop following the player. */
  stopFollowing(): void { this.isFollowing = false; }

  talkWithNpc(target: Npc, standAt: { x: number; y: number }, absoluteGameMinutes: number, duration = 14, text?: string): void {
    if (this.isDowned() || target.isDowned()) return;
    this.stopFollowing();
    target.stopFollowing();
    target.lockConversationWith(this.sprite, duration + 3, true);

    const targetWorldId = this.worldCtx?.getWorldIdAt?.(target.sprite.x, target.sprite.y);
    this.navigateToWorldTarget({ x: standAt.x, y: standAt.y, worldId: targetWorldId }, () => {
      this.lockConversationWith(target.sprite, duration, false);
      target.lockConversationWith(this.sprite, duration, true);
      this.faceToward(target.sprite.x, target.sprite.y);
      target.faceToward(this.sprite.x, this.sprite.y);
      if (text) this.say(text, absoluteGameMinutes);
    });
  }

  lockConversationWith(partner: Phaser.Physics.Arcade.Sprite, duration = 12, clearQueue = false): void {
    this.stopFollowing();
    this.clearNavigation();
    if (clearQueue) this.plannedActions = [];
    this.conversationPartner = partner;
    this.conversationLockTimer = Math.max(this.conversationLockTimer, duration);
    this.stopMovement();
    this.faceToward(partner.x, partner.y);
  }

  /**
   * Start a dispatch mission:
   *  1. Disappear from the current map position.
   *  2. After 10 s reappear where the mission started.
   *  3. Fire onNpcDispatchReturn so React can call the backend for the story.
   */
  startDispatch(carriedItems: Record<string, number> = {}): void {
    if (this.isDowned()) return;
    this.isFollowing = false;
    const returnPoint = this.targetWithWorld(this.sprite.x, this.sprite.y);
    this.clearNavigation();
    this.sprite.setVisible(false);
    this.safeSetLabelVisible(false);
    this.safeSetBubbleVisible(false);
    (this.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    this.isDispatched = true;
    gameBus.emit('npc:dispatch', { npcName: this.name, carriedItems });

    this.scene.time.delayedCall(10_000, () => {
      if (this.destroyed || !this.sprite?.scene) return;
      this.sprite.setPosition(returnPoint.x, returnPoint.y);
      this.sprite.setVisible(true);
      this.safeSetLabelVisible(true);
      (this.sprite.body as Phaser.Physics.Arcade.Body).enable = true;
      this.stopMovement();
      this.isDispatched = false;
      gameBus.emit('npc:dispatch_return', { npcName: this.name, carriedItems });
    });
  }

  /**
   * Navigate to world position (tx, ty) using A*.
   * Keeps the planned queue intact so multi-step tasks can continue after arrival.
   */
  navigateTo(tx: number, ty: number, onArrive?: () => void): void {
    if (this.isDowned()) return;
    if (this.isStationary()) {
      this.clearNavigation();
      return;
    }
    if (this.pathing) {
      this.pathing.navigateTo(this.sprite.x, this.sprite.y, tx, ty, onArrive);
      this.navigationTarget = { x: tx, y: ty };
      if (this.pathing.status === 'failed') {
        this.emitNavigationFailed('no_path');
        this.stopMovement();
        this.timer = 1.5;
      } else {
        this.mode = 'walk';
      }
    } else {
      // No pathfinder — head straight
      this.startMoveTo(tx, ty);
    }
  }

  /**
   * Navigate without the scene Pathfinder. Room interiors live outside the
   * main WorldGrid, so their local moves must not be clamped to that grid.
   */
  navigateDirectTo(tx: number, ty: number, onArrive?: () => void, worldId?: string): void {
    if (this.isDowned()) return;
    if (this.isStationary()) {
      this.clearNavigation();
      return;
    }
    const pathing = this.ensurePathing();
    pathing.navigateDirectTo(this.sprite.x, this.sprite.y, tx, ty, onArrive);
    this.navigationTarget = { x: tx, y: ty, worldId };
    this.mode = 'walk';
  }

  navigateAlongPath(waypoints: [number, number][], onArrive?: () => void, worldId?: string): void {
    if (this.isDowned()) return;
    if (this.isStationary()) {
      this.clearNavigation();
      return;
    }
    if (waypoints.length === 0) {
      onArrive?.();
      return;
    }
    const pathing = this.ensurePathing();
    pathing.navigateAlongWaypoints(waypoints, onArrive);
    const [x, y] = waypoints[waypoints.length - 1];
    this.navigationTarget = { x, y, worldId };
    this.mode = 'walk';
  }

  private navigateToWorldTarget(target: { x: number; y: number; worldId?: string }, onArrive?: () => void): void {
    if (this.isStationary()) {
      this.clearNavigation();
      return;
    }
    const routed = this.worldCtx?.navigateNpcToWorldPosition?.(this.name, target, onArrive);
    if (routed) {
      this.navigationTarget = target;
      this.mode = 'walk';
      return;
    }
    this.navigateTo(target.x, target.y, onArrive);
  }

  private targetWithWorld(x: number, y: number, worldId?: string): { x: number; y: number; worldId?: string } {
    return { x, y, worldId: worldId ?? this.worldCtx?.getWorldIdAt?.(x, y) };
  }

  /** Stop all active navigation immediately. */
  clearNavigation(): void {
    this.pathing?.clearNavigation();
    this.navigationTarget = null;
    this.stopMovement();
  }

  /**
   * Pause the planned action queue and fire the React confirm dialog callback.
   * Called by the ask_confirm action handler in ActionExecutor (immediate path).
   */
  pauseForConfirm(question?: string): void {
    this.waitingForConfirm = true;
    this.clearNavigation();
    if (question) {
      gameBus.emit('npc:ask_confirm', { npcName: this.name, question });
    }
  }

  /**
   * Resume (or cancel) after the player responds to an ask_confirm dialog.
   * @param yes true = continue remaining queue; false = clear queue
   */
  respondToConfirm(yes: boolean): void {
    this.waitingForConfirm = false;
    if (!yes) {
      this.plannedActions = [];
      this.clearNavigation();
    }
  }

  // ── Frame update (called from GameScene.update) ───────────────────────────
  update(dt: number, absoluteGameMinutes: number): void {
    if (this.destroyed || !this.sprite?.active) return;

    // Skip ALL updates while NPC is off on a dispatch mission
    if (this.isDispatched) return;
    if (!this.sprite.visible) return;
    if (this.isDowned()) {
      this.stopForDowned();
      this.updateLabelPositions();
      return;
    }

    const conversationLocked = this.conversationLockTimer > 0;
    if (conversationLocked) {
      this.conversationLockTimer = Math.max(0, this.conversationLockTimer - dt);
      this.stopMovement();
      if (this.conversationPartner) {
        this.faceToward(this.conversationPartner.x, this.conversationPartner.y);
      }
    }

    // Autonomous thinking is coordinated by the NPC blackboard runtime. This entity only
    // executes movement, queued actions, and view state.
    if (this._isThinking) {
      this.stopMovement();
      this.updateAnimation();
      this.sprite.setDepth(this.sprite.y + 96);
      this.updateLabelPositions();
      return;
    }

    // ── Follow-player mode ─────────────────────────────────────────────────
    // Re-navigate toward player every second if they've drifted too far away.
    if (!conversationLocked && this.isFollowing && this.playerSprite) {
      this.followCooldown -= dt;
      if (this.followCooldown <= 0) {
        this.followCooldown = 1.0;
        const dist = Phaser.Math.Distance.Between(
          this.sprite.x, this.sprite.y,
          this.playerSprite.x, this.playerSprite.y,
        );
        if (dist > 72 && !this.pathing?.isMoving()) {
          // Stay slightly behind the player, not exactly on top
          this.navigateToWorldTarget(this.targetWithWorld(this.playerSprite.x, this.playerSprite.y + 32));
        }
      }
    }

    // Waypoint following takes priority over random wandering
    if (!conversationLocked && this.pathing?.isMoving()) {
      const status = this.pathing.update(this.sprite, this.scene, 300, this.movementSpeedMultiplier);
      if (status === 'arrived') {
        this.navigationTarget = null;
        this.stopMovement();
        this.timer = 1.5;
      } else if (status === 'failed') {
        this.emitNavigationFailed('stuck_or_timeout');
        this.stopMovement();
        this.timer = 1.5;
      } else if (status === 'moving') {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        this.velX = body.velocity.x;
        this.velY = body.velocity.y;
        this.mode = 'walk';
      }
    } else if (!conversationLocked) {
      // Consume next planned action when idle
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.waitingForConfirm) {
          this.timer = 1; // keep waiting
        } else if (this.plannedActions.length > 0) {
          this.executeAction(this.plannedActions.shift()!, absoluteGameMinutes);
        } else if (!this.allowsIdleAutonomy()) {
          this.stopMovement();
          this.timer = 1.5;
        } else {
          this.randomWander();
        }
      }
    }

    // Apply velocity (PathinComponent already sets velocity on the sprite body)
    if (conversationLocked || !this.pathing?.isMoving()) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(this.velX, this.velY);
    }
    this.constrainByTempleMask(dt);

    // Speech timer — skip auto-dismiss while the NPC is thinking
    if (!this._isThinking && this.speechTimer > 0) {
      this.speechTimer -= dt;
      if (this.speechTimer <= 0) {
        this.safeSetBubbleVisible(false);
      }
    }

    this.updateAnimation();
    this.sprite.setDepth(this.sprite.y + 96);

    this.updateLabelPositions();
  }

  // ── Action execution ───────────────────────────────────────────────────────
  private executeAction(action: NpcAction, absoluteGameMinutes: number): void {
    if (this.isDowned()) return;
    switch (action.type) {
      case 'say': {
        const text = action.text ?? '';
        this.say(text, absoluteGameMinutes);
        this.timer = action.duration ?? 4;
        break;
      }
      case 'move':
      case 'water': {
        // target must be pre-resolved to 'coords' by ActionExecutor before queuing
        if (action.target?.kind === 'coords') {
          this.navigateToWorldTarget(action.target);
        } else if (action.target?.kind === 'named') {
          this.say(`我还不知道“${action.target.place}”在哪里。`, absoluteGameMinutes);
        } else {
          // Legacy fallback (x/y fields no longer used)
          this.navigateTo(this.sprite.x, this.sprite.y);
        }
        this.timer = action.duration ?? 3;
        break;
      }
      case 'idle':
        this.stopMovement();
        this.timer = action.duration ?? 3;
        break;

      case 'eat': {
        const eaten = this.worldCtx?.consumeNpcFood?.(this.name, 0, action.itemId) ?? null;
        if (!eaten) {
          console.warn('[Npc] eat: no edible food available', { npcName: this.name, itemId: action.itemId, absoluteGameMinutes });
        } else {
          this.say(formatNpcEatFeedback(eaten), absoluteGameMinutes);
        }
        this.timer = action.duration ?? 2;
        break;
      }

      case 'pickup_item': {
        console.log(`[Npc] executeAction pickup_item: itemId=${action.itemId} target=`, action.target);
        // target is pre-resolved to coords by ActionExecutor before queuing
        if (action.target?.kind === 'coords' && action.itemId) {
          const itemId = action.itemId;
          const target = this.targetWithWorld(action.target.x, action.target.y, action.target.worldId);
          this.navigateToWorldTarget(target, () => {
            console.log(`[Npc] pickup_item onArrive: claiming itemId=${itemId}`);
            // Use worldCtx if available (immediate path), else fall back to callback
            if (this.worldCtx) {
              this.worldCtx.claimWorldItem(itemId, this.name, target);
            } else {
              gameBus.emit('npc:pickup_world_item', { npcName: this.name, itemId, qty: 1 });
            }
          });
        }
        this.timer = action.duration ?? 3;
        break;
      }

      case 'chop_tree': {
        // Re-find the nearest tree at execution time (NPC may have moved since queue was built)
        const treeTarget = (() => {
          const treeId = action.treeId ?? action.itemId;
          if (action.target?.kind === 'coords' && treeId) {
            return { id: treeId, x: action.target.x, y: action.target.y };
          }
          return this.worldCtx?.findNearestTree(this.sprite.x, this.sprite.y) ?? null;
        })();

        console.log(`[Npc] executeAction chop_tree: worldCtx=${!!this.worldCtx} treeTarget=`, treeTarget);
        if (treeTarget) {
          const { id: treeId, x, y } = treeTarget;
          this.navigateToWorldTarget(this.targetWithWorld(x, y, action.target?.kind === 'coords' ? action.target.worldId : undefined), () => {
            console.log(`[Npc] chop_tree onArrive: chopping treeId=${treeId}`);
            if (this.worldCtx) {
              this.worldCtx.chopTreeById(treeId);
            } else {
              gameBus.emit('npc:chop_tree', { npcName: this.name, treeId });
            }
          });
        } else {
          console.warn('[Npc] chop_tree: no tree found!');
        }
        this.timer = action.duration ?? 5;
        break;
      }

      case 'pick_fruit': {
        if (this.worldCtx?.canUseNpcKnowledgeSkill?.(this.name, 'pick_apple_tree_day') === false) {
          console.warn('[Npc] pick_fruit blocked by missing parent skill', { npcName: this.name, absoluteGameMinutes });
          this.timer = action.duration ?? 1;
          break;
        }
        const treeTarget = (() => {
          if (action.target?.kind === 'coords' && action.treeId) {
            return { id: action.treeId, x: action.target.x, y: action.target.y, worldId: action.target.worldId };
          }
          return this.worldCtx?.findNearestFruitTree?.(this.sprite.x, this.sprite.y) ?? null;
        })();

        if (treeTarget) {
          const { id: treeId, x, y, worldId } = treeTarget;
          this.navigateToWorldTarget(this.targetWithWorld(x, y, worldId), () => {
            const ok = this.worldCtx?.pickFruitById?.(treeId, this.name);
            if (!ok) console.warn('[Npc] pick_fruit: fruit was not ready on arrival', { npcName: this.name, treeId, absoluteGameMinutes });
          });
        } else {
          console.warn('[Npc] pick_fruit: no ripe fruit tree nearby', { npcName: this.name, absoluteGameMinutes });
        }
        this.timer = action.duration ?? 4;
        break;
      }

      case 'remember_food_sources': {
        const sources = Array.isArray(action.foodSources) ? action.foodSources : [];
        const ok = this.worldCtx?.rememberFoodSourcesForNpc?.(this.name, sources, absoluteGameMinutes, 'mcp') ?? false;
        if (!ok) {
          console.warn('[Npc] remember_food_sources failed', {
            npcName: this.name,
            sourceCount: sources.length,
            absoluteGameMinutes,
          });
        }
        this.timer = action.duration ?? 1;
        break;
      }

      case 'drop_item': {
        const itemId = action.itemId;
        if (itemId) {
          const x = this.sprite.x;
          const y = this.sprite.y;
          if (this.worldCtx) {
            this.worldCtx.dropWorldItem(x, y, itemId, this.name);
          } else {
            const scene = this.sprite.scene as any;
            gameBus.emit('npc:drop_item', {
              npcName: this.name,
              itemId,
              qty: 1,
              x,
              y,
              worldId: scene?.actorWorldPresence?.getActorWorldId?.(this.name, scene?.mapRuntimeManager?.getActiveWorldId?.())
                ?? scene?.mapRuntimeManager?.getActiveWorldId?.(),
            });
          }
        }
        this.timer = action.duration ?? 1;
        break;
      }

      case 'ask_confirm': {
        const question = action.question ?? action.text ?? '确认吗？';
        this.say(question, absoluteGameMinutes);
        this.waitingForConfirm = true;
        this.clearNavigation();
        gameBus.emit('npc:ask_confirm', { npcName: this.name, question });
        this.timer = action.duration ?? 1;
        break;
      }

      case 'follow_player':
        this.startFollowing();
        this.timer = 1;
        break;

      case 'stop_follow':
        this.stopFollowing();
        this.timer = 1;
        break;

      case 'dispatch': {
        // Grab whatever the NPC is carrying (sync provider, can't use bus)
        const carried = this._getNpcInventory?.(this.name) ?? {};
        this.startDispatch(carried);
        this.timer = 2;
        break;
      }

      case 'use_skill': {
        const aliased = normalizeNpcActionForRuntime(action);
        if (aliased.type !== 'use_skill') {
          this.executeAction(aliased, absoluteGameMinutes);
          return;
        }
        const executeKnowledgeSkill = this.worldCtx?.executeKnowledgeSkill;
        if (typeof executeKnowledgeSkill === 'function' && action.skillId) {
          if (this.worldCtx?.canUseNpcKnowledgeSkill?.(this.name, action.skillId) === false) {
            console.warn('[Npc] use_skill blocked by missing parent skill', { npcName: this.name, skillId: action.skillId, absoluteGameMinutes });
            this.timer = action.duration ?? 1;
            break;
          }
          const ok = executeKnowledgeSkill(
            this.name,
            action.skillId,
            { x: this.sprite.x, y: this.sprite.y },
            (x, y, worldId, onArrive) => this.navigateToWorldTarget(this.targetWithWorld(x, y, worldId), onArrive),
            absoluteGameMinutes,
          );
          if (!ok) this.say('这个我还没学会。', absoluteGameMinutes);
        }
        this.timer = action.duration ?? 2;
        break;
      }

      case 'talk_with': {
        const targetName = action.targetNpcName;
        const target = targetName ? this.worldCtx?.findNpcByName(targetName) : null;
        if (target && target !== this) {
          const standAt = this.worldCtx?.findConversationSpotForNpc(this.name, target.name) ?? {
            x: target.sprite.x + 42,
            y: target.sprite.y,
          };
          this.talkWithNpc(target, standAt, absoluteGameMinutes, action.duration ?? 14, action.text);
        }
        this.timer = action.duration ?? 14;
        break;
      }

      case 'enter_house': {
        const entry = this.worldCtx?.findHouseEntryTarget(action.houseId, this.name);
        const target = action.target?.kind === 'coords'
          ? { houseId: action.houseId ?? entry?.houseId, roomId: action.roomId ?? entry?.roomId, x: action.target.x, y: action.target.y }
          : entry;
        if (target?.houseId) {
          const targetHouseId = target.houseId;
          this.navigateToWorldTarget(this.targetWithWorld(target.x, target.y + 40), () => {
            const ok = this.worldCtx?.enterHouseForNpc(this.name, targetHouseId);
            if (!ok) this.say('I could not enter the house.', absoluteGameMinutes);
          });
        } else {
          this.say('I cannot find that house door.', absoluteGameMinutes);
        }
        this.timer = action.duration ?? 4;
        break;
      }

      case 'remember_home_house': {
        const entry = this.worldCtx?.findHouseEntryTarget(action.houseId, this.name);
        if (entry?.houseId) {
          const ok = this.worldCtx?.rememberHomeHouseForNpc(this.name, entry.houseId, absoluteGameMinutes);
          if (ok) this.say('I will remember this as my home.', absoluteGameMinutes);
        } else {
          this.say('I cannot tell which house is mine yet.', absoluteGameMinutes);
        }
        this.timer = action.duration ?? 2;
        break;
      }

      case 'till_tile':
      case 'water_tile':
      case 'plant_crop':
      case 'harvest_crop': {
        if (this.worldCtx) {
          const kind = action.type === 'till_tile'
            ? 'till'
            : action.type === 'water_tile'
              ? 'water'
              : action.type === 'plant_crop'
                ? 'plant'
                : 'harvest';
          const requiredSkillId = FARM_ACTION_SKILL_BY_KIND[kind];
          if (this.worldCtx.canUseNpcKnowledgeSkill?.(this.name, requiredSkillId) === false) {
            console.warn('[Npc] farm action blocked by missing parent skill', {
              npcName: this.name,
              action: kind,
              requiredSkillId,
              absoluteGameMinutes,
            });
            this.timer = action.duration ?? 1;
            break;
          }
          const target = typeof action.tx === 'number' && typeof action.ty === 'number'
            ? {
                tx: action.tx,
                ty: action.ty,
                x: action.tx * 32 + 16,
                y: action.ty * 32 + 16,
                worldId: action.target?.kind === 'coords' ? action.target.worldId : this.worldCtx.getNpcWorldId?.(this.name),
              }
            : this.worldCtx.findFarmTarget(kind, this.sprite.x, this.sprite.y, 12, this.name, this.worldCtx.getNpcWorldId?.(this.name));
          if (target) {
            this.navigateToWorldTarget(this.targetWithWorld(target.x, target.y, target.worldId), () => {
              this.worldCtx?.performFarmAction(this.name, kind, target, action.itemId);
            });
          }
        }
        this.timer = action.duration ?? 3;
        break;
      }

      default:
        this.stopMovement();
        this.timer = 3;
    }
  }

  /**
   * Push pre-resolved actions into the planned queue for sequential execution.
   * Called by ActionExecutor when say+move sequencing is required.
   */
  queueActions(actions: NpcAction[], _absoluteGameMinutes: number): void {
    if (!this.sprite.visible) return;
    this.plannedActions.push(...actions);
  }

  replaceActions(actions: NpcAction[], _absoluteGameMinutes: number): void {
    if (!this.sprite.visible) return;
    this.clearNavigation();
    this.plannedActions = [...actions];
    this.timer = 0;
  }

  say(text: string, absoluteGameMinutes: number): void {
    if (!this.isAlive() || !this.sprite.visible) return;
    const normalized = text.trim();
    if (!normalized || normalized === '-' || normalized === '...') return;
    this._isThinking = false;
    if (!this.safeSetBubbleText(normalized, true)) return;
    this.speechTimer = 4.5;
    this.timer = Math.max(this.timer, NPC_REPLY_HOLD_SECONDS);
    this.addMemory(normalized, 'npc', absoluteGameMinutes);
    gameBus.emit('npc:speak', { text: normalized, npcName: this.name });
    gameBus.emit('dialogue:npc_spoke', {
      npcName: this.name,
      text: normalized,
      x: this.sprite.x,
      y: this.sprite.y,
    });
  }

  /** True if player is within radius pixels of this NPC. */
  isNearPlayer(px: number, py: number, radius = 100): boolean {
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  /**
   * Show / hide the "thinking" indicator in the speech bubble.
   * While thinking=true the auto-dismiss timer is paused.
   */
  setThinking(thinking: boolean, options: NpcThinkingOptions = {}): void {
    if (!this.isAlive()) {
      this._isThinking = false;
      return;
    }
    this._isThinking = thinking;
    if (thinking) {
      if (options.holdPosition) {
        this.stopFollowing();
        this.clearNavigation();
      }
      this.safeSetBubbleText('...', true);
      this.speechTimer = 0;   // will stay visible until setThinking(false)
    } else {
      // If still showing the placeholder, hide it (say() will show the reply)
      if (this.canMutateText(this.bubbleText) && this.bubbleText.text === '...') {
        this.safeSetBubbleVisible(false);
      }
    }
  }

  isThinking(): boolean {
    return this._isThinking;
  }

  isSpeaking(): boolean {
    return this.canMutateText(this.bubbleText) ? this.bubbleText.visible : false;
  }

  setBrainEnabled(enabled: boolean): void {
    this.brainEnabled = enabled;
    if (!enabled) {
      this.setThinking(false);
    }
  }

  isBrainEnabled(): boolean {
    return this.brainEnabled;
  }

  getHealth(): number {
    return this.health;
  }

  setHealth(value: unknown): void {
    const next = normalizeActorHealth(value);
    if (next === this.health) return;
    this.health = next;
    if (this.isDowned()) this.stopForDowned();
    gameBus.emit('npc:health_changed', {
      npcName: this.name,
      health: this.health,
      max: MAX_ACTOR_HEALTH,
      downed: this.isDowned(),
    });
  }

  damage(amount: number): number {
    const before = this.health;
    this.setHealth(before - Number(amount || 0));
    const changed = before - this.health;
    if (changed > 0) gameBus.emit('game:save_requested', { reason: `npc:${this.name}:damage` });
    return changed;
  }

  heal(amount: number): number {
    const before = this.health;
    this.setHealth(before + Number(amount || 0));
    const changed = this.health - before;
    if (changed > 0) gameBus.emit('game:save_requested', { reason: `npc:${this.name}:heal` });
    return changed;
  }

  isDowned(): boolean {
    return this.health <= 0;
  }

  setAutonomyMode(mode: NpcAutonomyMode): void {
    this.autonomyMode = mode;
  }

  setFacing(direction: 'up' | 'down' | 'left' | 'right'): void {
    this.stopMovement();
    this.sprite.play(`idle-${direction}`);
  }

  setMovementPolicy(policy: NpcMovementPolicy): void {
    this.movementPolicy = policy;
    if (this.isStationary()) {
      this.stopFollowing();
      this.clearNavigation();
    }
  }

  isStationary(): boolean {
    return this.movementPolicy === 'stationary';
  }

  private stopForDowned(): void {
    this.stopFollowing();
    this.clearNavigation();
    this.plannedActions = [];
    this.waitingForConfirm = false;
    this.conversationLockTimer = 0;
    this.conversationPartner = null;
    this._isThinking = false;
    this.stopMovement();
    this.updateAnimation();
    this.sprite.setDepth(this.sprite.y + 96);
  }

  getAutonomyMode(): NpcAutonomyMode {
    return this.autonomyMode;
  }

  isAwaitingConfirm(): boolean {
    return this.waitingForConfirm;
  }

  isFollowingPlayer(): boolean {
    return this.isFollowing;
  }

  isOnDispatch(): boolean {
    return this.isDispatched;
  }

  isConversationLocked(): boolean {
    return this.conversationLockTimer > 0;
  }

  hasPlannedActions(): boolean {
    return this.plannedActions.length > 0;
  }

  isNavigating(): boolean {
    return this.pathing?.isMoving() ?? false;
  }

  isAlive(): boolean {
    return Boolean(!this.destroyed && this.sprite?.active && this.sprite?.scene);
  }

  getPathDebugPoints(): [number, number][] {
    const waypoints = this.pathing?.getWaypoints() ?? [];
    if (waypoints.length === 0) return [];
    return [[this.sprite.x, this.sprite.y], ...waypoints];
  }

  private emitNavigationFailed(reason: string): void {
    const target = this.navigationTarget;
    if (!target) return;
    gameBus.emit('npc:navigation_failed', {
      npcName: this.name,
          x: this.sprite.x,
          y: this.sprite.y,
          worldId: this.worldCtx?.getWorldIdAt?.(this.sprite.x, this.sprite.y),
          targetX: target.x,
          targetY: target.y,
          targetWorldId: target.worldId,
          reason,
        });
    this.navigationTarget = null;
  }

  private allowsIdleAutonomy(): boolean {
    if (this.isStationary()) return false;
    return this.autonomyMode === 'free' || this.autonomyMode === 'social';
  }

  destroy(): void {
    this.destroyed = true;
    this.sprite.destroy();
    this.labelText?.destroy();
    this.bubbleText?.destroy();
  }

  private startMoveTo(tx: number, ty: number): void {
    const dx  = tx - this.sprite.x;
    const dy  = ty - this.sprite.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const speed = this.currentMovementSpeed();
      this.velX = (dx / len) * speed;
      this.velY = (dy / len) * speed;
      this.mode = 'walk';
    }
  }

  private stopMovement(): void {
    this.velX = 0;
    this.velY = 0;
    this.mode = 'idle';
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.setVelocity(0, 0);
  }

  private constrainByTempleMask(deltaSeconds: number): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const worldId = this.getCurrentWorldId();
    const bounds = this.getActorMaskBounds();
    (this.scene as any).actorMovementBoundary?.enforceSprite?.({
      kind: 'npc',
      id: this.name,
      worldId: worldId ?? 'world:main',
      x: this.sprite.x,
      y: this.sprite.y,
      halfWidth: bounds.halfWidth,
      halfHeight: bounds.halfHeight,
      tags: this.getCatalogTags(),
    }, this.sprite);

    let nextVx = body.velocity.x;
    let nextVy = body.velocity.y;

    if (nextVx !== 0 && !this.canMoveAlongTempleMaskAxis(nextVx, 0, 'x', deltaSeconds, worldId)) {
      nextVx = 0;
    }
    if (nextVy !== 0 && !this.canMoveAlongTempleMaskAxis(0, nextVy, 'y', deltaSeconds, worldId)) {
      nextVy = 0;
    }

    if (nextVx !== body.velocity.x || nextVy !== body.velocity.y) {
      body.setVelocity(nextVx, nextVy);
    }
    this.velX = nextVx;
    this.velY = nextVy;
    if (nextVx === 0 && nextVy === 0) this.mode = 'idle';
  }

  private canMoveAlongTempleMaskAxis(
    vx: number,
    vy: number,
    axis: 'x' | 'y',
    deltaSeconds: number,
    worldId: string | undefined,
  ): boolean {
    const stepSeconds = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 1 / 60;
    const bounds = this.getActorMaskBounds();
    return (this.scene as any).actorMovementBoundary?.canMoveAxis?.({
      kind: 'npc',
      id: this.name,
      worldId: worldId ?? 'world:main',
      x: this.sprite.x,
      y: this.sprite.y,
      halfWidth: bounds.halfWidth,
      halfHeight: bounds.halfHeight,
      tags: this.getCatalogTags(),
    }, this.sprite.x + vx * stepSeconds, this.sprite.y + vy * stepSeconds, axis) ?? true;
  }

  private getActorMaskBounds(): { halfWidth: number; halfHeight: number } {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return { halfWidth: 0, halfHeight: 0 };
    return { halfWidth: body.width / 2, halfHeight: body.height / 2 };
  }

  private getCurrentWorldId(): string | undefined {
    const scene = this.scene as any;
    const activeWorldId = scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? scene.currentMapDefinition?.ref?.worldId;
    return scene.actorWorldPresence?.getActorWorldId?.(this.name, activeWorldId)
      ?? this.worldCtx?.getWorldIdAt?.(this.sprite.x, this.sprite.y)
      ?? activeWorldId;
  }

  private getCatalogTags(): string[] {
    const definition = getNpcDefinitionById(this.name);
    return Array.isArray(definition?.tags) ? definition.tags.map((entry) => String(entry)) : [];
  }

  faceToward(tx: number, ty: number): void {
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    const dir = this.velToDir(dx, dy);
    this.sprite.play(`idle-${dir}`);
  }

  private randomWander(): void {
    if (this.isStationary()) {
      this.stopMovement();
      this.timer = 2;
      return;
    }
    if (Math.random() < 0.55 * this.idleMovementDesire) {
      const angle = Math.random() * Math.PI * 2;
      const speed = this.currentMovementSpeed();
      const duration = 1.2 + Math.random() * 2;
      const targetX = this.sprite.x + Math.cos(angle) * speed * duration;
      const targetY = this.sprite.y + Math.sin(angle) * speed * duration;
      if (this.pathing) {
        this.pathing.navigateTo(this.sprite.x, this.sprite.y, targetX, targetY);
        if (this.pathing.status !== 'failed') {
          this.mode = 'walk';
          this.timer = duration;
          return;
        }
        this.stopMovement();
        this.timer = 1.5 + Math.random() * 2;
        return;
      }
      this.velX = Math.cos(angle) * speed;
      this.velY = Math.sin(angle) * speed;
      this.mode = 'walk';
      this.timer = duration;
    } else {
      this.stopMovement();
      this.timer = 1.5 + (1 - this.idleMovementDesire) * 2 + Math.random() * 2.5;
    }
  }

  private currentMovementSpeed(): number {
    return NPC_SPEED * this.movementSpeedMultiplier;
  }

  private updateAnimation(): void {
    if (this.mode === 'walk' && (this.velX !== 0 || this.velY !== 0)) {
      const dir = this.velToDir(this.velX, this.velY);
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

  private velToDir(vx: number, vy: number): string {
    if (Math.abs(vy) > Math.abs(vx) * 1.6) return vy < 0 ? 'up' : 'down';
    return vx < 0 ? 'left' : 'right';
  }

  // ── GPT think ──────────────────────────────────────────────────────────────
  async runLegacyThinkForDebug(absoluteGameMinutes: number): Promise<void> {
    void absoluteGameMinutes;
    return;
    const token = '';
    try {
      // Memory is now loaded server-side from the DB — no need to send it here.
      const res = await fetch('/api/profile/npc/think', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body:    JSON.stringify({ npcName: this.name, absoluteGameMinutes }),
      });
      if (!res.ok) return;
      const plan = await res.json() as { actions?: NpcAction[] };
      const actions: NpcAction[] = plan.actions ?? [];
      if (actions.length > 0) {
        // Append new planned actions (don't discard existing queue)
        this.plannedActions.push(...actions);
      }
    } catch {
      // Network / parse error — silently ignore, fall back to random wander
    }
  }
}
