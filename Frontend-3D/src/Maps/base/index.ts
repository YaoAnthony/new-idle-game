import { DEFAULT_MAP_ID, Facing, type MapDefinition } from "core";
import { YARD_MARGIN, generateCottageL1, generateYard } from "./layout.js";
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

  /**
   * 可走范围**写死成世界矩形**（2026-08-22）。这四个数就是上面的边距
   * 按 24×20 的老房子展开的结果——值一个没变，只是把"据点多大"从
   * 房子身上摘下来变成地图自己的数。默认的家换成 9×12 的小屋之后，
   * 按房子推会让东桥走不到头、A 列领地出界。
   */
  walkableRect: { minX: -36, maxX: 45, minZ: -24, maxZ: 47 },

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
   * 出生在**玄关内侧、面朝大门**（2026-08-22，默认的家换成女巫小屋）。
   *
   * **房本地坐标**：小屋 9×12，中心为原点，玄关在南门里面 x1..2 / y10..11
   * 那两格——本地 x = 2 − 4.5 = −2.5（门心），z = 10.5 − 6 = +4.5（玄关
   * 格心）。heading 0 是朝 +z，即朝南、朝门。消费方经 spawnWorldOf 按
   * 房子锚点世界化：锚点 (−2.5, 9) → 世界 (−5, 13.5)，在 C3 里。
   *
   * 期 1 的 T9（房子默认收起）同时作废：出生点曾经因此挪到院子里的空地，
   * 现在房子在场，人回到屋里。`territoryAudit` 仍校验世界化之后的点落在
   * initial 格内。
   */
  spawn: { x: -2.5, y: 4.5, heading: 0 },

  /**
   * 缘侧走**北面 + 东面转角**（2026-08-08 定，随宅迁入不动）。
   * 据点里河改在东墙外——东缘侧隔墙看河，墙高压在坐姿视线以下
   * （0.9 墙 vs ≈1.1 视线），是把 home 的名场面搬来的关键一笔。
   */
  /*
   * **没有缘侧**（2026-08-22）。缘侧是和风 2LDK 那栋的东西——它现在是 LV3，
   * 默认的家是女巫小屋，石墙木瓦，缘侧挂上去是两种语言打架。
   * 原来那两条 from/to 也是按 24 宽写的房本地坐标，9 宽的房子上根本对不上。
   * LV3 接上时缘侧跟着它回来（缘侧是地图定义不是存档，老档读进来就没了，
   * 这是预期）。
   */
  outdoorDecks: [],

  /*
   * 南院石阶高台（承托面③的样板）随 home 一起退役：它的历史使命
   * （证明"声明即碰撞"）已经完成，据点里未来的"高处"由东桥接棒。
   */

  portals: basePortals,

  /** 领地地块（期 1）。格盘和地标见 ./territory.ts */
  territory: baseTerritory,

  generateRooms: (style) => {
    /*
     * 默认的家 = **女巫小屋**（LV1，2026-08-22 用户定），**开局就立着**。
     *
     * 期 1 的 T9「房子默认收起」到此作废：那条是因为 24×20 的 2LDK 装不进
     * 15×15 的格才定的。9×12 装得进（四周各留 1.5～3 格），收起的理由没了。
     * 2LDK 从此是 LV3，等房屋升级那条线接上。
     *
     * 锚点 (−2.5, 9)：占地 x −7..2 / z 3..15，整个落在 C3（x −10..5 /
     * z 3..18）里，南面留 3 格给门廊和门口。9 是奇数宽所以中心在 .5 上——
     * 格边仍是整数，放置面和占用图对得齐。
     */
    const living = {
      ...generateCottageL1({ roomId: "living", style }),
      anchor: { x: -2.5, z: 9, elevation: 0, facing: Facing.North },
    };
    /*
     * 院子现在是**一个房间**：有网格所以能放家具，没有墙所以哪儿都通。
     * roomId 必须等于 outdoorRoomId，buildGroundMap 靠它判"地板就是地形"。
     */
    const yard = generateYard();
    return { [living.roomId]: living, [yard.roomId]: yard };
  },
};
