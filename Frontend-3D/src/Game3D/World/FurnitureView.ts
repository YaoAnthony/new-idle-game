import {
  Facing,
  FurnitureCapability,
  PlacementSurface,
  faceCellToWorld,
  faceYaw,
  wallFaceOf,
  type PlacedFurniture,
} from "core";
import { FACING_ROTATION as FACING_ROTATION_LOCAL } from "./furnitureMath.js";
import { hostGeometryOf, surfaceChildPose } from "./SurfacePlacement.js";
import { Object3D } from "three";
import { on } from "../../Game/EventBus";
import { getDefinition, getWorld, groundHeightAt } from "../../Game/State/worldRuntime";
import { clearFade, stepFade } from "../Engine/Fade.js";
import { addOutline, setOutlineVisible } from "../Engine/Outline.js";
import { buildItemVisual } from "../Visual/VisualRegistry.js";
import { gridToWorld } from "./House/index.js";

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
 * 模型挂在占地中心。**按放置面算**（Core 的 placementFaces）：外墙、内墙
 * 的两面都是一张 face，位置和朝向全从 face.frame 来，没有按 wallId 的分支。
 * 面不存在（坏档里的 wallId）就藏起来，不摆到原点去当个鬼。
 */
export function placeOnWall(
  visual: Object3D,
  wallId: string,
  gridPosition: { x: number; y: number },
  footprint: { width: number; height: number },
): void {
  const face = wallFaceOf(getWorld().room, wallId);
  if (!face) {
    visual.visible = false;
    return;
  }
  const centerWx = gridPosition.x + (footprint.width - 1) / 2;
  const centerWy = gridPosition.y + (footprint.height - 1) / 2;

  const p = faceCellToWorld(face, centerWx, centerWy);
  const n = face.frame.normal;

  visual.position.set(
    p.x + n.x * WALL_MOUNT_OFFSET,
    p.y + n.y * WALL_MOUNT_OFFSET,
    p.z + n.z * WALL_MOUNT_OFFSET,
  );
  visual.rotation.y = faceYaw(face);
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

  /**
   * 台面件的位置由宿主决定，自己的 gridPosition 是半格本地坐标，
   * **绝不能掉进下面的地面公式**（半格 × 整格公式 = 摆在桌上的东西
   * 被报到屋子另一头）。宿主查不到（孤儿，等待回收）就报宿主原点，
   * 至少不指到墙外去。
   */
  if (placed.placement.kind === PlacementSurface.Surface) {
    const host = getWorld().placedFurniture.find(
      (item) =>
        placed.placement.kind === PlacementSurface.Surface &&
        item.instanceId === placed.placement.hostInstanceId,
    );
    const geometry = hostGeometryOf(
      host,
      host ? getDefinition(host.furnitureId)?.placement : undefined,
    );
    if (!geometry) return { x: 0, y: 0, z: 0 };

    const childFootprint =
      getDefinition(placed.furnitureId)?.placement.surfaceFootprint;
    if (!childFootprint) return { x: 0, y: 0, z: 0 };

    const pose = surfaceChildPose(
      geometry,
      placed.placement,
      childFootprint,
      size,
    );
    return { x: pose.x, y: pose.y, z: pose.z };
  }

  if (placed.placement.kind === PlacementSurface.Wall) {
    const { wallId, gridPosition } = placed.placement;
    const face = wallFaceOf(getWorld().room, wallId);
    if (!face) return { x: 0, y: 0, z: 0 };
    return faceCellToWorld(
      face,
      gridPosition.x + (footprint.width - 1) / 2,
      gridPosition.y + (footprint.height - 1) / 2,
    );
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

// 纯数学下沉到 furnitureMath（台面换算也要用，放这儿会成环）。
// 转发导出，旧引用不用改
export {
  FACING_ROTATION,
  FACING_VECTOR,
  furnitureCenterWorld,
  slotWorldPosition,
} from "./furnitureMath.js";

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
  /**
   * 挂在内墙面上的家具 → 那面墙的淡出组名（PlacementFace.hostGroup）。
   * 墙让镜头时挂饰要一起让：不然墙淡成半透明、画还实心地浮在半空。
   */
  private readonly hostGroupByInstance = new Map<string, string>();
  /** 此刻正在让开的墙体组名（RoomScene 每帧同步） */
  private hiddenHostGroups: ReadonlySet<string> = new Set();

  constructor(private readonly size: { width: number; depth: number }) {
    this.root.name = "furniture";
    this.unsubscribe = on("world_changed", () => this.sync());
    this.sync();
  }

  /**
   * 屋里所有某种家具的场景节点。
   *
   * 给需要**对着实物演动画**的系统用（每日任务机吐奖励时要抖）。
   * 返回节点而不是 instanceId：调用方要的是能直接改 scale 的对象，
   * 让它们再去查一遍 Map 只是把同一份索引抄两份。
   */
  findByFurnitureId(furnitureId: string): Object3D[] {
    const result: Object3D[] = [];
    for (const placed of getWorld().placedFurniture) {
      if (placed.furnitureId !== furnitureId) continue;
      const view = this.views.get(placed.instanceId);
      if (view) result.push(view);
    }
    return result;
  }

  /**
   * 屋里所有**台面宿主**的视图（instanceId + 节点）。
   * 布置模式的射线打的就是这批网格——打不到宿主就回落到地面吸附。
   */
  findSurfaceHostViews(): Array<{ instanceId: string; root: Object3D }> {
    const result: Array<{ instanceId: string; root: Object3D }> = [];
    for (const placed of getWorld().placedFurniture) {
      if (!getDefinition(placed.furnitureId)?.placement.surfaceGrid) continue;
      const view = this.views.get(placed.instanceId);
      if (view) result.push({ instanceId: placed.instanceId, root: view });
    }
    return result;
  }

  /** 同上，但连 instanceId 一起给——唱片机换标贴要知道"这台是谁" */
  /** 带某种能力的所有实例的视图（浴缸水面动画按能力找，不按具体 id） */
  findInstancesWithCapability(
    capability: FurnitureCapability,
  ): Array<{ instanceId: string; root: Object3D }> {
    const result: Array<{ instanceId: string; root: Object3D }> = [];
    for (const placed of getWorld().placedFurniture) {
      if (!getDefinition(placed.furnitureId)?.placement.capabilities.includes(capability)) continue;
      const view = this.views.get(placed.instanceId);
      if (view) result.push({ instanceId: placed.instanceId, root: view });
    }
    return result;
  }

  findInstancesByFurnitureId(
    furnitureId: string,
  ): Array<{ instanceId: string; root: Object3D }> {
    const result: Array<{ instanceId: string; root: Object3D }> = [];
    for (const placed of getWorld().placedFurniture) {
      if (placed.furnitureId !== furnitureId) continue;
      const view = this.views.get(placed.instanceId);
      if (view) result.push({ instanceId: placed.instanceId, root: view });
    }
    return result;
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
      this.hostGroupByInstance.delete(instanceId);
    }
  }

  /** RoomScene 告诉我们哪些墙体组正在让镜头，挂在上面的东西跟着淡 */
  setHiddenWallGroups(groups: ReadonlySet<string>): void {
    this.hiddenHostGroups = groups;
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
      const host = this.hostGroupByInstance.get(instanceId);
      const hidden =
        this.occluders.has(instanceId) ||
        (host !== undefined && this.hiddenHostGroups.has(host));
      stepFade(view, hidden ? OCCLUDED_OPACITY : 1, deltaSeconds, hidden ? 6 : 3);
    }
  }

  private spawn(placed: PlacedFurniture): Object3D | null {
    const definition = getDefinition(placed.furnitureId);
    if (!definition) return null;

    const visual = buildItemVisual(definition.id);
    if (!visual) return null;

    if (placed.placement.kind === PlacementSurface.Surface) {
      const hostId = placed.placement.hostInstanceId;
      const host = getWorld().placedFurniture.find(
        (item) => item.instanceId === hostId,
      );
      const geometry = hostGeometryOf(
        host,
        host ? getDefinition(host.furnitureId)?.placement : undefined,
      );
      const childFootprint = definition.placement.surfaceFootprint;
      // 宿主不在（重放乱序、坏档）：先不出模型，等 world_changed 对账补上
      if (!geometry || !childFootprint) return null;

      const pose = surfaceChildPose(
        geometry,
        placed.placement,
        childFootprint,
        this.size,
      );
      visual.position.set(pose.x, pose.y, pose.z);
      visual.rotation.y = pose.rotationY;
    } else if (placed.placement.kind === PlacementSurface.Wall) {
      const { wallId } = placed.placement;
      placeOnWall(
        visual,
        wallId,
        placed.placement.gridPosition,
        definition.placement.footprint,
      );
      const host = wallFaceOf(getWorld().room, wallId)?.hostGroup;
      if (host) this.hostGroupByInstance.set(placed.instanceId, host);
      else this.hostGroupByInstance.delete(placed.instanceId);
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
      const centerX = originX + (w - 1) / 2;
      const centerZ = originZ + (h - 1) / 2;
      // 落在脚下的承托面上：室内地板是 0（跟从前一样），院子里的
      // 家具落到 -floorLevel——写死 0 的话据点的长椅会浮空半人高
      visual.position.set(centerX, groundHeightAt(centerX, centerZ), centerZ);
      visual.rotation.y = FACING_ROTATION_LOCAL[facing];
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
