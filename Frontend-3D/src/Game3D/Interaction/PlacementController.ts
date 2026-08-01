import { Facing, PlacementSurface } from "core";
import {
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
} from "three";
import { emit } from "../../Game/EventBus";
import { getCount } from "../../Game/State/inventory";
import {
  checkPlacementTarget,
  getDefinition,
  getWorld,
  type PlacementTarget,
} from "../../Game/State/worldRuntime";
import { placeFromItem } from "../../Game/Systems/placement";
import { buildItemVisual } from "../Visual/VisualRegistry.js";
import { FACING_ROTATION, placeOnWall } from "../World/FurnitureView.js";
import { worldToWallCell } from "../World/House/index.js";

/**
 * 布置模式：从背包选家具物品后出现虚影，跟随鼠标吸附网格，
 * 合法位置绿色、非法红色，R 旋转，点击落地（消耗物品），Esc 退出。
 * 物品用完自动退出模式。
 *
 * 地面家具打在地板平面上；墙饰（相框/挂钟/窗帘）改为射到墙面网格上。
 * 墙面 quad 只渲染朝屋内的面，所以 raycast 天然只命中"看得见的那两面墙"——
 * 不需要额外的可见性判断，也不会把东西挂到背后看不见的墙上。
 */

const ROTATE_ORDER: Facing[] = [
  Facing.North,
  Facing.East,
  Facing.South,
  Facing.West,
];

const GHOST_OK = "#5fae55";
const GHOST_BAD = "#c05248";

export class PlacementController {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly floorPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();

  private ghost: Object3D | null = null;
  private ghostMaterials: MeshLambertMaterial[] = [];
  /**
   * 正在摆的那件物品。**以前这里有两个 id**（itemId 摆完要扣哪一格、
   * furnitureId 摆下去变成什么），合并之后是同一个。
   */
  private itemId: string | null = null;
  private surface: PlacementSurface = PlacementSurface.Floor;
  private facing: Facing = Facing.North;
  private gridX = 0;
  private gridY = 0;
  /** 墙饰当前吸附到哪面墙；地面家具为 null */
  private wallId: string | null = null;
  private valid = false;

  private readonly wallMeshes: Object3D[] = [];
  private readonly wallIdByMesh = new Map<Object3D, string>();

  constructor(
    private readonly parent: Object3D,
    private readonly camera: Camera,
    private readonly canvas: HTMLElement,
    walls: Map<string, Object3D>,
  ) {
    for (const [wallId, mesh] of walls) {
      this.wallMeshes.push(mesh);
      this.wallIdByMesh.set(mesh, wallId);
    }
  }

  get active(): boolean {
    return this.itemId !== null;
  }

