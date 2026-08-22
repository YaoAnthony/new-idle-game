import type { FeatureId } from "../types/base.js";
import type { TerritoryDefinition } from "../types/territory.js";
import { rectInsideTerritory } from "./territory.js";
import type { MapDefinition, RoomAnchor, RoomSave } from "../types/map.js";
import { sampleHeightfield } from "./groundMap.js";
import { anchorRectToWorld } from "./roomAnchor.js";
import { outdoorDeckRect, yardBoundsOf, type DeckRect } from "./roomGeometry.js";

/**
 * 房屋选址校验：**这块地能不能放下这栋房**（给"工人挪房"玩法当地基）。
 *
 * 规则全部**自动推导**，零逐图配置（和碰撞、承托面同一条纪律）：
 * - 地够平：占地内地形逐点采样，都得贴着院子标高。这一条顺带否掉了
 *   河（河床 −4.95 差得远）和岸壁（斜坡采样点高差超限）——**没有一条
 *   规则是为水写的**，拦住房子的是地形本身，和拦人的是同一套逻辑。
 * - 不压真东西：围墙（outdoorBlockers）、声明的承托面（桥、石阶）、
 *   出入口触发带（把桥尾盖住 = 把玩家锁在岛上）。
 * - 不出界：整个占地都在可走范围（yardBoundsOf）之内。
 * - 不压院子里摆的东西：占用格由调用方给（occupiedCells）——今天院子
 *   还不能摆家具，但架构已定（院子将来是一张放置面），参数先留口，
 *   到时候免改签名。
 *
 * 返回**所有**没过的项而不是第一条：挪房 UI 要一次画出"这里不行"的
 * 全部原因，逐条试错的交互是折磨。
 */

/** 地形离目标标高最多差多少（米）还算"平"。约一个式台的高度 */
export const HOUSE_SITE_TOLERANCE = 0.2;

/**
 * 占地外扩一圈的余量（格）：基礎的裙边、门廊的柱子都比地板 rect 挑出
 * 一点。缘侧不用估——它是数据（outdoorDecks），按真实矩形并进占地。
 */
export const HOUSE_SITE_MARGIN = 1;

export type HousePlacementIssue =
  | { kind: "out_of_bounds" }
  | { kind: "uneven_ground"; at: { x: number; z: number }; height: number }
  | { kind: "blocked_by_wall"; rect: DeckRect }
  | { kind: "blocked_by_fixture"; surfaceId: string }
  | { kind: "blocked_by_portal"; portalId: string }
  | { kind: "occupied_cell"; cell: string }
  /** 占地伸出了已开的领地（期 1）。只有传了 territory 选项才可能出现 */
  | { kind: "outside_territory" };

export type HousePlacementCheck =
  | { ok: true }
  | { ok: false; issues: HousePlacementIssue[] };

type SiteMap = Pick<
  MapDefinition,
  | "yardMargin"
  | "yardMargins"
  | "floorLevel"
  | "outdoorDecks"
  | "groundFixtures"
  | "terrainHeightfield"
  | "portals"
  | "outdoorBlockers"
>;

