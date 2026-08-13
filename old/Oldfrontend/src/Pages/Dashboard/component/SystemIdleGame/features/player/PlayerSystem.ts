import Phaser from 'phaser';
import type { SlotItem } from '../../../../../../Redux/Features/gameSlice';
import { Player } from '../../entities/Player';
import { gameBus } from '../../shared/EventBus';
import { getFoodHungerRestore, getFoodLabel, PLAYER_MAX_HUNGER } from '../../shared/food';
import { MAX_ACTOR_HEALTH } from '../../shared/health';
import { isFlashlightItem } from '../../shared/flashlight';
import type { Pathfinder } from '../../systems/Pathfinder';
import type { Direction, ToolType } from '../../types';

interface PlayerSystemOptions {
  scene: Phaser.Scene;
}

interface CreatePlayerOptions {
  x: number;
  y: number;
  facing: Direction;
  hunger?: number;
  health?: number;
}

interface PlayerInteractionStateWriter {
  getEntity?(id: string): unknown;
  registerEntity?(entity: Record<string, unknown>): void;
  updateEntityPosition(id: string, x: number, y: number, worldId?: string): void;
  patchEntity(id: string, patch: Record<string, unknown>): void;
}

export class PlayerSystem {
  private readonly scene: Phaser.Scene;
  private player: Player | null = null;
  private flashlightOn = false;

  constructor(options: PlayerSystemOptions) {
    this.scene = options.scene;
  }

  createLocalPlayer(options: CreatePlayerOptions): Player {
    const player = new Player(this.scene, options.x, options.y);
    player.facing = options.facing;
    player.sprite.play(`idle-${options.facing}`);
    player.setHunger(options.hunger ?? PLAYER_MAX_HUNGER);
    player.setHealth(options.health ?? MAX_ACTOR_HEALTH);
    this.player = player;
    return player;
  }

  getPlayer(): Player | null {
    return this.player;
  }

  getSprite(): Phaser.Physics.Arcade.Sprite | null {
    return this.player?.sprite ?? null;
  }

  getPosition(): { x: number; y: number } | null {
    const sprite = this.player?.sprite;
    return sprite ? { x: sprite.x, y: sprite.y } : null;
  }

  getHunger(): number {
    return this.player?.getHunger() ?? PLAYER_MAX_HUNGER;
  }

  setHunger(hunger: number): void {
    this.player?.setHunger(hunger);
  }

  getHealth(): number {
    return this.player?.getHealth() ?? MAX_ACTOR_HEALTH;
  }

  setHealth(health: number): void {
    this.player?.setHealth(health);
  }

  getMovementSpeed(): number | null {
    return this.player?.getMovementSpeed() ?? null;
  }

  setMovementSpeed(speed: number): void {
    this.player?.setMovementSpeed(speed);
  }

  damage(amount: number): number {
    return this.player?.damage(amount) ?? 0;
  }

  heal(amount: number): number {
    return this.player?.heal(amount) ?? 0;
  }

  isDowned(): boolean {
    return this.player?.isDowned() ?? false;
  }

  setPosition(x: number, y: number, facing?: Direction): void {
    if (!this.player) return;
    this.player.sprite.setPosition(x, y);
    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    body?.reset?.(x, y);
    if (facing) {
      this.player.facing = facing;
      this.player.sprite.play(`idle-${facing}`);
    }
  }

  setTool(tool: ToolType): void {
    this.player?.setTool(tool);
  }

  setHeldSlotItem(slotItem: SlotItem | null | undefined): void {
    if (!this.player) return;
    (this.player as any).heldItemId = slotItem?.itemId || undefined;
    (this.player as any).heldSlotItem = slotItem ?? null;
  }

  getHeldItemId(): string | undefined {
    return (this.player as any)?.heldItemId as string | undefined;
  }

