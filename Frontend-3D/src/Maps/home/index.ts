import { DEFAULT_MAP_ID, type MapDefinition } from "core";
import { YARD_MARGIN, generateHouse } from "./layout.js";
import { homePortals } from "./portals.js";

/**
 * home —— 起始箱庭：出租屋 + 院子。
 *
 * **一张箱庭 = 一个文件夹**（2026-08-09 定）。加一张新地图 = 新建
 * 一个兄弟文件夹，里面自带户型、外景、出入口，然后在 ../index.ts
 * 里登记一行。以前户型在 Core、外景在 Game3D/World/OutdoorScene、
 * 出生点在 participants —— 一张图的东西散在三个包里，加第二张图
 * 得同时改三处还要记得别漏。
 *
 * 这个文件夹里的分工：
 * - layout.ts   户型（墙、门窗洞、内墙、分区），产出 RoomSave
 * - index.ts    这张图的定义：出生点、床高、缘侧、院子范围（本文件）
 * - outdoor.ts  外景（树、河、天穹）—— 阶段③ 建
 * - portals.ts  出入口 —— 阶段② 建
 */

export const homeMapDefinition: MapDefinition = {
  mapId: DEFAULT_MAP_ID,
  localizationKey: "map.home",
  primaryRoomId: "living",
  outdoorRoomId: "yard",
  yardMargin: YARD_MARGIN,
  /** 床高 0.45：日式住宅 40~60cm 取中，且不超过角色一步能迈的高度 */
  floorLevel: 0.45,

  /**
   * 玄关内侧（2LDK 户型门在西墙 z1~2）。heading = π/2 是朝东（+X）。
   * 原来硬编码在 Frontend 的 participants.ts——出生点是**地图的知识**：
   * 每张地图的门开在哪、进门站哪，只有户型数据自己知道。
   */
  spawn: { x: -8.5, y: -6, heading: Math.PI / 2 },

  /**
   * 缘侧走**北面 + 东面转角**（2026-08-08 定）。
   *
   * 北墙是那扇 5×3 落地窗，正对樱花树、河、远林——整个庭院构图当初
   * 就是对着它设计的，缘侧摆这儿一坐就是最好的景。绕过东北角接一段
   * 是日式住宅很经典的一处，绕房子走时层次更丰富。
   *
   * 西面不做：那是玄关入口，廊子会把大门挡住。南面卧室窗那侧没景。
   *
   * 北段的 x 一直伸到 halfW + depth（14），把东北转角那块整个吃下来，
   * 东段从 z = -halfD 起——两段严丝合缝，不重叠（重叠会 z-fighting）。
   */
  outdoorDecks: [
    { deckId: "engawa-north", side: "north", from: -12, to: 14, depth: 2 },
    { deckId: "engawa-east", side: "east", from: -10, to: 10, depth: 2 },
  ],

  portals: homePortals,

  generateRooms: (style) => {
    const living = generateHouse({ roomId: "living", style });
    return { [living.roomId]: living };
  },
};
