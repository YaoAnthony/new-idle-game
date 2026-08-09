import type { MapDefinition } from "core";
import { homeMapDefinition } from "./home/index.js";

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
 */
export const mapDefinitions: MapDefinition[] = [homeMapDefinition];

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

export { homeMapDefinition };
