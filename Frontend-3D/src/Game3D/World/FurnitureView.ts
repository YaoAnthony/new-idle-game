import { Facing, PlacementSurface, type PlacedFurniture } from "core";
import { Object3D } from "three";
import { on } from "../../Game/EventBus";
import { getDefinition, getWorld } from "../../Game/State/worldRuntime";
import { addOutline, setOutlineVisible } from "../Engine/Outline.js";
import { buildVisual } from "../Visual/VisualRegistry.js";
import {
  WALL_ROTATION,
  gridToWorld,
  wallCellToWorld,
  wallInwardNormal,
} from "./RoomBuilder.js";

/** 墙饰离开墙面一点点，避免背面与墙面共面闪烁 */
export const WALL_MOUNT_OFFSET = 0.012;

/**
 * 把一个墙饰摆到墙格上。虚影预览和已放置家具走同一个函数，
 * 否则预览位置和落地位置会悄悄偏开。
 *
 * footprint 直接按墙平面读（不经过 facing 旋转），原点是左上角，
 * 模型挂在占地中心。
 */
export function placeOnWall(
  visual: Object3D,
  wallId: string,
  gridPosition: { x: number; y: number },
  footprint: { width: number; height: number },
  size: { width: number; depth: number },
): void {
  const centerWx = gridPosition.x + (footprint.width - 1) / 2;
  const centerWy = gridPosition.y + (footprint.height - 1) / 2;

  const [x, y, z] = wallCellToWorld(wallId, centerWx, centerWy, size);
  const [nx, , nz] = wallInwardNormal(wallId);

  visual.position.set(
    x + nx * WALL_MOUNT_OFFSET,
    y,
    z + nz * WALL_MOUNT_OFFSET,
  );
  visual.rotation.y = WALL_ROTATION[wallId] ?? 0;
}

export const FACING_ROTATION: Record<Facing, number> = {
  [Facing.North]: 0,
  [Facing.East]: -Math.PI / 2,
  [Facing.South]: Math.PI,
  [Facing.West]: Math.PI / 2,
};

/**
 * 朝向 → 世界方向的单位向量 [dx, dz]。
 * 房间的北墙在 gridY = 0，而 z = gridY - depth/2，所以**北是 -Z**。
 */
export const FACING_VECTOR: Record<Facing, [number, number]> = {
  [Facing.North]: [0, -1],
  [Facing.East]: [1, 0],
  [Facing.South]: [0, 1],
  [Facing.West]: [-1, 0],
};

/** 家具占地中心的世界坐标（朝向旋转后的宽高） */
export function furnitureCenterWorld(
  placement: { gridPosition: { x: number; y: number }; facing: Facing },
  footprint: { width: number; height: number },
  size: { width: number; depth: number },
): { x: number; z: number } {
  const rotated =
    placement.facing === Facing.East || placement.facing === Facing.West;
  const w = rotated ? footprint.height : footprint.width;
  const h = rotated ? footprint.width : footprint.height;

  return {
    x: placement.gridPosition.x - size.width / 2 + w / 2,
    z: placement.gridPosition.y - size.depth / 2 + h / 2,
  };
}

/**
 * 家具槽位的世界坐标。槽位 offset 是**家具本地坐标**，
 * 所以要跟着家具朝向一起转——灶台转 90° 时两个灶眼也得跟着转，
 * 否则锅会飘到灶台外面去。
 */
export function slotWorldPosition(
  placement: { gridPosition: { x: number; y: number }; facing: Facing },
  footprint: { width: number; height: number },
  offset: readonly [number, number, number],
  size: { width: number; depth: number },
): { x: number; y: number; z: number } {
  const center = furnitureCenterWorld(placement, footprint, size);
  const angle = FACING_ROTATION[placement.facing];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [ox, oy, oz] = offset;

  return {
    x: center.x + ox * cos + oz * sin,
    y: oy,
    z: center.z - ox * sin + oz * cos,
  };
}

/**
 * 订阅 world_changed，把 placedFurniture 同步成场景图。
 * 多格家具的原点是 footprint 左上角，模型挂在占地中心。
 */
export class FurnitureView {
  readonly root = new Object3D();

  private readonly views = new Map<string, Object3D>();
  private readonly unsubscribe: () => void;
  private outlineEnabled = true;

  constructor(private readonly size: { width: number; depth: number }) {
    this.root.name = "furniture";
    this.unsubscribe = on("world_changed", () => this.sync());
    this.sync();
  }

  private sync(): void {
    const { placedFurniture } = getWorld();
    const alive = new Set<string>();

    for (const placed of placedFurniture) {
      alive.add(placed.instanceId);
      if (this.views.has(placed.instanceId)) continue;

      const view = this.spawn(placed);
      if (view) {
        this.views.set(placed.instanceId, view);
        this.root.add(view);
      }
    }

    for (const [instanceId, view] of this.views) {
      if (alive.has(instanceId)) continue;
      view.removeFromParent();
      this.views.delete(instanceId);
    }
  }

  private spawn(placed: PlacedFurniture): Object3D | null {
    const definition = getDefinition(placed.furnitureId);
    if (!definition) return null;

    const visual = buildVisual(definition.visualId);
    if (!visual) return null;

    if (placed.placement.kind === PlacementSurface.Wall) {
      const { wallId } = placed.placement;
      placeOnWall(
        visual,
        wallId,
        placed.placement.gridPosition,
        definition.footprint,
        this.size,
      );
    } else {
      const { gridPosition, facing } = placed.placement;
      const rotated = facing === Facing.East || facing === Facing.West;
      const w = rotated
        ? definition.footprint.height
        : definition.footprint.width;
      const h = rotated
        ? definition.footprint.width
        : definition.footprint.height;

      const [originX, , originZ] = gridToWorld(
        gridPosition.x,
        gridPosition.y,
        this.size,
      );
      visual.position.set(originX + (w - 1) / 2, 0, originZ + (h - 1) / 2);
      visual.rotation.y = FACING_ROTATION[facing];
    }

    visual.userData.instanceId = placed.instanceId;

    addOutline(visual);
    setOutlineVisible(visual, this.outlineEnabled);
    return visual;
  }

  setOutlineEnabled(enabled: boolean): void {
    this.outlineEnabled = enabled;
    setOutlineVisible(this.root, enabled);
  }

  dispose(): void {
    this.unsubscribe();
  }
}
