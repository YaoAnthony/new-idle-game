import { DEFAULT_MAP_ID, type MapDefinition } from "core";
import { YARD_MARGIN, generateHouse } from "./layout.js";
import { basePortals } from "./portals.js";
import {
  BRIDGE_SURFACES,
  FLOOR_LEVEL,
  WALL_BLOCKERS,
  baseHeightfield,
} from "./terrain.js";

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

export const baseMapDefinition: MapDefinition = {
  mapId: DEFAULT_MAP_ID,
  localizationKey: "map.base",
  primaryRoomId: "living",
  outdoorRoomId: "yard",
  yardMargin: YARD_MARGIN,

  /**
   * 四向边距（设计稿 §2）：**西边装入口动线**——老宅玄关开在西墙，
   * 大门/田/前庭整套构图跟着转到西边，"进门→穿田→前庭→正对宅门"
   * 的轴线才成立。北边只要后庭。
   *
   * **东、南两向放大到河对岸**（2026-08-12 挖河那次）。原来这四个数
   * 正好圈在围墙上，"看得见的墙 = 走得到的边"——那句话当时是优点，
   * 挖出真河谷之后成了问题：可走范围停在墙上，桥就永远只能是布景，
   * 拦住人的还是一个隐形矩形。现在放开到桥的对岸落点，**真正拦人的
   * 换成两样真东西**：围墙（outdoorBlockers）和岸壁（地形陡度）。
   *
   * 北、西没动：那两面墙外没有桥，边距等于墙线仍然是对的。
   */
  yardMargins: { north: 6, south: 37, east: 33, west: 16 },

  floorLevel: FLOOR_LEVEL,

  /**
   * 起伏地形。院子 −0.45、河床 −4.95、岸壁 1.2 米宽（约 75°）。
   * **岸壁比"下坡上限"63° 陡，所以人走不进河里**——没有一个禁行盒
   * 是为水写的，拦住人的就是地形本身。
   */
  terrainHeightfield: baseHeightfield,

  /**
   * 围墙。可走范围放开到河岸之后它必须自己站住——以前是 yardBounds
   * 顺手挡的，那圈石头其实是假的。带 height：0.9 的矮墙不挡镜头。
   */
  outdoorBlockers: WALL_BLOCKERS,

  /**
   * 两座桥的桥面。**声明即可走**——承托面系统在楼梯上兑现过一次，
   * 这次是桥。把这一行去掉，两岸当场断开（headless 就是这么验的）。
   */
  groundFixtures: BRIDGE_SURFACES,

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
