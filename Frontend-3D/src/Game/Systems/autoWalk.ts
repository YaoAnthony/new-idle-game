import { emit, on } from "../EventBus";
import { listDoors } from "../State/doorsRuntime";
import { getCurrentMapId } from "../State/worldRuntime";
import { findRoute } from "./navigation";
import { findDestination, planRoute, type Destination, type RouteLeg } from "./travelPlan";

/**
 * 自动跑腿：说一个地名，人自己走过去，**跨图一路走到底**。
 *
 * 分工是清楚的三层，各管各的：
 * - `travelPlan` 说"要经过哪几张图、每张图上走到哪个门"；
 * - `navigation` 说"这张图上从这儿到那儿怎么绕"（会爬楼梯、会绕悬崖）；
 * - 本模块只做**串起来**：走完一段等换图、换完图接着下一段。
 *
 * 换图那一下**不用自己触发**：出入口本来就是踩上去就走的（tickPortalTravel
 * 在移动时跑）。自动行走把人送到触发带中心，换图就自然发生了——
 * 这也意味着自动走和玩家自己走出去，走的是同一条代码。
 */

type Plan = {
  destination: Destination;
  legs: RouteLeg[];
  /** 下一段的下标 */
  index: number;
};

let plan: Plan | null = null;

/** 把路点交给谁去走。RoomScene 在构造时注册（Game 层不碰 three） */
type Walker = {
  walk: (points: Array<[number, number]>, onArrive: () => void) => void;
  cancel: () => void;
  position: () => { x: number; z: number };
};
let walker: Walker | null = null;

export function setAutoWalker(next: Walker | null): void {
  walker = next;
  // 场景换了（换图/重建），上一份路点作废，但计划要留着接着走
  if (next && plan) queueMicrotask(() => driveCurrentLeg());
}

export function isAutoWalking(): boolean {
  return plan !== null;
}

export function cancelAutoWalk(reason: "player" | "done" | "failed"): void {
  if (!plan) return;
  const destination = plan.destination;
  plan = null;
  walker?.cancel();
  emit("auto_walk_ended", { label: destination.label, reason });
}

/** 路线经过的门（离路段一步之内）全部推开 */
function openDoorsAlong(points: Array<{ x: number; z: number } | [number, number]>): void {
  const at = (p: { x: number; z: number } | [number, number]) =>
    Array.isArray(p) ? { x: p[0], z: p[1] } : p;
  for (const door of listDoors()) {
    if (door.open || door.locked) continue;
    for (let i = 1; i < points.length; i += 1) {
      const a = at(points[i - 1]);
      const b = at(points[i]);
      // 门心到这条线段的距离
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const len2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((door.center.x - a.x) * vx + (door.center.z - a.z) * vz) / len2));
      const dx = door.center.x - (a.x + vx * t);
      const dz = door.center.z - (a.z + vz * t);
      if (Math.hypot(dx, dz) < 1.2) {
        door.interact();
        break;
      }
    }
  }
}

/** 走当前这一段：算路 → 交给行走器 → 到了再看下一段 */
function driveCurrentLeg(): void {
  if (!plan || !walker) return;
  const leg = plan.legs[plan.index];
  if (!leg) return cancelAutoWalk("done");

  /*
   * 段和图对不上就等着——换图是异步的（加载页 + 场景重建），
   * setAutoWalker 会在新场景就绪时再叫一次。
   */
  if (leg.mapId !== getCurrentMapId()) return;

  const from = walker.position();
  const points = findRoute(from, { x: leg.target.x, z: leg.target.z });
  if (!points) {
    emit("auto_walk_ended", { label: plan.destination.label, reason: "failed" });
    plan = null;
    return;
  }

  /*
   * 把这一段路上会经过的门先推开。导航是按门都能开算的路，
   * 门还关着就走过去等于穿墙——**开门是走路的一部分**，不是另一件事。
   * 锁着的门不动：那扇门在导航里本来也不算通路。
   */
  openDoorsAlong([from, ...points]);

  walker.walk(points, () => {
    if (!plan) return;
    plan.index += 1;
    if (plan.index >= plan.legs.length) return cancelAutoWalk("done");
    /*
     * 这一段的终点是出入口的话，此刻换图多半已经在路上了：
     * 什么都不做，等新场景 setAutoWalker 把下一段叫起来。
     * 不是出入口（只可能是最后一段）就直接接着走。
     */
    if (!leg.portal) driveCurrentLeg();
  });
}

export type AutoWalkResult =
  | { ok: true; label: string; legs: number }
  | { ok: false; reason: "unknown_place" | "no_route" };

/** 出发去某地。已经在走的话先取消旧的 */
export function autoWalkTo(query: string): AutoWalkResult {
  const destination = findDestination(query);
  if (!destination) return { ok: false, reason: "unknown_place" };

  const legs = planRoute(getCurrentMapId(), destination);
  if (!legs || legs.length === 0) return { ok: false, reason: "no_route" };

  if (plan) cancelAutoWalk("player");
  plan = { destination, legs, index: 0 };
  driveCurrentLeg();
  return { ok: true, label: destination.label, legs: legs.length };
}

let listening = false;
/** 玩家一动就接管——自动跑腿永远不该抢走操作权 */
export function initAutoWalk(): void {
  if (listening) return;
  listening = true;
  on("map_changed", ({ mapId }) => {
    if (!plan) return;
    /*
     * **换图时段号要在这里推进**，不能等行走器的到达回调——踩上出入口
     * 那一刻场景就被销毁了，那个回调永远不会来（实测：人走到东桥、
     * 顺利换到小镇，然后杵在落点不动）。
     *
     * 推进的方式是"跳到第一段属于新地图的"，不是简单 +1：玩家自己
     * 走进别的门、或者路线里有连续两段同图，这样都不会错位。
     */
    const next = plan.legs.findIndex(
      (leg, i) => i >= plan!.index && leg.mapId === mapId,
    );
    if (next < 0) return cancelAutoWalk("failed");
    plan.index = next;
    /*
     * **行走器在这里就要作废**，而且这一帧绝不能算路。
     * map_changed 比新场景的构造早，此刻 walker 还指着正在销毁的旧场景，
     * 它报的位置是**上一张图**的坐标——拿去新图上找路必然找不到，而
     * findRoute 失败会把整个计划判死。实测日志：
     *   route null from 18.6 -4.6 to -18 -28.65   ← 据点的坐标，小镇的目标
     * 行走器本来就是场景私有的，换图那一刻它就不再有效。真正开走由
     * 新场景的 setAutoWalker 负责。
     */
    walker = null;
  });
}
