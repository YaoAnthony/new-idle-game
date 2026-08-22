import {
  Facing,
  WallOpeningKind,
  type InteriorDoorway,
  type InteriorWall,
  type RoomSave,
  type RoomStyleDefinition,
  type WallSave,
} from "core";

/**
 * 领地建筑的**同图内景**生成器。
 *
 * 这些房间和主屋的户型（`Maps/base/layout.ts` 的 `generateHouse`）是同一种
 * 数据，只是小得多：一间到三间、一扇门、几扇窗。共用一个建造器而不是每栋
 * 楼各写一份——"有墙必有门"这条硬规矩只该被满足一次。
 *
 * 产出的是 `Omit<RoomSave, "roomId" | "anchor">`：**id 和位置由实例决定**
 * （roomId 是 `建筑id:实例id`，锚点是建筑摆在哪），生成器不该知道这两样。
 */

export type InteriorSpec = {
  width: number;
  depth: number;
  /** 墙高（格）。塔屋靠它长高，不靠多层 */
  wallHeight?: number;
  /** 门开在南墙的第几格（从西数）。不填 = 居中 */
  doorAt?: number;
  /** 每面墙开几扇窗。窗是"这屋子有人住"的信号，不是装饰 */
  windows?: boolean;
  /**
   * 内墙：把房间横着切一刀，`at` 是墙所在的行（z 方向第几格）。
   * 每道内墙自带一个门洞——有墙必有门。
   */
  partitions?: Array<{ at: number; doorAt: number }>;
};

const DEFAULT_WALL_HEIGHT = 4;

export function buildInterior(
  spec: InteriorSpec,
  style: RoomStyleDefinition,
): Omit<RoomSave, "roomId" | "anchor"> {
  const { width, depth } = spec;
  const wallHeight = spec.wallHeight ?? DEFAULT_WALL_HEIGHT;
  const doorAt = spec.doorAt ?? Math.max(0, Math.floor(width / 2) - 1);

  const alongX = { width, height: wallHeight };
  const alongZ = { width: depth, height: wallHeight };

  const windowAt = (id: string, x: number, y: number, w: number, h: number) => ({
    openingId: id,
    kind: WallOpeningKind.Window,
    gridPosition: { x, y },
    size: { width: w, height: h },
    visualId: style.visual.windowVisualId,
  });

  const walls: Record<string, WallSave> = {
    north: {
      wallId: "north",
      facing: Facing.North,
      grid: alongX,
      origin: { x: 0, y: 0 },
      openings:
        spec.windows && width >= 4
          ? [windowAt("north-window", Math.floor(width / 2) - 1, 1, 2, 2)]
          : [],
    },
    south: {
      wallId: "south",
      facing: Facing.South,
      grid: alongX,
      origin: { x: 0, y: 0 },
      /*
       * **门永远开在南墙**。建筑的正面是本地 +z（`BuildingDefinition`
       * 的核心约定），南墙就是正面——外壳上的门和内景的门这样才对得上，
       * 不用在两处各记一次"门在哪一面"。
       */
      openings: [
        {
          openingId: "south-door",
          kind: WallOpeningKind.Door,
          gridPosition: { x: doorAt, y: 0 },
          size: { width: 2, height: 2 },
          visualId: style.visual.doorVisualId,
        },
      ],
    },
    west: {
      wallId: "west",
      facing: Facing.West,
      grid: alongZ,
      origin: { x: 0, y: 0 },
      openings:
        spec.windows && depth >= 4
          ? [windowAt("west-window", Math.floor(depth / 2) - 1, 1, 2, 2)]
          : [],
    },
    east: {
      wallId: "east",
      facing: Facing.East,
      grid: alongZ,
      origin: { x: 0, y: 0 },
      openings:
        spec.windows && depth >= 4
          ? [windowAt("east-window", Math.floor(depth / 2) - 1, 1, 2, 2)]
          : [],
    },
  };

  const interiorWalls: InteriorWall[] = [];
  const interiorDoorways: InteriorDoorway[] = [];
  for (const [index, partition] of (spec.partitions ?? []).entries()) {
    interiorWalls.push({
      from: { x: 0, y: partition.at },
      axis: "x",
      length: width,
    });
    // **有墙必有门**：内墙和它的门洞一起生成，不给"忘了开门"留机会
    interiorDoorways.push({
      doorwayId: `doorway-${index}`,
      cell: { x: partition.doorAt, y: partition.at },
      axis: "x",
      span: 2,
      doorId: "room_door",
    });
  }

  return {
    floorGrid: { width, height: depth },
    walls,
    floor: 0,
    ...(interiorWalls.length > 0 ? { interiorWalls, interiorDoorways } : {}),
  };
}
