import type { MapDefinition } from "core";
import type { OutdoorTerrainBuilder } from "../Game3D/World/outdoorTerrain.js";
import { baseMapDefinition } from "./base/index.js";
import { buildBaseTerrain } from "./base/outdoor.js";
import { townMapDefinition } from "./town/index.js";
import { buildTownTerrain } from "./town/outdoor.js";

/**
 * 箱庭注册表。
 *
 * **一张箱庭 = 一个文件夹**（2026-08-09 定）：`Maps/<mapId>/` 里自带
 * 户型、外景、出入口，加一张图 = 新建一个兄弟文件夹 + 在下面这个数组
 * 里登记一行。在此之前一张图的东西散在三个包里（户型在 Core、外景在
 * Game3D/World/OutdoorScene、出生点在 Game/State/participants），加第二张
 * 图要同时改三处，还得记得哪处都别漏。
 *
 * 为什么整个搬出 Core（虽然别的内容注册表——物品、宠物、配方、门——
 * 都在 Core）：**一张箱庭必须连外景一起才完整**，而外景是 Three.js
 * 代码，进不了那个要给 Backend 复用的包。拆成"数据在 Core、外景在
 * Frontend"就又回到了散在两处。Backend 实际上也不需要地图定义——
 * 存档里存的是生成结果（MapSave），不是配方。
 *
 * 房间 id 必须**全世界唯一**（不只是本图内唯一）：实体只带 roomId，
 * 靠"这个房间属于哪张图"反查归属，重名会让实体串图。地图多了再上
 * audit（storyAudit 那一套）。
 *
 * home 已退役（2026-08-10）：据点 base 是它的继任者，继承了 living/yard
 * 两个房间名，老存档由迁移 v24 改名接入。
 */
export const mapDefinitions: MapDefinition[] = [
  baseMapDefinition,
  townMapDefinition,
];

export function findMapDefinition(mapId: string): MapDefinition | undefined {
  return mapDefinitions.find((definition) => definition.mapId === mapId);
}

/** 这个房间属于哪张图。实体只带 roomId，归属全靠它反查 */
export function mapOfRoom(roomId: string): MapDefinition | undefined {
  return mapDefinitions.find(
    (definition) =>
      definition.primaryRoomId === roomId ||
      definition.outdoorRoomId === roomId ||
      definition.extraRoomIds?.includes(roomId),
  );
}

/**
 * 各图的外景地形配方。放在这里而不是 MapDefinition 里：定义是 Core
 * 类型（纯数据、Backend 可读），地形是 Three.js 函数，进不了那个包。
 * 配方本体仍住在各自的文件夹（Maps/<id>/outdoor.ts）——一图一文件夹
 * 的规矩不破，这里只是登记表。
 */
const terrainBuilders: Record<string, OutdoorTerrainBuilder> = {
  base: buildBaseTerrain,
  town: buildTownTerrain,
};

/** 没登记外景的图给一块素草地兜底，别让新图一进去就掉进虚空 */
export function outdoorTerrainOf(mapId: string): OutdoorTerrainBuilder {
  return terrainBuilders[mapId] ?? buildTownTerrain;
}

export { baseMapDefinition, townMapDefinition };
