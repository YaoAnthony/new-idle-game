import Phaser from 'phaser';
import { rectsFromCollisionBoxes } from '../../../collision';
import type { BuildingDefinition, BuildingInstanceSave } from '../../BuildingTypes';

const RUNTIME_KEY = '__dailyTaskBoardPromptRuntime';
const BUBBLE_TEXTURE_KEY = 'ui-dialog-box';
const PROMPT_FONT_KEY = 'sprout-pixel-7-8x14';
const BUBBLE_OFFSET_X = 25;
const BUBBLE_OFFSET_Y = -25;
const BUBBLE_DISPLAY_SIZE = 34;
const TEXT_OFFSET_X = 0.5;
const TEXT_OFFSET_Y = 1;

interface PromptEntry {
  building: BuildingInstanceSave;
  container: Phaser.GameObjects.Container;
  bubble: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  blockerId: string | null;
  collisionKey: string;
}

export class DailyTaskBoardPromptRuntime {
  private readonly prompts = new Map<string, PromptEntry>();

  constructor(private readonly scene: Phaser.Scene & Record<string, any>) {
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearAll());
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.clearAll());
  }

  ensure(building: BuildingInstanceSave, definition?: BuildingDefinition | null): void {
    const existing = this.prompts.get(building.id);
    if (existing) {
      existing.building = { ...building, meta: { ...(building.meta ?? {}) } };
      this.position(existing);
      this.syncCollision(existing, definition);
      return;
    }
    const entry = this.createPrompt(building);
    this.prompts.set(building.id, entry);
    this.position(entry);
    this.syncCollision(entry, definition);
  }

  remove(buildingId: string): void {
    const entry = this.prompts.get(buildingId);
    if (!entry) return;
    this.scene.tweens?.killTweensOf(entry.container);
    if (entry.blockerId) this.scene.collisionBlockers?.remove?.(entry.blockerId);
    entry.blockerId = null;
    entry.container.destroy(true);
    this.prompts.delete(buildingId);
    this.scene.__buildingSyncNavigationGrid?.();
  }

  update(playerPosition: { x: number; y: number } | null): void {
    const activeWorldId = this.scene.mapRuntimeManager?.getActiveWorldId?.()
      ?? this.scene.currentMapDefinition?.ref?.worldId
      ?? 'world:main';
    const inputPaused = Boolean(this.scene._chatOpen);
    for (const entry of this.prompts.values()) {
      const visible = Boolean(
        playerPosition
        && !inputPaused
        && entry.building.worldId === activeWorldId
        && this.wouldPressFInteractWith(entry),
      );
      entry.container.setVisible(visible);
      entry.container.setActive(visible);
      if (visible) this.position(entry);
    }
  }

  clearAll(): void {
    for (const buildingId of Array.from(this.prompts.keys())) {
      this.remove(buildingId);
    }
  }

  private createPrompt(building: BuildingInstanceSave): PromptEntry {
    const container = this.scene.add.container(building.x, building.y);
    container.setDepth(building.y + 430);
    container.setVisible(false);
    container.setActive(false);

    const bubbleTexture = this.scene.textures.exists(BUBBLE_TEXTURE_KEY) ? BUBBLE_TEXTURE_KEY : '__WHITE';
    const bubble = this.scene.add.image(0, 0, bubbleTexture);
    bubble.setOrigin(0.5);
    bubble.setDisplaySize(BUBBLE_DISPLAY_SIZE, BUBBLE_DISPLAY_SIZE);
    bubble.setAlpha(0.96);

    const text = this.scene.add.text(TEXT_OFFSET_X, TEXT_OFFSET_Y, 'F', {
      fontFamily: PROMPT_FONT_KEY,
      fontSize: '10px',
      color: '#3f2815',
      align: 'center',
      padding: { x: 0, y: 0 },
    });
    text.setOrigin(0.5);
    text.setResolution(2);

    container.add([bubble, text]);

    return {
      building: { ...building, meta: { ...(building.meta ?? {}) } },
      container,
      bubble,
      text,
      blockerId: null,
      collisionKey: '',
    };
  }

  private position(entry: PromptEntry): void {
    const x = entry.building.x + BUBBLE_OFFSET_X;
    const y = entry.building.y + BUBBLE_OFFSET_Y;
    entry.container.setPosition(x, y);
    entry.container.setDepth(entry.building.y + 430);
    entry.bubble.setDisplaySize(BUBBLE_DISPLAY_SIZE, BUBBLE_DISPLAY_SIZE);
    entry.text.setPosition(TEXT_OFFSET_X, TEXT_OFFSET_Y);
  }

  private syncCollision(entry: PromptEntry, definition?: BuildingDefinition | null): void {
    const boxes = Array.isArray(definition?.collisionBoxes) ? definition.collisionBoxes : [];
    const key = JSON.stringify({
      x: entry.building.x,
      y: entry.building.y,
      worldId: entry.building.worldId,
      boxes,
    });
    if (entry.collisionKey === key) return;
    if (entry.blockerId) this.scene.collisionBlockers?.remove?.(entry.blockerId);
    entry.blockerId = null;
    entry.collisionKey = key;
    if (boxes.length === 0) return;
    const id = `building:${entry.building.worldId ?? 'world:main'}:${entry.building.id}:daily-board`;
    this.scene.collisionBlockers?.upsert?.({
      id,
      worldId: entry.building.worldId ?? 'world:main',
      rects: rectsFromCollisionBoxes({ x: entry.building.x, y: entry.building.y }, boxes),
      blocksPlayer: true,
      blocksNpcNav: true,
      debugLabel: 'daily task board',
      debugKind: 'building',
    });
    entry.blockerId = id;
  }

  private wouldPressFInteractWith(entry: PromptEntry): boolean {
    const command = this.scene.interactionSystem?.resolvePrimaryInteraction?.({
      playerId: 'player',
      heldItemId: this.scene.playerSystem?.getHeldItemId?.(),
      currentTool: this.scene.player?.currentTool,
    });
    return command?.type === 'INTERACT_OBJECT'
      && command.objectId === `building_object_${entry.building.id}`;
  }
}

export function getDailyTaskBoardPromptRuntime(scene: Phaser.Scene & Record<string, any>): DailyTaskBoardPromptRuntime {
  if (!scene[RUNTIME_KEY]) {
    scene[RUNTIME_KEY] = new DailyTaskBoardPromptRuntime(scene);
  }
  return scene[RUNTIME_KEY] as DailyTaskBoardPromptRuntime;
}
