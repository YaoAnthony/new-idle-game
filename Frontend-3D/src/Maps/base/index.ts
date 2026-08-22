import { DEFAULT_MAP_ID, type MapDefinition } from "core";
import { YARD_MARGIN, generateHouse, generateYard } from "./layout.js";
import { baseTerritory } from "./territory.js";
import { basePortals } from "./portals.js";
import {
  BRIDGE_SURFACES,
  FLOOR_LEVEL,
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
   * 四向边距 = **人到得了的范围**，不再是院墙。
   *
   * 三版的演变：
   *  ① 四个数正好圈在围墙上，"看得见的墙 = 走得到的边"
   *  ② 挖河后东、南放开到对岸（要能走上桥），北、西没动——那时候
   *    北西两面墙外就是水
   *  ③ 河改道 + 森林 + 山之后北、西是一整块大陆，一度放开到山脚
   *    （100/130），想让人走进林子
   *  ④ **用户拍板：森林和山是景，不进去逛**（2026-08-18）。西门封了、
   *    北墙没门，唯一出口是两座桥；北西两面收回到墙外一小圈。范围小
   *    了三样东西一起轻：导航网格（采样格数）、清晰度场（tile 数）、
   *    /overview 的取景半径（159 → 约 60，又能一眼看全据点了）。
   *
   * 真正拦人的三样全是真东西：围墙（outdoorBlockers）、岸壁（陡度）、
   * 山体（陡度）。这四个数只是导航网格的采样范围，不是墙。
   */
  yardMargins: { north: 14, south: 37, east: 33, west: 24 },

  floorLevel: FLOOR_LEVEL,

  /**
   * 起伏地形。院子 −0.45、河床 −4.95、岸壁 1.2 米宽（约 75°）。
   * **岸壁比"下坡上限"63° 陡，所以人走不进河里**——没有一个禁行盒
   * 是为水写的，拦住人的就是地形本身。
   */
  terrainHeightfield: baseHeightfield,

  /*
   * **围墙拆了**（期 1 的 T12），所以这里没有 outdoorBlockers 了。
   *
   * 领地往西北扩之后，西墙 x=−28 和北墙 z=−22 会横穿 A 列和第 1 行
   * ——自己地里竖着一道墙。东、南两面本来就靠河岸挡人（岸壁陡度 > 63°，
   * 走不下去），那圈石头拦的一直是镜头不是脚。拆掉之后领地边界只有
   * 绳索一种表达（TerritoryView），拦人只有 isInsideTerritory 一处。
   *
   * `WALL_RECT` 常量留着不删：两座桥的位置仍从它的 maxX / maxZ 推。
   *
   * 雾的庇护区（shelter）一并去掉——没有墙就没有"墙内雾薄"，大雾天
   * 整片一样浓。
   */

  /**
   * 两座桥的桥面。**声明即可走**——承托面系统在楼梯上兑现过一次，
   * 这次是桥。把这一行去掉，两岸当场断开（headless 就是这么验的）。
   */
  groundFixtures: BRIDGE_SURFACES,

  /**
   * 开局站在 **C3 格**（x −10..5 / z 3..18）中间偏北的一块空地上。
   *
   * 旧出生点是玄关内侧 (−8.5, −6)——那在 B2 格里，而开局只拥有 C3。
   * 房子默认收起来（T9）之后玄关根本不存在，人一进游戏就站在锁定格里
   * 走不动。`territoryAudit` 校验的正是这一条：出生点必须在 initial 格内，
   * 改错了启动就报。
   *
   * heading = π/2 是朝东（+X）。
   */
  spawn: { x: -2, y: 10, heading: Math.PI / 2 },

  /**
   * 缘侧走**北面 + 东面转角**（2026-08-08 定，随宅迁入不动）。
   * 据点里河改在东墙外——东缘侧隔墙看河，墙高压在坐姿视线以下
   * （0.9 墙 vs ≈1.1 视线），是把 home 的名场面搬来的关键一笔。
   */
  // 缘侧贴着外墙长在房上：from/to 是**房本地**坐标（OutdoorDeck 注释），
  // 房子挪走缘侧跟着走——groundMap 和 HouseBuilder 各自在出口处复合锚点
  outdoorDecks: [
    { deckId: "engawa-north", side: "north", from: -12, to: 14, depth: 2 },
    { deckId: "engawa-east", side: "east", from: -10, to: 10, depth: 2 },
  ],

  /*
   * 南院石阶高台（承托面③的样板）随 home 一起退役：它的历史使命
   * （证明"声明即碰撞"）已经完成，据点里未来的"高处"由东桥接棒。
   */

  portals: basePortals,

  /** 领地地块（期 1）。格盘和地标见 ./territory.ts */
  territory: baseTerritory,

  generateRooms: (style) => {
    /*
     * **房子默认收起**（决策 T9）。24×20 装不进 15×15 的格，而房屋升级
     * 是期 2 的事——收起来之后"跨格"这个问题直接消失：收起的房子不建
     * 几何、不占格、不进占用图，开局就是一块空地 + 出生点，正合
     * "一开始位置很小"。想看房子照常 `/house place`（调试用）。
     */
    const living = { ...generateHouse({ roomId: "living", style }), stowed: true };
    /*
     * 院子现在是**一个房间**：有网格所以能放家具，没有墙所以哪儿都通。
     * roomId 必须等于 outdoorRoomId，buildGroundMap 靠它判"地板就是地形"。
     */
    const yard = generateYard();
    return { [living.roomId]: living, [yard.roomId]: yard };
  },
};