  begin(itemId: string): void {
    /**
     * 已经在摆同一件东西就什么都不做。
     *
     * 这个方法现在由 `held_changed` 驱动，而那个事件的触发面比"换了手上
     * 拿什么"宽得多（数量变了也发）。不挡一下的话，每摆下一件都会重建一次
     * 虚影——玩家按 R 转好的朝向会在落地的瞬间被打回北向。
     */
    if (this.itemId === itemId && this.ghost) return;

    this.cancel();

    if (getCount(itemId) <= 0) return;

    const definition = getDefinition(itemId);
    // 虚影和真身走同一个入口，否则 visual.scale 只作用在其中一边，
    // 摆下去的东西会比预览时大一圈
    const visual = definition ? buildItemVisual(itemId) : null;
    if (!definition || !visual) return;

    this.itemId = itemId;
    this.surface = definition.placement.surface;
    this.facing = Facing.North;
    this.wallId = null;

    this.ghostMaterials = [];
    visual.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const material = new MeshLambertMaterial({
        color: GHOST_OK,
        transparent: true,
        opacity: 0.55,
        flatShading: true,
        depthWrite: false,
      });
      node.material = material;
      node.castShadow = false;
      this.ghostMaterials.push(material);
    });

    this.ghost = visual;
    this.ghost.visible = false;
    this.parent.add(this.ghost);
    emit("placement_mode_changed", { active: true, itemId });
  }

  cancel(): void {
    if (this.ghost) this.ghost.removeFromParent();
    this.ghost = null;
    this.ghostMaterials = [];

    if (this.itemId) {
      emit("placement_mode_changed", { active: false, itemId: null });
    }
    this.itemId = null;
    this.wallId = null;
  }

  /**
   * 方向键逐格微调。
   *
   * 鼠标瞄准在低俯角下**够不到远处的格子**：透视把远端压扁，
   * 屏幕上移几个像素，地面格就从 4 跳到 2 再跳到 -1——贴墙的
   * 第 0 行根本落不上去。布置类游戏的通行解法就是键盘微调，
   * 一次一格，想贴墙就一路顶到底。
   */
  nudge(dx: number, dy: number): void {
    if (!this.active || this.surface === PlacementSurface.Wall) return;

    const { room } = getWorld();
    const definition = getDefinition(this.itemId ?? "");
    if (!definition) return;

    const rotated = this.facing === Facing.East || this.facing === Facing.West;
    const { footprint } = definition.placement;
    const w = rotated ? footprint.height : footprint.width;
    const h = rotated ? footprint.width : footprint.height;

    // 夹在网格内：顶到墙就停住，不会推出屋外
    this.gridX = Math.min(
      Math.max(this.gridX + dx, 0),
      room.floorGrid.width - w,
    );
    this.gridY = Math.min(
      Math.max(this.gridY + dy, 0),
      room.floorGrid.height - h,
    );
    this.refresh();
  }

  /** 墙饰的朝向由墙决定，转不了；R 只对地面家具有效 */
  rotate(): void {
    if (this.surface === PlacementSurface.Wall) return;

    const index = ROTATE_ORDER.indexOf(this.facing);
    this.facing = ROTATE_ORDER[(index + 1) % ROTATE_ORDER.length];
    this.refresh();
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.active) return;

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const definition = getDefinition(this.itemId ?? "");
    if (!definition) return;

    if (this.surface === PlacementSurface.Wall) {
      this.aimAtWall(definition.placement.footprint);
      return;
    }

    if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.hit)) return;

    const { room } = getWorld();
    const rotated = this.facing === Facing.East || this.facing === Facing.West;
    const { footprint } = definition.placement;
    const w = rotated ? footprint.height : footprint.width;
    const h = rotated ? footprint.width : footprint.height;

    this.gridX = Math.round(this.hit.x + room.floorGrid.width / 2 - w / 2);
    this.gridY = Math.round(this.hit.z + room.floorGrid.height / 2 - h / 2);
    this.refresh();
  }

  /** 射到墙面上：命中哪面墙 → 换算成该墙的墙格坐标 */
  private aimAtWall(footprint: { width: number; height: number }): void {
    const hits = this.raycaster.intersectObjects(this.wallMeshes, false);
    const first = hits[0];
    const wallId = first ? this.wallIdByMesh.get(first.object) : undefined;

    // 没指到墙上（指着地板或屋外）就藏起虚影，避免"悬在空中"的误导
    if (!first || !wallId) {
      this.wallId = null;
      this.valid = false;
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    const { room } = getWorld();
    const size = {
      width: room.floorGrid.width,
      depth: room.floorGrid.height,
    };
    const { wx, wy } = worldToWallCell(wallId, first.point, size);

    // footprint 直接按墙平面读，不经过 facing 旋转
    this.wallId = wallId;
    this.gridX = Math.round(wx - (footprint.width - 1) / 2);
    this.gridY = Math.round(wy - (footprint.height - 1) / 2);
    this.refresh();
  }

  /** 返回 true 表示本次点击被布置模式消费 */
  onClick(): boolean {
    if (!this.active || !this.ghost?.visible) return false;
    if (!this.itemId || !this.valid) return true;

    /**
     * 先把 id 抄下来再摆。
     *
     * `placeFromItem` 会同步触发 held_changed，而那条链现在会回头调
     * `cancel()`（摆完最后一件手上就空了）——等它跑完 `this.itemId`
     * 已经是 null 了，再拿它去查数量就是在读一个刚被清掉的字段。
     */
    const itemId = this.itemId;
    const target = this.currentTarget();
    const placed = target ? placeFromItem(itemId, target) : false;

    // 物品用完自动退出布置模式，否则留在模式里连续摆
    if (placed && getCount(itemId) <= 0) this.cancel();
    else if (this.active) this.refresh();

    return true;
  }

  private currentTarget(): PlacementTarget | null {
    const gridPosition = { x: this.gridX, y: this.gridY };

    if (this.surface === PlacementSurface.Wall) {
      if (!this.wallId) return null;
      return {
        kind: PlacementSurface.Wall,
        wallId: this.wallId,
        gridPosition,
      };
    }

    return {
      kind: PlacementSurface.Floor,
      gridPosition,
      facing: this.facing,
    };
  }

  private refresh(): void {
    if (!this.ghost || !this.itemId) return;

    const definition = getDefinition(this.itemId);
    if (!definition) return;

    const target = this.currentTarget();
    if (!target) {
      this.valid = false;
      this.ghost.visible = false;
      return;
    }

    const check = checkPlacementTarget(this.itemId, target);
    this.valid = check.ok && getCount(this.itemId) > 0;

    const { room } = getWorld();
    const size = { width: room.floorGrid.width, depth: room.floorGrid.height };

    this.ghost.visible = true;

    if (target.kind === PlacementSurface.Wall) {
      placeOnWall(
        this.ghost,
        target.wallId,
        target.gridPosition,
        definition.placement.footprint,
        size,
      );
    } else {
      const rotated = this.facing === Facing.East || this.facing === Facing.West;
      const w = rotated
        ? definition.placement.footprint.height
        : definition.placement.footprint.width;
      const h = rotated
        ? definition.placement.footprint.width
        : definition.placement.footprint.height;

      this.ghost.position.set(
        this.gridX - size.width / 2 + w / 2,
        0,
        this.gridY - size.depth / 2 + h / 2,
      );
      this.ghost.rotation.y = FACING_ROTATION[this.facing];
    }

    const color = this.valid ? GHOST_OK : GHOST_BAD;
    for (const material of this.ghostMaterials) material.color.set(color);
  }
}
