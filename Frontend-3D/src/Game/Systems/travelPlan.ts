import type { MapDefinition, MapPortal } from "core";
import { findMapDefinition, mapDefinitions } from "../../Maps/index";
import { SHOP_SPECS, shopDoorAt } from "../../Maps/town/shops";
import { t } from "../../i18n/t";

/**
 * "去某个地方"的两件数据：**能去哪儿**（地名表）和**怎么过去**（图与图
 * 之间的路线）。
 *
 * 两样都**从注册表推导，不写死**：地名表是每张图 + 每家店各一条，
 * 出入口构成的图是从各图的 portals 现算的。以后加一张图、加一家店，
 * 这里一行不用改——写死一张表的话，加内容要记得同步两处，那是
 * 迟早对不上的活。
 */

export type Destination = {
  /** 匹配用的关键词（店名、图名、id 片段），全小写 */
  keys: string[];
  label: string;
  mapId: string;
  /** 到了那张图之后往哪走。不给就用那张图的出生点 */
  spot?: { x: number; z: number };
};

/** 所有能去的地方。地图各一条 + 六家店各一条（店走它在小镇的门口） */
export function destinations(): Destination[] {
  const list: Destination[] = [];

  for (const map of mapDefinitions) {
    const label = t(map.localizationKey as never) || map.mapId;
    list.push({
      keys: [map.mapId.toLowerCase(), label.toLowerCase()],
      label,
      mapId: map.mapId,
    });
  }

  /*
   * 店铺额外挂一条"小镇里那扇门"的别名：说"去书店"时，如果人还在
   * 别的图上，路线本来就会先到小镇再进店；但如果只想走到门口不进去，
   * 门口这条也得能点名。
   */
  for (const spec of SHOP_SPECS) {
    const door = shopDoorAt(spec);
    list.push({
      keys: [`${spec.shopId}门口`, `${spec.name}门口`],
      label: `${spec.name}门口`,
      mapId: "town",
      spot: { x: door.x, z: door.z + 1.6 },
    });
  }

  return list;
}

/** 按关键词找地方。先精确后包含，短的优先（"书店" 不该被 "书店门口" 抢走） */
export function findDestination(query: string): Destination | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const all = destinations();
  return (
    all.find((d) => d.keys.some((k) => k === q)) ??
    all
      .filter((d) => d.keys.some((k) => k.includes(q)))
      .sort((a, b) => a.label.length - b.label.length)[0]
  );
}

export type RouteLeg = {
  /** 这一段在哪张图上走 */
  mapId: string;
  /** 走到哪儿。踩上去会触发换图的那种就是出入口，最后一段是目的地 */
  target: { x: number; z: number };
  /** 这一段的终点是个出入口（走到就会换图），最后一段没有 */
  portal?: MapPortal;
};

/** 出入口图：这张图能直达哪些图，各走哪个门 */
function exitsOf(map: MapDefinition): MapPortal[] {
  return map.portals ?? [];
}

/** 触发带的中心。走到这儿就会换图 */
function portalSpot(portal: MapPortal): { x: number; z: number } {
  return {
    x: (portal.zone.minX + portal.zone.maxX) / 2,
    z: (portal.zone.minZ + portal.zone.maxZ) / 2,
  };
}

/**
 * 从当前图到目标图的整条路线，逐段给出。
 *
 * BFS 找**最少换图次数**的走法——不是最短距离。跨图的代价（加载页、
 * 打断感）远大于图内多走几步，少换一次图永远更值。
 */
export function planRoute(
  fromMapId: string,
  destination: Destination,
): RouteLeg[] | null {
  if (fromMapId === destination.mapId) {
    const spot = destination.spot ?? spawnSpot(destination.mapId);
    return spot ? [{ mapId: fromMapId, target: spot }] : null;
  }

  // BFS：记每张图是从哪张图、走哪个门到的
  const cameFrom = new Map<string, { mapId: string; portal: MapPortal }>();
  const queue = [fromMapId];
  const seen = new Set([fromMapId]);
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === destination.mapId) break;
    const current = findMapDefinition(currentId);
    if (!current) continue;
    for (const portal of exitsOf(current)) {
      if (seen.has(portal.targetMapId)) continue;
      seen.add(portal.targetMapId);
      cameFrom.set(portal.targetMapId, { mapId: currentId, portal });
      queue.push(portal.targetMapId);
    }
  }
  if (!seen.has(destination.mapId)) return null;

  // 从终点回溯出图序列
  const chain: Array<{ mapId: string; portal: MapPortal }> = [];
  let cursor = destination.mapId;
  while (cursor !== fromMapId) {
    const step = cameFrom.get(cursor);
    if (!step) return null;
    chain.unshift({ mapId: step.mapId, portal: step.portal });
    cursor = step.mapId;
  }

  const legs: RouteLeg[] = chain.map((step) => ({
    mapId: step.mapId,
    target: portalSpot(step.portal),
    portal: step.portal,
  }));

  const finalSpot = destination.spot ?? spawnSpot(destination.mapId);
  if (finalSpot) legs.push({ mapId: destination.mapId, target: finalSpot });
  return legs;
}

function spawnSpot(mapId: string): { x: number; z: number } | null {
  const map = findMapDefinition(mapId);
  if (!map) return null;
  // MapDefinition.spawn 的 y 就是世界 z（和 portal.landing 同一套约定）
  return { x: map.spawn.x, z: map.spawn.y };
}
