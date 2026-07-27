import Phaser from 'phaser';
import type { Interactable } from '../../../../types';
import { ensureVisualKeyTexture } from '../../../../visuals';
import { LAYER } from '../../../../world/utils';
import { rectsFromCollisionBoxes } from '../../../collision';
import type {
  BuildingDefinition,
  BuildingInstanceSave,
  BuildingStageDefinition,
} from '../../BuildingTypes';

function cloneBuilding(building: BuildingInstanceSave): BuildingInstanceSave {
  return { ...building, meta: { ...(building.meta ?? {}) } };
}

function stageVisualKey(
  stages: BuildingStageDefinition[] | null | undefined,
  startedAtGameMinute: number,
  absoluteGameMinutes: number,
): string | null {
  if (!Array.isArray(stages) || stages.length === 0) return null;
  const elapsed = Math.max(0, Number(absoluteGameMinutes) - Number(startedAtGameMinute || 0));
  let cursor = 0;
  for (const stage of stages) {
    cursor += Math.max(0, Number(stage.durationGameMinutes || 0));
    if (elapsed < cursor) return stage.visualKey;
  }
  return stages[stages.length - 1]?.visualKey ?? null;
}

function greenhouseTextureKey(visualKey: string | null | undefined): string | null {
  if (!visualKey) return null;
  const normalized = String(visualKey).replace(/\\/g, '/');
  const stage = normalized.match(/^house\/greenhouse[_-]step([0-4])$/);
  if (stage) return `house-greenhouse-step${stage[1]}`;
  if (normalized === 'house/greenhouse_open') return 'house-greenhouse-open';
  if (normalized === 'house/greenhouse' || normalized.startsWith('house/greenhouse_lv')) {
    return 'house-greenhouse-close';
  }
  return null;
}

function resolveTextureKey(
  scene: Phaser.Scene,
  building: BuildingInstanceSave,
  definition: BuildingDefinition,
  absoluteGameMinutes: number,
): string {
  let visualKey: string | null | undefined;
  if (building.state === 'planned') {
    visualKey = definition.constructionStages?.[0]?.visualKey;
  } else if (building.state === 'constructing' && building.constructionJob) {
    visualKey = stageVisualKey(
      definition.constructionStages,
      building.constructionJob.startedAtGameMinute,
      absoluteGameMinutes,
    );
  } else if (building.state === 'upgrading' && building.upgradeJob) {
    const currentLevel = definition.levels.find((level) => level.level === building.level);
    const targetLevel = definition.levels.find((level) => level.level === building.upgradeJob?.toLevel);
    visualKey = stageVisualKey(
      currentLevel?.upgradeStages ?? targetLevel?.upgradeStages,
      building.upgradeJob.startedAtGameMinute,
      absoluteGameMinutes,
    );
  }

  if (!visualKey) {
    const level = definition.levels.find((entry) => entry.level === building.level);
    visualKey = level?.visualKey || definition.visualKey || 'house/greenhouse';
  }

  const knownTexture = greenhouseTextureKey(visualKey);
  if (knownTexture && scene.textures.exists(knownTexture)) return knownTexture;
  return ensureVisualKeyTexture(scene, visualKey, {
    namespace: 'building',
    size: 64,
    fallbackTint: building.state === 'constructing' ? 0x8c7a55 : 0x70b76c,
  });
}

export class HouseBuildingView implements Interactable {
  readonly id: string;
  building: BuildingInstanceSave;

  private definition: BuildingDefinition;
  private readonly image: Phaser.GameObjects.Image;
  private blockerId: string | null = null;
  private lastBlockerKey = '';

