import type { MapDefinition } from "../../types/map.js";
import { homeMapDefinition } from "./home.js";

/**
 * 地图注册表。和 roomStyles / pets / items 同一个模式：
 * 数组是"有哪些"，find 是"按 id 查"，消费方不关心定义住在哪个文件。
 *
 * 加新地图 = 加一个数据文件 + 塞进这个数组。房间 id 必须全世界唯一
 * （见 MapDefinition 的归属规则注释），注册时自己保证，将来地图多了
 * 再上 audit（storyAudit 那一套）。
 */
export const mapDefinitions: MapDefinition[] = [homeMapDefinition];

export function findMapDefinition(mapId: string): MapDefinition | undefined {
  return mapDefinitions.find((definition) => definition.mapId === mapId);
}

export * from "./home.js";
