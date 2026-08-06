import type { Facing, GridPosition } from "../types/base.js";
import {
  PlacementSurface,
  type PlacedFurniture,
  type PlacedFurnitureInstanceId,
} from "../types/furniture.js";
import type { PlaceableItem } from "../types/items.js";
import { areAllCellsWithinGrid, cellKey, footprintCells } from "./grid.js";
import type { FurnitureLookup } from "./occupancy.js";

/**
 * 台面放置的全部规则（V0.13）。**单独一个模块**，不并进 placement.ts：
 * 台面的坐标系（宿主本地半格）、占用表（按宿主实例分片）、失效条件
 * （宿主没了）都和地面/墙面不同，塞进同一个函数只会让三种放置面
 * 互相绊脚。placement.ts 的 revalidatePlacements 委托这里的重校验。
 *
 * 校验和地面/墙面同一条纪律：**Frontend 预览虚影和放置提交跑同一份代码**，
 * 不允许两边各写一套规则。
 */

/** 一个台面格的边长（米）。地面格是 1m，台面用半格——见类型注释里的账 */
export const SURFACE_CELL_METERS = 0.5;

/**
 * 槽位（灶眼）周围要留出的净空半径（米，按半格中心到槽位中心算）。
 *
 * 0.55 不是拍的：灶眼横向间距 0.8m、槽位落在两行半格的正中（离两侧
 * 行中心 0.25m），0.55 恰好把每个灶眼**正下方那一列两行**封掉、
 * 又不越界吞掉邻灶的格子——橱柜的整条灶眼带被封成整齐的矩形，
 * 台面剩下的可摆区都是整块的。锅本身半径 ~0.3，这个净空也保证
 * 杯子不会贴着锅沿摆。
 */
const SLOT_CLEARANCE_METERS = 0.55;

export type SurfacePlacementRequest = {
  kind: PlacementSurface.Surface;
  hostInstanceId: PlacedFurnitureInstanceId;
  /** 宿主台面网格的半格坐标（宿主本地系） */
  gridPosition: GridPosition;
  facing: Facing;
};

export type SurfaceRejection =
  | "not_surface_placeable"
  | "host_not_found"
  | "host_has_no_surface"
  | "out_of_bounds"
  | "cell_occupied";

export type SurfaceCheck =
  | { ok: true }
  | { ok: false; reason: SurfaceRejection };

/** 这件东西能不能上台面 */
export function isSurfacePlaceable(item: PlaceableItem | undefined): boolean {
  return Boolean(item?.placement.surfaceFootprint);
}

/** 这件家具的顶上能不能摆东西 */
export function isSurfaceHost(item: PlaceableItem | undefined): boolean {
  return Boolean(item?.placement.surfaceGrid);
}

/** 摆在某台宿主上的所有东西 */
export function surfaceChildrenOf(
  placedFurniture: readonly PlacedFurniture[],
  hostInstanceId: PlacedFurnitureInstanceId,
): PlacedFurniture[] {
  return placedFurniture.filter(
    (placed) =>
      placed.placement.kind === PlacementSurface.Surface &&
      placed.placement.hostInstanceId === hostInstanceId,
  );
}

/**
 * 台面放置校验。
 *
 * 宿主必须是**摆在地上的**台面家具：墙上挂的东西顶不住重量的说法先不管，
 * 真正的理由是禁止堆叠链（桌上摆小桌、小桌上再摆）——宿主只认地面家具，
 * 链条最多两层，占用、渲染、孤儿回收都只用想一层。
 *
 * `ignoreInstanceId` 给"挪动已摆物件"留的口子：重摆自己时别把自己算成障碍。
 */
export function checkSurfacePlacement(
  request: SurfacePlacementRequest,
  item: PlaceableItem | undefined,
  placedFurniture: readonly PlacedFurniture[],
  lookup: FurnitureLookup,
  ignoreInstanceId?: PlacedFurnitureInstanceId,
): SurfaceCheck {
  const surfaceFootprint = item?.placement.surfaceFootprint;
  if (!surfaceFootprint) return { ok: false, reason: "not_surface_placeable" };

  const host = placedFurniture.find(
    (placed) => placed.instanceId === request.hostInstanceId,
  );
  if (!host) return { ok: false, reason: "host_not_found" };

  const hostDefinition = lookup(host.furnitureId);
  const surfaceGrid = hostDefinition?.placement.surfaceGrid;
  if (!surfaceGrid || host.placement.kind !== PlacementSurface.Floor) {
    return { ok: false, reason: "host_has_no_surface" };
  }

  // 半格坐标是宿主本地系，网格判界不随宿主朝向变——宿主转身时
  // 上面的东西整体跟着转，本地系里什么都没动
  const cells = footprintCells(
    request.gridPosition,
    surfaceFootprint,
    request.facing,
  );
  if (!areAllCellsWithinGrid(cells, surfaceGrid)) {
    return { ok: false, reason: "out_of_bounds" };
  }

  // L 缺口 / 水槽 / 灶眼——台面上不是每个半格都能摆
  const dead = deadSurfaceCells(hostDefinition);
  if (cells.some((cell) => dead.has(cellKey(cell)))) {
    return { ok: false, reason: "out_of_bounds" };
  }

  const taken = new Set<string>();
  for (const sibling of surfaceChildrenOf(placedFurniture, host.instanceId)) {
    if (sibling.instanceId === ignoreInstanceId) continue;
    if (sibling.placement.kind !== PlacementSurface.Surface) continue;

    const siblingFootprint = lookup(sibling.furnitureId)?.placement
      .surfaceFootprint;
    if (!siblingFootprint) continue;

    for (const cell of footprintCells(
      sibling.placement.gridPosition,
      siblingFootprint,
      sibling.placement.facing,
    )) {
      taken.add(cellKey(cell));
    }
  }

  if (cells.some((cell) => taken.has(cellKey(cell)))) {
    return { ok: false, reason: "cell_occupied" };
  }

  return { ok: true };
}