  consumeFood(itemId: string): boolean {
    const restore = getFoodHungerRestore(itemId);
    if (restore <= 0 || !this.player) return false;
    if (this.player.isDowned()) {
      gameBus.emit('ui:show_message', { text: 'Cannot eat while downed.' });
      return false;
    }

    const previousHunger = this.player.getHunger();
    if (previousHunger >= PLAYER_MAX_HUNGER) {
      gameBus.emit('ui:show_message', { text: 'Already full.' });
      return false;
    }

    const restored = this.player.restoreHunger(restore);
    if (restored <= 0) return false;

    gameBus.emit('player:consume_item', {
      itemId,
      qty: 1,
      action: 'eat',
      previousHunger,
    });
    gameBus.emit('entity:action_sound', {
      action: 'eat',
      itemId,
      actorId: 'player',
      actorKind: 'player',
      x: this.player.sprite.x,
      y: this.player.sprite.y,
      worldId: this.getPlayerWorldId(),
      source: 'local',
    });
    gameBus.emit('ui:show_message', {
      text: `Ate ${getFoodLabel(itemId)}, hunger +${restored}`,
    });
    gameBus.emit('game:save_requested', { reason: 'player:eat' });
    return true;
  }

  dropItem(itemId: string): void {
    (this.scene as any).worldFacade?.dropPlayerItem(itemId);
  }

  navigateTo(x: number, y: number, pathfinder: Pathfinder | null, onArrive?: () => void): boolean {
    return this.player?.navigateTo(x, y, pathfinder, onArrive) ?? false;
  }

  clearNavigation(): void {
    this.player?.clearNavigation();
  }

  enforceTempleMaskBounds(): boolean {
    if (!this.player?.sprite) return false;
    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    const clamped = (this.scene as any).actorMovementBoundary?.enforceSprite?.({
      kind: 'player',
      id: 'player',
      worldId: this.getPlayerWorldId() ?? 'world:main',
      x: this.player.sprite.x,
      y: this.player.sprite.y,
      halfWidth: (body?.width ?? 0) / 2,
      halfHeight: (body?.height ?? 0) / 2,
    }, this.player.sprite) ?? false;
    if (clamped) this.player.clearNavigation();
    return clamped;
  }

  syncInteractionState(worldStateManager: PlayerInteractionStateWriter | null | undefined): void {
    if (!worldStateManager || !this.player?.sprite) return;
    const worldId = (this.scene as any).mapRuntimeManager?.getActiveWorldId?.()
      ?? (this.scene as any).currentMapDefinition?.ref?.worldId;
    if (!worldStateManager.getEntity?.('player')) {
      worldStateManager.registerEntity?.({
        id: 'player',
        kind: 'player',
        x: this.player.sprite.x,
        y: this.player.sprite.y,
        worldId,
        facing: this.player.facing,
        meta: {
          interactable: false,
          health: this.player.getHealth(),
          maxHealth: MAX_ACTOR_HEALTH,
          downed: this.player.isDowned(),
        },
      });
    } else {
      worldStateManager.updateEntityPosition('player', this.player.sprite.x, this.player.sprite.y, worldId);
    }
    worldStateManager.patchEntity('player', {
      worldId,
      facing: this.player.facing,
      meta: {
        interactable: false,
        health: this.player.getHealth(),
        maxHealth: MAX_ACTOR_HEALTH,
        downed: this.player.isDowned(),
      },
    });
  }

  update(dtSeconds: number, gameMinutesDelta: number, inputPaused: boolean): void {
    if (!this.player) return;
    if (inputPaused) {
      const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      this.player.tickHunger?.(dtSeconds, gameMinutesDelta);
      return;
    }
    this.player.update(dtSeconds, gameMinutesDelta);
  }

  tryToggleFlashlight(): boolean {
    const heldItemId = this.getHeldItemId();
    if (!isFlashlightItem(heldItemId)) return false;

    this.flashlightOn = !this.flashlightOn;
    gameBus.emit('mp:relay', {
      type: 'player_flashlight',
      payload: {
        on: this.flashlightOn,
        facing: this.player?.facing ?? 'down',
        x: this.player?.sprite?.x ?? 0,
        y: this.player?.sprite?.y ?? 0,
        worldId: (this.player?.sprite?.scene as any)?.mapRuntimeManager?.getActiveWorldId?.(),
      },
    });
    gameBus.emit('ui:show_message', {
      text: this.flashlightOn ? 'Flashlight on' : 'Flashlight off',
    });
    return true;
  }

  isFlashlightOn(): boolean {
    return this.flashlightOn;
  }

  isFlashlightActive(): boolean {
    return this.flashlightOn && isFlashlightItem(this.getHeldItemId());
  }

  private getPlayerWorldId(): string | undefined {
    const scene = this.scene as any;
    return scene.actorWorldPresence?.getActorWorldId?.('player')
      ?? scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? scene.currentMapDefinition?.ref?.worldId;
  }
}
