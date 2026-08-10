import { DEFAULT_MAP_ID, type MapDefinition } from "core";
import { YARD_MARGIN, generateHouse } from "./layout.js";
import { basePortals } from "./portals.js";

/**
 * base —— 玩家据点（共享公寓）：围墙庄园里的起始之家。
 *
 * home 的继任者（2026-08-10，设计稿见 gpt设计稿/据点箱庭设计稿.md）：
 * 起始图从"野地里一栋小屋"升级成"石墙围合的据点"——进南门、穿过
 * 自己的田、绕过前庭才到宅子，"回家"从一个传送动作变成一段动线。
 * 老宅原样迁入（换新大宅等房屋生成器过了多层关再说）。
 *
 * **直接继承 "living" / "yard" 两个房间名**：实体只带 roomId，
 * home 退役后这两个名字空出来，base 接手 → 家具/宠物/掉落物的存档
 * 一个字段都不用改，迁移（v24）只动地图键和玩家位置。
 */

/** 床高 0.45：日式住宅 40~60cm 取中，且不超过角色一步能迈的高度 */
const FLOOR_LEVEL = 0.45;

export const baseMapDefinition: MapDefinition = {
  mapId: DEFAULT_MAP_ID,
  localizationKey: "map.base",
  primaryRoomId: "living",
  outdoorRoomId: "yard",
  yardMargin: YARD_MARGIN,

  /**
   * 四向边距（设计稿 §2）：南边要装下种植区+前庭广场+入门通道，
   * 北边只要后庭，东西各留一圈。围墙的视觉画在这条边界上——
   * 看得见的墙 = 走得到的边。
   */
  yardMargins: { north: 6, south: 16, east: 8, west: 8 },

  floorLevel: FLOOR_LEVEL,

  /**
   * 玄关内侧（2LDK 户型门在西墙 z1~2）。heading = π/2 是朝东（+X）。
   * 出生点是地图的知识：每张地图的门开在哪、进门站哪，只有户型数据
   * 自己知道。
   */
  spawn: { x: -8.5, y: -6, heading: Math.PI / 2 },

  /**
   * 缘侧走**北面 + 东面转角**（2026-08-08 定，随宅迁入不动）。
   * 据点里河改在东墙外——东缘侧隔墙看河，墙高压在坐姿视线以下
   * （0.9 墙 vs ≈1.1 视线），是把 home 的名场面搬来的关键一笔。
   */
  outdoorDecks: [
    { deckId: "engawa-north", side: "north", from: -12, to: 14, depth: 2 },
    { deckId: "engawa-east", side: "east", from: -10, to: 10, depth: 2 },
  ],

  /*
   * 南院石阶高台（承托面③的样板）随 home 一起退役：它的历史使命
   * （证明"声明即碰撞"）已经完成，据点里未来的"高处"由东桥接棒。
   */

  portals: basePortals,

  generateRooms: (style) => {
    const living = generateHouse({ roomId: "living", style });
    return { [living.roomId]: living };
  },
};
