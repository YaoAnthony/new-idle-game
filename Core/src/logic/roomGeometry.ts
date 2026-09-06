import type { GridPosition } from "../types/base.js";
import { isHouseStowed } from "./roomAnchor.js";
import {
  WallOpeningKind,
  type HouseZone,
  type MapDefinition,
  type OutdoorDeck,
  type RoomSave,
  type WallOpening,
} from "../types/map.js";

/**
 * 房间几何的**查询算法**。V0.13 起这里不再持有任何具体户型——
 * 2LDK 的墙、门窗、分区数据全部搬进 Data/maps/home.ts（户型是
 * home 地图的内容数据，不是算法）。这里剩下的函数对任何 RoomSave
 * 都成立，加新地图不用碰。
 *
 * 顺手清掉的遗留：generateRoom / DEFAULT_ROOM_SIZE（单间时代的
 * 生成器，2LDK 落地后全项目零调用）、createSingleRoomMap（serialize
 * 改为全量往返 maps 之后没有调用方了）。
 */

/**
 * 玩家格子落在哪个分区。墙格上（门洞穿行中）返回 undefined，让消费方沿用上一次。
 */
export function zoneAt(
  room: RoomSave,
  cell: { x: number; y: number },
): HouseZone | undefined {
  // 房子收起来了：人站在原地也不在任何分区里（音景退回兜底档案）。
  // 不加这一条的话，格坐标照样落在网格内，音景会说"你在 LDK"，
  // 而玩家其实站在草地上
  if (isHouseStowed(room)) return undefined;
  return room.zones?.find(
    (zone) =>
      cell.x >= zone.rect.x &&
      cell.x < zone.rect.x + zone.rect.width &&
      cell.y >= zone.rect.y &&
      cell.y < zone.rect.y + zone.rect.height,
  );
}

/** 内墙覆盖的所有格子（占用图和渲染共用同一份推导） */
/** 高台的台阶格：能走不能摆（两节踏板占满一格，东西放上去是悬空的） */
export function platformStairCells(room: RoomSave): GridPosition[] {
  if (isHouseStowed(room)) return [];
  return (room.platforms ?? []).flatMap((platform) => (platform.stairs ? [platform.stairs.cell] : []));
}

export function interiorWallCells(room: RoomSave): GridPosition[] {
  // 收起来的房子不挡路（占用图和内墙放置面都由它推）
  if (isHouseStowed(room)) return [];
  const cells: GridPosition[] = [];
  for (const wall of room.interiorWalls ?? []) {
    for (let i = 0; i < wall.length; i += 1) {
      cells.push(
        wall.axis === "x"
          ? { x: wall.from.x + i, y: wall.from.y }
          : { x: wall.from.x, y: wall.from.y + i },
      );
    }
  }
  return cells;
}

/** 找出房间里所有门（宠物派遣的寻路目标） */
export function findDoors(room: RoomSave): WallOpening[] {
  if (isHouseStowed(room)) return [];
  return Object.values(room.walls).flatMap((wall) =>
    wall.openings.filter((opening) => opening.kind === WallOpeningKind.Door),
  );
}

/** 找出房间里所有窗（环境音按玩家到窗口的距离衰减） */
export function findWindows(room: RoomSave): WallOpening[] {
  if (isHouseStowed(room)) return [];
  return Object.values(room.walls).flatMap((wall) =>
    wall.openings.filter((opening) => opening.kind === WallOpeningKind.Window),
  );
}

export type DeckRect = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/**
 * 缘侧的**房本地**矩形（房中心为原点；RoomAnchor 引入后世界化在
 * 消费方出口做——groundMap 经 anchorRectToWorld，表现层挂在锚定
 * root 下天然本地）。**渲染和通行判定共用这一个函数**——
 * `side + from/to + depth` 是紧凑好写的数据形式，但两边各自展开成
 * 矩形迟早展开出两种结果（差半格的那种，最难看出来）。
 *
 * `floorGrid` 是房子的占地，墙面线由它推导。
 */
