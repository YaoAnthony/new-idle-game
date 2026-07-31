import { Facing, PlacementSurface, type PlacedFurniture } from "core";
import { Object3D } from "three";
import { on } from "../../Game/EventBus";
import { getDefinition, getWorld } from "../../Game/State/worldRuntime";
import { clearFade, stepFade } from "../Engine/Fade.js";
import { addOutline, setOutlineVisible } from "../Engine/Outline.js";
import { buildVisual } from "../Visual/VisualRegistry.js";
import {
  WALL_ROTATION,
  gridToWorld,
  wallCellToWorld,
  wallInwardNormal,
} from "./House/index.js";

/** 墙饰离开墙面一点点，避免背面与墙面共面闪烁 */
export const WALL_MOUNT_OFFSET = 0.012;

/**
 * 挡住角色时淡到多透。不淡到全透明——留一点轮廓，
 * 玩家才知道"那儿有个柜子"而不是"柜子凭空消失了"。
 */
const OCCLUDED_OPACITY = 0.22;

/** 连续这么多次检测都没挡住，才允许淡回去（检测间隔 0.1 秒，即约 0.3 秒的迟疑） */
const RELEASE_TICKS = 3;

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

/**
 * 一件已放置家具的占地中心（世界坐标）。
 *
 * 地面和墙面两套坐标系在这里收口——提示气泡、音景的距离衰减都要问
 * "这件家具在哪儿"，各自算一份的话迟早会走散（挂钟是墙饰，
 * 按地面公式算会落到屋子中间去）。
 */
export function furnitureWorldCenter(
  placed: PlacedFurniture,
  definition: { footprint: { width: number; height: number } },
  size: { width: number; depth: number },
): { x: number; y: number; z: number } {
  const { footprint } = definition;

  if (placed.placement.kind === PlacementSurface.Wall) {
    const { wallId, gridPosition } = placed.placement;
    const [x, y, z] = wallCellToWorld(
      wallId,
      gridPosition.x + (footprint.width - 1) / 2,
      gridPosition.y + (footprint.height - 1) / 2,
      size,
    );
    return { x, y, z };
  }

  const { gridPosition, facing } = placed.placement;
  // 朝东/朝西时占地的宽高互换
  const rotated = facing === Facing.East || facing === Facing.West;
  const w = rotated ? footprint.height : footprint.width;
  const h = rotated ? footprint.width : footprint.height;

  return {
    x: gridPosition.x - size.width / 2 + w / 2,
    y: 0,
    z: gridPosition.y - size.depth / 2 + h / 2,
  };
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

  /** 正在让开的家具实例。由 RoomScene 每隔一小段时间射线求出来 */
  private readonly occluders = new Set<string>();
  /** 滞回计数：还要连续几次没命中才允许淡回去 */
  private readonly releaseTicks = new Map<string, number>();

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
      // 被拿走的家具先把材质换回共享的那份，否则克隆出来的材质跟着走了
      clearFade(view);
      view.removeFromParent();
      this.views.delete(instanceId);
      this.occluders.delete(instanceId);
      this.releaseTicks.delete(instanceId);
    }
  }

  // ---- 遮挡淡出 ----
  //
  // 房间摆满之后，镜头会转到高家具背后，角色整个被挡住。镜头不去躲家具
  // （房间是凸盒，回缩逻辑靠的就是这个假设，家具一进碰撞就不成立了，
  // 而且摆满时镜头会一直抽搐）——改成**挡路的家具让开**，动森的做法。

  /**
   * 这一帧挡住角色的是哪几件。RoomScene 射线求出来后交给这里。
   *
   * **淡回去要迟疑几拍**（滞回）：检测间隔 0.1 秒，而一次淡出只要 0.13 秒，
   * 两者是同一量级。角色贴着家具边缘走时，射线命中会在两帧之间反复翻面，
   * 上一次淡变还没走完就被打断，看起来是家具在抖。
   * 淡出立刻生效（挡住视线一刻都不能等），淡回要连续几次都没命中才算数。
   */
  setOccluders(instanceIds: Set<string>): void {
    for (const instanceId of instanceIds) {
      this.occluders.add(instanceId);
      this.releaseTicks.delete(instanceId);
    }

    for (const instanceId of [...this.occluders]) {
      if (instanceIds.has(instanceId)) continue;

      const left = (this.releaseTicks.get(instanceId) ?? RELEASE_TICKS) - 1;
      if (left > 0) {
        this.releaseTicks.set(instanceId, left);
      } else {
        this.occluders.delete(instanceId);
        this.releaseTicks.delete(instanceId);
      }
    }
  }

  /** 推进淡出/淡回。淡出比淡回快：挡视线那一下要立刻让开，显形则要慢一点才不闪 */
  tickFade(deltaSeconds: number): void {
    for (const [instanceId, view] of this.views) {
      const hidden = this.occluders.has(instanceId);
      stepFade(view, hidden ? OCCLUDED_OPACITY : 1, deltaSeconds, hidden ? 6 : 3);
    }
  }

  private spawn(placed: PlacedFurniture): Object3D | null {
    const definition = getDefinition(placed.furnitureId);
    if (!definition) return null;

    const visual = buildVisual(definition.visual.id);
    if (!visual) return null;

    if (placed.placement.kind === PlacementSurface.Wall) {
      const { wallId } = placed.placement;
      placeOnWall(
        visual,
        wallId,
        placed.placement.gridPosition,
        definition.placement.footprint,
        this.size,
      );
    } else {
      const { gridPosition, facing } = placed.placement;
      const rotated = facing === Facing.East || facing === Facing.West;
      const w = rotated
        ? definition.placement.footprint.height
        : definition.placement.footprint.width;
      const h = rotated
        ? definition.placement.footprint.width
        : definition.placement.footprint.height;

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
    // 销毁时正淡到一半的家具挂着克隆材质，不换回来就是一笔泄漏
    for (const view of this.views.values()) clearFade(view);
    this.unsubscribe();
  }
}