function overlaps(a: DeckRect, b: DeckRect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** 房子在这个锚点下的世界占地：地板 + 缘侧，各自过锚点再并包围盒 */
export function houseFootprintWorld(
  map: Pick<MapDefinition, "outdoorDecks">,
  room: Pick<RoomSave, "floorGrid">,
  anchor: RoomAnchor,
): DeckRect {
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;
  const rects = [
    anchorRectToWorld(anchor, {
      minX: -halfW,
      maxX: halfW,
      minZ: -halfD,
      maxZ: halfD,
    }),
    ...(map.outdoorDecks ?? []).map((deck) =>
      anchorRectToWorld(anchor, outdoorDeckRect(deck, room.floorGrid)),
    ),
  ];
  return {
    minX: Math.min(...rects.map((r) => r.minX)) - HOUSE_SITE_MARGIN,
    maxX: Math.max(...rects.map((r) => r.maxX)) + HOUSE_SITE_MARGIN,
    minZ: Math.min(...rects.map((r) => r.minZ)) - HOUSE_SITE_MARGIN,
    maxZ: Math.max(...rects.map((r) => r.maxZ)) + HOUSE_SITE_MARGIN,
  };
}

export function checkHousePlacement(
  map: SiteMap,
  room: Pick<RoomSave, "floorGrid">,
  anchor: RoomAnchor,
  options: {
    /** 院子放置面上已被占的世界格（`"x,z"`，整数格角键）。见文件头 */
    occupiedCells?: ReadonlySet<string>;
    /**
     * 领地（期 1）。给了就要求**整个占地都在已开的地里**。
     *
     * 走可选参数而不是让这个函数自己去查：领地是**地图层**的概念，
     * 而这里是"房子放不放得下"的几何规则。没有领地的图（小镇、店铺）
     * 不传，一行判断都不用付。
     */
    territory?: {
      definition: TerritoryDefinition;
      unlocked: ReadonlySet<FeatureId>;
    };
  } = {},
): HousePlacementCheck {
  const issues: HousePlacementIssue[] = [];
  const footprint = houseFootprintWorld(map, room, anchor);

  // ---- 不出界 ----
  const bounds = yardBoundsOf(map, room.floorGrid);
  if (
    footprint.minX < bounds.minX ||
    footprint.maxX > bounds.maxX ||
    footprint.minZ < bounds.minZ ||
    footprint.maxZ > bounds.maxZ
  ) {
    issues.push({ kind: "out_of_bounds" });
  }

  // ---- 整个占地都在已开的领地里 ----
  if (
    options.territory &&
    !rectInsideTerritory(
      options.territory.definition,
      options.territory.unlocked,
      footprint,
    )
  ) {
    issues.push({ kind: "outside_territory" });
  }

  // ---- 地够平（贴着"这个锚点标高下院子该有的地面"）----
  // 逐格采样而不是只看四角：footprint 中间可能穿着一条河
  const target = anchor.elevation - map.floorLevel;
  const field = map.terrainHeightfield;
  if (field) {
    outer: for (let x = Math.floor(footprint.minX); x <= footprint.maxX; x += 1) {
      for (let z = Math.floor(footprint.minZ); z <= footprint.maxZ; z += 1) {
        const height = sampleHeightfield(field, x, z);
        if (Math.abs(height - target) > HOUSE_SITE_TOLERANCE) {
          issues.push({ kind: "uneven_ground", at: { x, z }, height });
          // 一条河能产生几百个超差点，报第一个就够 UI 指出问题了
          break outer;
        }
      }
    }
  }
  // 没有高度场的图地面恒为 -floorLevel：elevation=0 时天然平，不用采样

  // ---- 不压围墙 / 承托面 / 出入口 ----
  for (const blocker of map.outdoorBlockers ?? []) {
    if (overlaps(footprint, blocker)) {
      issues.push({ kind: "blocked_by_wall", rect: blocker });
    }
  }
  for (const fixture of map.groundFixtures ?? []) {
    if (fixture.rect && overlaps(footprint, fixture.rect)) {
      issues.push({ kind: "blocked_by_fixture", surfaceId: fixture.surfaceId });
    }
  }
  for (const portal of map.portals ?? []) {
    if (overlaps(footprint, portal.zone)) {
      issues.push({ kind: "blocked_by_portal", portalId: portal.portalId });
    }
  }

  // ---- 不压院子里已摆的东西 ----
  for (const cell of options.occupiedCells ?? []) {
    const [x, z] = cell.split(",").map(Number);
    if (
      x + 1 > footprint.minX &&
      x < footprint.maxX &&
      z + 1 > footprint.minZ &&
      z < footprint.maxZ
    ) {
      issues.push({ kind: "occupied_cell", cell });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
