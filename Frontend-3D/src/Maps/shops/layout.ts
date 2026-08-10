import {
  Facing,
  WallOpeningKind,
  type RoomSave,
  type RoomStyleDefinition,
  type WallSave,
} from "core";
import type { ShopSpec } from "../town/shops.js";

/**
 * 店铺内部的房间壳子。六家共用一个生成器——店与店的差别在**陈设**
 * （interiors.ts），不在墙。户型各写一份的话，改一次层高要改六遍。
 *
 * 尺寸比玩家的宅子小一圈（宅子 24×20，店里 16×12）：概念图里这些
 * 是临街小店，不是大厅。门开在南墙正中，和外面的店门对齐——出门
 * 落在小镇的哪一点由 portals 保证，这里只管墙上有个洞。
 */

export const SHOP_ROOM = { width: 16, height: 12 } as const;

/** 房间 id 必须**全世界唯一**（实体归属反查靠它），所以带店铺前缀 */
export function shopRoomId(spec: ShopSpec): string {
  return `${spec.mapId}-room`;
}

export function generateShopRoom(
  spec: ShopSpec,
  style: RoomStyleDefinition,
): RoomSave {
  const wallHeight = 4;
  const alongX = { width: SHOP_ROOM.width, height: wallHeight };
  const alongY = { width: SHOP_ROOM.height, height: wallHeight };

  const walls: Record<string, WallSave> = {
    north: {
      wallId: "north",
      facing: Facing.North,
      grid: alongX,
      origin: { x: 0, y: 0 },
      // 后墙一扇高窗：店里全封死会闷，一点天光就够
      openings: [
        {
          openingId: `${spec.mapId}-back-window`,
          kind: WallOpeningKind.Window,
          gridPosition: { x: 6, y: 2 },
          size: { width: 4, height: 2 },
          visualId: style.visual.windowVisualId,
        },
      ],
    },
    west: {
      wallId: "west",
      facing: Facing.West,
      grid: alongY,
      origin: { x: 0, y: 0 },
      openings: [],
    },
    south: {
      wallId: "south",
      facing: Facing.South,
      grid: alongX,
      origin: { x: 0, y: 0 },
      openings: [
        {
          openingId: `${spec.mapId}-door`,
          kind: WallOpeningKind.Door,
          gridPosition: { x: 7, y: 0 },
          size: { width: 2, height: 3 },
          visualId: style.visual.doorVisualId,
        },
        // 门两侧的橱窗：从店里往外看得见街，这条街才是活的
        ...[2, 12].map((x) => ({
          openingId: `${spec.mapId}-front-window-${x}`,
          kind: WallOpeningKind.Window,
          gridPosition: { x, y: 1 },
          size: { width: 3, height: 2 },
          visualId: style.visual.windowVisualId,
        })),
      ],
    },
    east: {
      wallId: "east",
      facing: Facing.East,
      grid: alongY,
      origin: { x: 0, y: 0 },
      openings: [],
    },
  };

  return {
    roomId: shopRoomId(spec),
    floorGrid: { ...SHOP_ROOM },
    walls,
    floor: 0,
  };
}
