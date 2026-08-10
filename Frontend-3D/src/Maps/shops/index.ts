import type { BuildingPlacement, MapDefinition, MapPortal } from "core";
import {
  buildingDoorOutward,
  buildingEntranceZone,
  findBuilding,
  type BuildingDefinition,
} from "../../Buildings/index.js";
import { TOWN_BUILDINGS } from "../town/buildings.js";
import { generateShopRoom, shopRoomId, SHOP_ROOM } from "./layout.js";

/**
 * 能进去的建筑，它们的**内部地图**。
 *
 * 从两张表推导，一处不写死：**型号表**说"这个型号进去是哪张图"
 * （`BuildingDefinition.interiorMapId`），**摆放表**说"那扇门在世界的
 * 哪儿"（出门落在哪、门口的触发带在哪）。加一家店 = 加一个型号文件 +
 * 在小镇摆一行，这个文件一个字不用改。
 *
 * 为什么六张图挤在一个文件夹：它们是同一类东西的六个实例，户型、
 * 出入口、加载方式全一样，差别只在陈设。开六个几乎一样的兄弟文件夹，
 * 改一次层高要改六遍——那正是"一图一文件夹"这条规矩本来要防的事。
 */

/** 有内部地图的摆放（今天是小镇那六家；以后别的图有了自动带上） */
function enterablePlacements(): Array<{
  placement: BuildingPlacement;
  definition: BuildingDefinition;
}> {
  return TOWN_BUILDINGS.flatMap((placement) => {
    const definition = findBuilding(placement.buildingId);
    return definition?.interiorMapId ? [{ placement, definition }] : [];
  });
}

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

export const shopMapDefinitions: MapDefinition[] = enterablePlacements().map(
  ({ placement, definition }) => {
    const mapId = definition.interiorMapId!;
    const halfD = SHOP_ROOM.height / 2;
    // 出门落回自家门口外 2.6 格——**朝向由摆放推**，店转了落点跟着转
    const outside = buildingDoorOutward(placement, 2.6);
    const exitPortal: MapPortal = {
      portalId: `${mapId}-exit`,
      zone: { minX: -1.2, maxX: 1.2, minZ: halfD - 1.0, maxZ: halfD },
      targetMapId: "town",
      landing: { x: outside.x, y: outside.z, heading: 0 },
      localizationKey: "map.town",
    };

    return {
      mapId,
      localizationKey: definition.localizationKey,
      primaryRoomId: shopRoomId(mapId),
      /*
       * 店里没有院子。室外分区仍要有一个（"东西掉在哪"总得有答案），
       * 给一个本店专属的 id——房间 id 全世界唯一这条同样管着它。
       */
      outdoorRoomId: `${mapId}-outside`,
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
      portals: [exitPortal],
      generateRooms: (style) => {
        const room = generateShopRoom(mapId, style);
        return { [room.roomId]: room };
      },
    } satisfies MapDefinition;
  },
);

/** 小镇那一侧的六条：走到店门台阶上就进店。触发带按朝向推 */
export const shopEntrancePortals: MapPortal[] = enterablePlacements().map(
  ({ placement, definition }) => ({
    portalId: `${placement.instanceId}-entrance`,
    zone: buildingEntranceZone(placement),
    targetMapId: definition.interiorMapId!,
    localizationKey: definition.localizationKey,
  }),
);
