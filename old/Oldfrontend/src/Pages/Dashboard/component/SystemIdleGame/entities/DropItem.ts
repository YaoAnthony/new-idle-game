/**
 * DropItem — unified pickupable item in the game world.
 *
 * - Renders a pixel-art icon (cropped from existing textures or colored circle)
 * - Gently bobs up/down
 * - DropSystem handles automatic pickup when the player pickup box overlaps it.
 * - claimForNpc() for silent NPC collection
 */

import Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';
import { getGameItemDefinition, type GameItemDefinition } from '../shared/gameItems';
import { ensureItemTexture } from '../visuals';

// ── Constants ─────────────────────────────────────────────────────────────────
const PICKUP_RADIUS   = 44;  // px — legacy helper radius; DropSystem owns player auto-pickup.
const DISPLAY_SIZE    = 24;  // px — rendered size in world
const DEPTH           = 500; // render above ground/walls, below roof

// ── Item definitions ──────────────────────────────────────────────────────────

export interface ItemDef {
  itemId:       string;
  label:        string;
  tint?:        number;   // hex colour for circle fallback
  /** How the item behaves in the hotbar:
   *  'tool'       — equip & use via the bound interact key
   *  'placeable'  — press F to place as a world entity
   *  'consumable' — press F/E to use
   *  'other'      — material / stackable resource
   */
  itemType:     'tool' | 'placeable' | 'house_blueprint' | 'storage_chest' | 'consumable' | 'other';
  /** For itemType='placeable': which entity class to spawn. */
  placeEntity?: 'bed' | 'nest' | 'pet' | 'fence' | 'path' | 'building';
  buildingDefinitionId?: string;
}

export const ALL_ITEM_DEFS: ItemDef[] = [
  { itemId: 'storage_chest_basic', label: 'Storage Chest', tint: 0xb77a42, itemType: 'storage_chest', placeEntity: 'building', buildingDefinitionId: 'storage:basic' },
  { itemId: 'house_blueprint_greenhouse', label: '温室蓝图', tint: 0x70b76c, itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'house:greenhouse' },
  { itemId: 'fence', label: '木栅栏', itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'fence' },
  { itemId: 'path', label: '小路', itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'temple_path' },
  { itemId: 'watering_can', label: '水壶', itemType: 'tool' },
  { itemId: 'axe', label: '斧头', itemType: 'tool' },
  { itemId: 'scythe', label: '锄头', itemType: 'tool' },
  { itemId: 'shovel', label: '铲子', itemType: 'tool' },
  { itemId: 'flashlight', label: 'Flashlight', itemType: 'tool' },
  { itemId: 'wheat_seed', label: '小麦种子', itemType: 'consumable' },
  { itemId: 'tomato_seed', label: '番茄种子', itemType: 'consumable' },
  { itemId: 'wheat', label: '小麦', itemType: 'other' },
  { itemId: 'tomato', label: '番茄', itemType: 'consumable' },
  { itemId: 'fruit', label: '苹果', itemType: 'consumable' },
  { itemId: 'raspberry', label: '树莓', itemType: 'consumable' },
  { itemId: 'log', label: '木头', tint: 0x8B4513, itemType: 'other' },
  { itemId: 'stone', label: '石头', tint: 0x808080, itemType: 'other' },
  { itemId: 'berry', label: '浆果', tint: 0xFF4444, itemType: 'consumable' },
  { itemId: 'apple', label: '苹果', itemType: 'consumable' },
  { itemId: 'egg', label: '鸡蛋', tint: 0xFFF5C0, itemType: 'consumable' },
  { itemId: 'chicken_nest', label: '鸡窝', itemType: 'placeable', placeEntity: 'nest' },
  { itemId: 'bed_green', label: '绿色床', itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'bed_green' },
  { itemId: 'bed_blue', label: '蓝色床', itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'bed_blue' },
  { itemId: 'bed_pink', label: '粉色床', itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'bed_pink' },
  { itemId: 'bed_green_flipped', label: '绿色床（翻）', itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'bed_green_flipped' },
  { itemId: 'bed_blue_flipped', label: '蓝色床（翻）', itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'bed_blue_flipped' },
  { itemId: 'bed_pink_flipped', label: '粉色床（翻）', itemType: 'placeable', placeEntity: 'building', buildingDefinitionId: 'bed_pink_flipped' },
];

