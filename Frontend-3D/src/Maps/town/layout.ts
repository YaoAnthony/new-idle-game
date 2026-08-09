import {
  Facing,
  WallOpeningKind,
  type RoomSave,
  type RoomStyleDefinition,
  type WallSave,
} from "core";

/**
 * town 的占位布局：一块 16×12 的镇口广场。
 *
 * **现在只是换图流程的试验场**（箱庭①B），阶段③会把它长成真正的
 * 小镇箱庭。留一圈矮墙 + 西侧门洞：门是"能不能走出广场"的开关
 * （室外通行判定认大门），没有它玩家会被锁死在地台上。
 *
 * 房间 id 必须全世界唯一（归属反查靠它），所以叫 town-plaza 不叫 plaza。
 */

export const PLAZA_SIZE = { width: 16, height: 12 } as const;

export function generatePlaza(style: RoomStyleDefinition): RoomSave {
  const wallHeight = 2;
  const alongX = { width: PLAZA_SIZE.width, height: wallHeight };
  const alongY = { width: PLAZA_SIZE.height, height: wallHeight };

  const walls: Record<string, WallSave> = {
    north: {
      wallId: "north",
      facing: Facing.North,
      grid: alongX,
      origin: { x: 0, y: 0 },
      openings: [],
    },
    west: {
      wallId: "west",
      facing: Facing.West,
      grid: alongY,
      origin: { x: 0, y: 0 },
      openings: [
        {
          openingId: "town-gate",
          kind: WallOpeningKind.Door,
          gridPosition: { x: 5, y: 0 },
          size: { width: 2, height: 2 },
          visualId: style.visual.doorVisualId,
        },
      ],
    },
    south: {
      wallId: "south",
      facing: Facing.South,
      grid: alongX,
      origin: { x: 0, y: 0 },
      openings: [],
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
    roomId: "town-plaza",
    floorGrid: { ...PLAZA_SIZE },
    walls,
    floor: 0,
  };
}
