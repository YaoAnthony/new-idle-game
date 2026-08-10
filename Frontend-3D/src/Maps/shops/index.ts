import type { MapDefinition, MapPortal } from "core";
import { SHOP_SPECS, shopDoorAt, type ShopSpec } from "../town/shops.js";
import { generateShopRoom, shopRoomId, SHOP_ROOM } from "./layout.js";

/**
 * 六家店的**内部地图**，由 SHOP_SPECS 规格表批量生成。
 *
 * 为什么六张图挤在一个文件夹里（"一张箱庭 = 一个文件夹"的规矩之下）：
 * 六家店是**同一类东西的六个实例**，户型、出入口、加载方式全一样，
 * 差别只在陈设。开六个几乎一模一样的兄弟文件夹，改一次层高要改六遍——
 * 那正是当初立这条规矩要防的事。规矩的本意是"一张图的东西别散在三个
 * 包里"，一族店铺聚在 Maps/shops 完全满足。
 *
 * 店门口的出入口是**成对的两条**：小镇那边一条（town/portals 生成）、
 * 店里这边一条（本文件）。落点各自落在对方触发带之外。
 */

/**
 * 进店后站在门内、面朝店里（北）。
 *
 * **离门 4 格不是 1.6**：三人称弹簧臂在角色背后，贴着南墙站会把镜头
 * 挤到墙上（实测臂长塌到 1.4，满屏一个后脑勺）。往里站几步，臂就有
 * 地方伸了。
 */
function spawnOf(): { x: number; y: number; heading: number } {
  return { x: 0, y: SHOP_ROOM.height / 2 - 4, heading: Math.PI };
}

/** 店里出门那一条：踩到门口那块地就回小镇 */
function exitPortal(spec: ShopSpec): MapPortal {
  const halfD = SHOP_ROOM.height / 2;
  return {
    portalId: `${spec.mapId}-exit`,
    // 贴着南墙门洞的一小块（门洞在 x 中间，净宽 2）
    zone: { minX: -1.2, maxX: 1.2, minZ: halfD - 1.0, maxZ: halfD },
    targetMapId: "town",
    // 落回自家门口的石板上，面朝街（南）。必须在小镇那条触发带之外
    landing: { x: shopDoorAt(spec).x, y: shopDoorAt(spec).z + 2.6, heading: 0 },
    localizationKey: "map.town",
  };
}

export const shopMapDefinitions: MapDefinition[] = SHOP_SPECS.map((spec) => ({
  mapId: spec.mapId,
  localizationKey: spec.localizationKey,
  primaryRoomId: shopRoomId(spec),
  /*
   * 店里没有院子。室外分区仍要有一个（"东西掉在哪"总得有答案），
   * 给一个本店专属的 id——房间 id 全世界唯一这条同样管着它。
   */
  outdoorRoomId: `${spec.mapId}-outside`,
  /** 出了门就是墙，活动范围只有屋里。留 1 格容差免得贴墙判越界 */
  yardMargin: 1,
  /** 店铺是平地起，没有架空 */
  floorLevel: 0,
  /*
   * 店铺内部是**内容不是玩家状态**：玩家改不了这里的墙，几何跟着
   * 代码走。不标的话改一次层高，老存档还按旧尺寸开门。
   */
  volatileRooms: true,
  spawn: spawnOf(),
  portals: [exitPortal(spec)],
  generateRooms: (style) => {
    const room = generateShopRoom(spec, style);
    return { [room.roomId]: room };
  },
}));

/** 小镇那一侧的六条：走到店门口就进店 */
export const shopEntrancePortals: MapPortal[] = SHOP_SPECS.map((spec) => {
  const door = shopDoorAt(spec);
  return {
    portalId: `${spec.shopId}-entrance`,
    // 门前那块台阶地：比门洞宽半格，走过去自然踩得到
    zone: { minX: door.x - 1.3, maxX: door.x + 1.3, minZ: door.z, maxZ: door.z + 1.2 },
    targetMapId: spec.mapId,
    localizationKey: spec.localizationKey,
  };
});