/** Just the starter tools placed on the house shelf. */
export const TOOL_ITEM_DEFS: ItemDef[] = ['watering_can', 'axe', 'scythe']
  .map((itemId) => ALL_ITEM_DEFS.find((def) => def.itemId === itemId))
  .filter((def): def is ItemDef => Boolean(def));

const STATIC_ITEM_DEF_MAP = new Map<string, ItemDef>(
  ALL_ITEM_DEFS.map(d => [d.itemId, d]),
);

function hasCapability(definition: GameItemDefinition, action: string): boolean {
  return definition.capabilities?.some((capability) => capability.action === action) ?? false;
}

function getCapabilityDefinitionId(definition: GameItemDefinition, action: string): string | undefined {
  const capability = definition.capabilities?.find((entry) => entry.action === action) as any;
  return capability?.requires?.definitionId || capability?.definitionId;
}

function itemTypeFromGameDefinition(definition: GameItemDefinition): ItemDef['itemType'] {
  if (definition.type === 'tool' || hasCapability(definition, 'water') || hasCapability(definition, 'till') || hasCapability(definition, 'chop')) {
    return 'tool';
  }
  if (hasCapability(definition, 'place_building')) return 'placeable';
  if (definition.type === 'house_blueprint') return 'house_blueprint';
  if (definition.type === 'storage' || hasCapability(definition, 'place_storage_chest')) return 'storage_chest';
  if (definition.type === 'furniture' || hasCapability(definition, 'place_furniture')) return 'placeable';
  if (hasCapability(definition, 'place_fence')) return 'placeable';
  if (hasCapability(definition, 'place_path')) return 'placeable';
  if (definition.type === 'pet' || hasCapability(definition, 'place_pet')) return 'placeable';
  if (definition.type === 'consumable' || definition.type === 'seed' || definition.type === 'crop' || hasCapability(definition, 'eat') || hasCapability(definition, 'plant')) {
    return 'consumable';
  }
  return 'other';
}

function placeEntityFromGameDefinition(definition: GameItemDefinition): ItemDef['placeEntity'] | undefined {
  if (hasCapability(definition, 'place_building')) return 'building';
  if (hasCapability(definition, 'place_fence')) return 'fence';
  if (hasCapability(definition, 'place_path')) return 'path';
  if (definition.type === 'pet' || hasCapability(definition, 'place_pet')) return 'pet';
  return undefined;
}

function tintFromGameDefinition(definition: GameItemDefinition): number {
  if (definition.type === 'pet' || hasCapability(definition, 'place_pet')) return 0xd9a066;
  if (definition.type === 'storage' || hasCapability(definition, 'place_storage_chest')) return 0xb77a42;
  if (definition.type === 'house_blueprint') return 0x70b76c;
  if (hasCapability(definition, 'place_building')) return 0xc29b5a;
  if (definition.type === 'material') return 0x8b8b8b;
  return 0xdddddd;
}

export function getItemDef(itemId: string | null | undefined): ItemDef | undefined {
  if (!itemId) return undefined;
  const staticDef = STATIC_ITEM_DEF_MAP.get(itemId);
  const gameDef = getGameItemDefinition(itemId);
  if (!gameDef) return staticDef;
  return {
    itemId,
    label: gameDef.nameZh || gameDef.name || staticDef?.label || itemId,
    tint: staticDef?.tint ?? tintFromGameDefinition(gameDef),
    itemType: itemTypeFromGameDefinition(gameDef),
    placeEntity: staticDef?.placeEntity ?? placeEntityFromGameDefinition(gameDef),
    buildingDefinitionId: getCapabilityDefinitionId(gameDef, 'place_building'),
  };
}

export const ITEM_DEF_MAP: Pick<ReadonlyMap<string, ItemDef>, 'get'> = {
  get: getItemDef,
};

// ── DropItem class ─────────────────────────────────────────────────────────────