export function outdoorDeckRect(
  deck: OutdoorDeck,
  floorGrid: { width: number; height: number },
): DeckRect {
  const halfW = floorGrid.width / 2;
  const halfD = floorGrid.height / 2;

  switch (deck.side) {
    case "north":
      return { minX: deck.from, maxX: deck.to, minZ: -halfD - deck.depth, maxZ: -halfD };
    case "south":
      return { minX: deck.from, maxX: deck.to, minZ: halfD, maxZ: halfD + deck.depth };
    case "west":
      return { minX: -halfW - deck.depth, maxX: -halfW, minZ: deck.from, maxZ: deck.to };
    default:
      return { minX: halfW, maxX: halfW + deck.depth, minZ: deck.from, maxZ: deck.to };
  }
}

/**
 * 院子的可走边界（世界坐标矩形）。**读边距的唯一入口**——四向边距
 * 是可选的（yardMargins，缺哪向退回均匀的 yardMargin），让每个消费方
 * 自己做这个回退，迟早有一处忘了，那一侧的墙和可走边界就错位了。
 *
 * **刻意不看 RoomAnchor**：可走边界是地理（据点的岬角、围墙、岸线），
 * 不是房子的属性——房子挪走，据点还是那么大。边距数值是围着**默认
 * 锚点**的房 rect 调的（历史原因，margins 语义是"从房边缘往外量"），
 * 所以这里继续按原点房 rect 展开，得到的正是那块世界固定的地理矩形。
 * 房子挪到边上导致"离边界很近"是选址校验的事，不该反过来让边界跟房跑。
 */
/**
 * 自动寻路要烘的范围。**声明了 `navRect` 就用它，否则退回可走范围。**
 *
 * 分出这一层是因为两者会差一个数量级：据点的可走范围是整块地形，
 * 而导航网格按 0.5 米烤，同样的矩形要 19.5 万格。见 `MapDefinition.navRect`
 * 的注释——没有寻路不等于不能去。
 */
export function navBoundsOf(
  map: Pick<MapDefinition, "yardMargin" | "yardMargins" | "walkableRect" | "navRect">,
  floorGrid: { width: number; height: number },
): DeckRect {
  return map.navRect ?? yardBoundsOf(map, floorGrid);
}

export function yardBoundsOf(
  map: Pick<MapDefinition, "yardMargin" | "yardMargins" | "walkableRect">,
  floorGrid: { width: number; height: number },
): DeckRect {
  /*
   * 地图自己声明了可走范围就直接用它。**"据点多大"是地理，不该跟房子
   * 尺寸走**——按房子推的那套在房子从 24×20 换成 9×12 那天当场露馅：
   * 东界从 45 缩到 37.5，东桥走不到头；西界从 −36 缩到 −28.5，A 列领地
   * 出界。老算法留给没声明的图（小镇、店铺），它们的房间就是整张图。
   */
  if (map.walkableRect) return map.walkableRect;

  const halfW = floorGrid.width / 2;
  const halfD = floorGrid.height / 2;
  const margins = map.yardMargins;
  return {
    minX: -halfW - (margins?.west ?? map.yardMargin),
    maxX: halfW + (margins?.east ?? map.yardMargin),
    minZ: -halfD - (margins?.north ?? map.yardMargin),
    maxZ: halfD + (margins?.south ?? map.yardMargin),
  };
}

/** 缘侧往外挑的方向（单位向量的两个分量）。庇、椽子、缘束都按它排 */
export function deckOutward(deck: OutdoorDeck): { x: number; z: number } {
  switch (deck.side) {
    case "north":
      return { x: 0, z: -1 };
    case "south":
      return { x: 0, z: 1 };
    case "west":
      return { x: -1, z: 0 };
    default:
      return { x: 1, z: 0 };
  }
}
