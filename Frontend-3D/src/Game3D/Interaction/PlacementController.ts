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
import {
  furnitureIdForItem,
  placeFromItem,
} from "../../Game/Systems/placement";
import { buildVisual } from "../Visual/VisualRegistry.js";
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
  private itemId: string | null = null;
  private furnitureId: string | null = null;
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
    this.cancel();

    const furnitureId = furnitureIdForItem(itemId);
    if (!furnitureId || getCount(itemId) <= 0) return;

    const definition = getDefinition(furnitureId);
    const visual = definition ? buildVisual(definition.visualId) : null;
    if (!definition || !visual) return;

    this.itemId = itemId;
    this.furnitureId = furnitureId;
    this.surface = definition.placementSurface;
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
    emit("placement_mode_changed", { active: true, furnitureId: itemId });
  }

  cancel(): void {
    if (this.ghost) this.ghost.removeFromParent();
    this.ghost = null;
    this.ghostMaterials = [];

    if (this.itemId) {
      emit("placement_mode_changed", { active: false, furnitureId: null });
    }
    this.itemId = null;
    this.furnitureId = null;
    this.wallId = null;
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

    const definition = getDefinition(this.furnitureId ?? "");
    if (!definition) return;

    if (this.surface === PlacementSurface.Wall) {
      this.aimAtWall(definition.footprint);
      return;
    }

    if (!this.raycaster.ray.intersectPlane(this.floorPlane, this.hit)) return;

    const { room } = getWorld();
    const rotated = this.facing === Facing.East || this.facing === Facing.West;
    const w = rotated ? definition.footprint.height : definition.footprint.width;
    const h = rotated ? definition.footprint.width : definition.footprint.height;

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

    const target = this.currentTarget();
    const placed = target ? placeFromItem(this.itemId, target) : false;

    // 物品用完自动退出布置模式，否则留在模式里连续摆
    if (placed && getCount(this.itemId) <= 0) this.cancel();
    else this.refresh();

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
    if (!this.ghost || !this.furnitureId || !this.itemId) return;

    const definition = getDefinition(this.furnitureId);
    if (!definition) return;

    const target = this.currentTarget();
    if (!target) {
      this.valid = false;
      this.ghost.visible = false;
      return;
    }

    const check = checkPlacementTarget(this.furnitureId, target);
    this.valid = check.ok && getCount(this.itemId) > 0;

    const { room } = getWorld();
    const size = { width: room.floorGrid.width, depth: room.floorGrid.height };

    this.ghost.visible = true;

    if (target.kind === PlacementSurface.Wall) {
      placeOnWall(
        this.ghost,
        target.wallId,
        target.gridPosition,
        definition.footprint,
        size,
      );
    } else {
      const rotated = this.facing === Facing.East || this.facing === Facing.West;
      const w = rotated
        ? definition.footprint.height
        : definition.footprint.width;
      const h = rotated
        ? definition.footprint.width
        : definition.footprint.height;

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