export class DropItem {
  private _sprite:    Phaser.GameObjects.Image;
  private _hint:      Phaser.GameObjects.Text;
  private _gone     = false;
  private _baseX:     number;
  private _baseY:     number;
  private _scene:     Phaser.Scene;
  private _quantity:  number;

  readonly id?: string;
  readonly itemId: string;
  readonly label:  string;

  constructor(
    scene:     Phaser.Scene,
    x:         number,
    y:         number,
    itemId:    string,
    options:   { id?: string; quantity?: number } = {},
  ) {
    this._scene = scene;
    this._baseX = x;
    this._baseY     = y;
    this.id         = options.id;
    this.itemId     = itemId;
    this._quantity  = Math.max(1, Math.floor(options.quantity ?? 1));

    const def   = getItemDef(itemId);
    this.label  = def?.label ?? itemId;

    const texKey = ensureItemTexture(scene, itemId, { namespace: 'drop', size: DISPLAY_SIZE, fallbackTint: def?.tint });

    this._sprite = scene.add.image(x, y, scene.textures.exists(texKey) ? texKey : '__WHITE');
    this._sprite.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);
    this._sprite.setDepth(DEPTH);

    // Gentle bob
    scene.tweens.add({
      targets:  this._sprite,
      y:        y - 5,
      duration: 820 + Math.random() * 180,
      ease:     'Sine.easeInOut',
      yoyo:     true,
      repeat:   -1,
    });

    // Pickup hint (hidden until player is near)
    this._hint = scene.add
      .text(x, y - 22, this.getHintText(), {
        fontSize:        '8px',
        color:           '#fffbe6',
        backgroundColor: '#00000099',
        padding:         { x: 3, y: 2 },
        fontFamily:      '"Courier New", monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH + 1)
      .setVisible(false);
  }

  // ── Per-frame call ─────────────────────────────────────────────────────────

  /**
   * Call every frame from GameScene.update().
   * Drop pickup is automatic, so this no longer advertises an F-key action.
   */
  updateHint(playerX: number, playerY: number): void {
    void playerX;
    void playerY;
    if (this._gone) return;
    this._hint.setVisible(false);
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  /** True when the player is within pickup radius. */
  isNearPlayer(px: number, py: number): boolean {
    if (this._gone) return false;
    const dx = px - this._baseX;
    const dy = py - this._baseY;  // use stable base Y, not the bobbing sprite.y
    return dx * dx + dy * dy <= PICKUP_RADIUS * PICKUP_RADIUS;
  }

  /** Legacy direct pickup helper. Normal player pickup is routed by DropSystem. */
  pickup(): void {
    if (this._gone) return;
    gameBus.emit('player:item_pickup', { itemKey: this.itemId, quantity: this._quantity });
    gameBus.emit('world:item_picked_up', {
      itemId: this.itemId,
      quantity: this._quantity,
      x: this._sprite.x,
      y: this._sprite.y,
      worldId: (this._scene as any).mapRuntimeManager?.getActiveWorldId?.()
        ?? (this._scene as any).currentMapDefinition?.ref?.worldId,
      actorId: 'player',
      source: 'local',
    });
    this.destroy();
  }

  /** NPC silently claims this item — no player callback. */
  claimForNpc(): boolean {
    if (this._gone) return false;
    this.destroy();
    return true;
  }

  destroy(): void {
    if (this._gone) return;
    this._gone = true;
    this._scene.tweens.killTweensOf(this._sprite);
    this._sprite.destroy();
    this._hint.destroy();
  }

  // ── Getters ────────────────────────────────────────────────────────────────
  get gone():   boolean { return this._gone; }
  get worldX(): number  { return this._baseX; }
  get worldY(): number  { return this._baseY; }
  get quantity(): number { return this._quantity; }

  setRuntimeVisible(visible: boolean): void {
    if (this._gone) return;
    this._sprite.setVisible(visible);
    if (!visible) this._hint.setVisible(false);
  }

  setQuantity(quantity: number): void {
    this._quantity = Math.max(1, Math.floor(quantity));
    this._hint.setText(this.getHintText());
  }

  private getHintText(): string {
    const suffix = this._quantity > 1 ? ` x${this._quantity}` : '';
    return `${this.label}${suffix}`;
  }
}