  constructor(private readonly scene: any, building: BuildingInstanceSave, definition: BuildingDefinition) {
    this.id = building.id;
    this.building = cloneBuilding(building);
    this.definition = definition;
    this.image = scene.add.image(
      building.x,
      building.y,
      resolveTextureKey(scene, building, definition, scene.dayCycle?.absoluteGameMinutes ?? building.createdAtGameMinute ?? 0),
    );
    this.image.setDisplaySize(definition.displaySize?.w ?? 260, definition.displaySize?.h ?? 242);
    this.image.setDepth(LAYER.WALL(building.y));
    this.image.setOrigin(0.5, 0.5);
    this.image.setData('buildingId', building.id);
    this.syncCollision();
  }

  updateBuilding(building: BuildingInstanceSave, definition: BuildingDefinition, absoluteGameMinutes: number): void {
    this.definition = definition;
    this.building = cloneBuilding(building);
    this.image.setPosition(building.x, building.y);
    this.image.setDepth(LAYER.WALL(building.y));
    this.image.setDisplaySize(definition.displaySize?.w ?? 260, definition.displaySize?.h ?? 242);
    this.updateStageVisual(absoluteGameMinutes);
    this.syncCollision();
  }

  updateStageVisual(absoluteGameMinutes: number): void {
    const textureKey = resolveTextureKey(this.scene, this.building, this.definition, absoluteGameMinutes);
    if (this.image.texture?.key !== textureKey) this.image.setTexture(textureKey);
  }

  interact(): void {
    this.scene.buildingSystem?.interact?.(this.building.id);
  }

  setRuntimeVisible(visible: boolean): void {
    this.image.setVisible(visible);
  }

  setVisible(visible: boolean): this {
    this.setRuntimeVisible(visible);
    return this;
  }

  isNearPlayer(x: number, y: number, radius = 40): boolean {
    const door = this.getDoorWorldPosition();
    return Phaser.Math.Distance.Between(x, y, door.x, door.y) <= radius;
  }

  isReady(): boolean {
    return this.building.state === 'idle' && Number(this.building.level || 0) >= 1;
  }

  getDoorWorldPosition(): { x: number; y: number } {
    const offset = this.definition.doorOffset ?? { x: 0, y: 64 };
    return {
      x: this.building.x + offset.x,
      y: this.building.y + offset.y,
    };
  }

  getEntryTriggerRect(): Phaser.Geom.Rectangle {
    const box = this.definition.entryTriggerBox ?? { x: -16, y: 50, w: 32, h: 28 };
    return new Phaser.Geom.Rectangle(
      this.building.x + box.x,
      this.building.y + box.y,
      box.w,
      box.h,
    );
  }

  getFootprint(): Phaser.Geom.Rectangle {
    const footprint = this.definition.footprint ?? { w: 6, h: 5 };
    return new Phaser.Geom.Rectangle(
      this.building.x - (footprint.w * 32) / 2,
      this.building.y - (footprint.h * 32) / 2,
      footprint.w * 32,
      footprint.h * 32,
    );
  }

  destroy(): void {
    if (this.blockerId) this.scene.collisionBlockers?.remove?.(this.blockerId);
    this.blockerId = null;
    this.image.destroy();
  }

  private syncCollision(): void {
    const key = JSON.stringify({
      x: this.building.x,
      y: this.building.y,
      boxes: this.definition.collisionBoxes ?? [],
    });
    if (key === this.lastBlockerKey) return;
    if (this.blockerId) this.scene.collisionBlockers?.remove?.(this.blockerId);
    this.blockerId = null;
    this.lastBlockerKey = key;
    const rects = rectsFromCollisionBoxes(
      { x: this.building.x, y: this.building.y },
      this.definition.collisionBoxes ?? [],
    );
    if (rects.length === 0) return;
    const id = `building:${this.building.worldId ?? 'world:main'}:${this.building.id}:house`;
    this.scene.collisionBlockers?.upsert?.({
      id,
      worldId: this.building.worldId ?? 'world:main',
      rects,
      blocksPlayer: true,
      blocksNpcNav: true,
      debugLabel: this.definition.name ?? 'house',
      debugKind: 'building',
    });
    this.blockerId = id;
  }
}
