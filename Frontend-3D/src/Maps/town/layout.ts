import { HouseZoneKind, type RoomSave } from "core";

/**
 * town 的房间：镇口广场，一块 16×12 的**露天石板地**。
 *
 * **一堵墙都没有**（2026-08-10 改）。原来围着一圈 2 格矮墙 + 西侧
 * 一道门洞，那是箱庭①B 时期的权宜：当时的室外通行判定认大门，
 * 不留门玩家会被锁死在地台上。后来 openAir 的图已经不再要求"必须
 * 从大门出去"（doorsRuntime 那条），这圈墙就只剩副作用了——
 * 从高空看整个广场是"草地上架了一块带栅栏的木台子"，不是镇口。
 *
 * 建造器本来就是遍历 room.walls 建墙的，给个空表它自然什么都不建；
 * 地板照旧按 floorGrid 铺。所以这里删数据就够，不用去改建造器。
 *
 * 地板走 Plaza 分区 = 石板铺装。房间的默认地板是木板，对屋子对，
 * 对广场就是那块木台子的由来。
 *
 * 房间 id 必须全世界唯一（归属反查靠它），所以叫 town-plaza 不叫 plaza。
 */

export const PLAZA_SIZE = { width: 16, height: 12 } as const;

export function generatePlaza(): RoomSave {
  return {
    roomId: "town-plaza",
    floorGrid: { ...PLAZA_SIZE },
    walls: {},
    floor: 0,
    zones: [
      {
        zoneId: "town-plaza-paving",
        kind: HouseZoneKind.Plaza,
        rect: { x: 0, y: 0, ...PLAZA_SIZE },
      },
    ],
  };
}