/**
 * 这张台面上**天生不可摆**的半格（和"被别的东西占了"相对）。三层来源：
 *
 * 1. **L 缺口**：宿主有 footprintMask 时，半格必须落在遮罩内的整格上。
 *    半格 → 整格按比例映射（约定台面网格 = 占地 × 2，比例式写法容忍
 *    以后有人声明更细的网格）。
 * 2. **槽位净空**：每个 slot（灶眼）周围 SLOT_CLEARANCE_METERS 内的
 *    半格全封。**从 slots 数据自动推导**——以后加任何带槽位的家具，
 *    锅位自动留空，不用回来写黑名单。
 * 3. **surfaceBlocked 黑名单**：水槽这种"不是槽位的洞"，数据里点名。
 *
 * 都在宿主本地未旋转坐标系里算，和放置坐标同一个系，不用管朝向。
 */
export function deadSurfaceCells(
  hostDefinition: PlaceableItem,
): Set<string> {
  const dead = new Set<string>();
  const placement = hostDefinition.placement;
  const surfaceGrid = placement.surfaceGrid;
  if (!surfaceGrid) return dead;

  const gridSpanX = surfaceGrid.width * SURFACE_CELL_METERS;
  const gridSpanY = surfaceGrid.height * SURFACE_CELL_METERS;

  for (let y = 0; y < surfaceGrid.height; y += 1) {
    for (let x = 0; x < surfaceGrid.width; x += 1) {
      // 1) L 缺口：映射回整格，不在遮罩里就封
      if (placement.footprintMask && placement.footprintMask.length > 0) {
        const fullX = Math.floor(
          (x * placement.footprint.width) / surfaceGrid.width,
        );
        const fullY = Math.floor(
          (y * placement.footprint.height) / surfaceGrid.height,
        );
        const onMask = placement.footprintMask.some(
          ([mx, my]) => mx === fullX && my === fullY,
        );
        if (!onMask) {
          dead.add(cellKey({ x, y }));
          continue;
        }
      }

      // 2) 槽位净空：半格中心（本地米）离任何槽位太近就封
      if (placement.slots?.length) {
        const centerX = (x + 0.5) * SURFACE_CELL_METERS - gridSpanX / 2;
        const centerY = (y + 0.5) * SURFACE_CELL_METERS - gridSpanY / 2;
        const nearSlot = placement.slots.some((slot) => {
          const [ox, , oz] = slot.offset;
          return Math.hypot(centerX - ox, centerY - oz) < SLOT_CLEARANCE_METERS;
        });
        if (nearSlot) {
          dead.add(cellKey({ x, y }));
          continue;
        }
      }

      // 3) 黑名单（水槽）
      if (
        placement.surfaceBlocked?.some(([bx, by]) => bx === x && by === y)
      ) {
        dead.add(cellKey({ x, y }));
      }
    }
  }

  return dead;
}

/**
 * 台面物件的全量重校验：宿主还在吗、宿主还是台面吗、位置还合法吗。
 *
 * 由 placement.ts 的 revalidatePlacements 在**非台面家具都定稿之后**调用
 * （宿主先定生死，孩子才知道自己是不是孤儿）。被判失效的由调用方退回
 * 背包——和墙饰被新窗洞顶下来是同一条出路。
 */
export function revalidateSurfaceChildren(
  keptFurniture: readonly PlacedFurniture[],
  surfaceChildren: readonly PlacedFurniture[],
  lookup: FurnitureLookup,
): { kept: PlacedFurniture[]; displaced: PlacedFurniture[] } {
  const kept: PlacedFurniture[] = [];
  const displaced: PlacedFurniture[] = [];

  for (const child of surfaceChildren) {
    if (child.placement.kind !== PlacementSurface.Surface) continue;

    // 逐个校验时把"已定稿的家具 + 已通过的兄弟"当占用来源，
    // 两个孩子挤同一格（坏档/联机竞争）时留先到的那个
    const check = checkSurfacePlacement(
      {
        kind: PlacementSurface.Surface,
        hostInstanceId: child.placement.hostInstanceId,
        gridPosition: child.placement.gridPosition,
        facing: child.placement.facing,
      },
      lookup(child.furnitureId),
      [...keptFurniture, ...kept],
      lookup,
    );

    if (check.ok) kept.push(child);
    else displaced.push(child);
  }

  return { kept, displaced };
}
