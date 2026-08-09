import { findMapDefinition } from "../../Maps/index.js";
import { emit } from "../EventBus";
import { isInSession } from "../Net/session";
import { restoreLocalPosition } from "../State/participants";
import { switchMapState } from "../State/world/entities";
import { getCurrentMap, getCurrentMapId } from "../State/worldRuntime";
import { saveNow } from "../../Data/Save/autosave";
import { standUp } from "./resting";

/**
 * 箱庭旅行（①B）：从一张图去另一张图。
 *
 * 分工：状态机械在 world/entities 的 switchMapState（无条件成功），
 * **这里管"现在能不能走、走完站哪、谁来重建场景"**：
 *
 * - 联机时一律不许切（isInSession 同时覆盖房主和房客）。规则定为
 *   "做客的人不能出去"，房主也一起挡住——房主切走会把房客留在一个
 *   没有权威的世界里，比不让切更糟。协议因此一行不用动：一个房间里
 *   的人永远在同一张图上。
 * - 坐着先起身：restingOn 引用的是旧图的家具锚点，带着它切图，
 *   新图会试图把人摆到一件不存在的家具上。
 * - 落点是目标图的出生点（阶段②的传送门会带自己的落点，走同一条路）。
 * - 场景重建交给 GameView：这里只发 map_changed，React 那头拆旧建新。
 * - 切完立刻落盘：换图是大事务，不该赌下一次 autosave。
 */

export type TravelResult =
  | { ok: true }
  | { ok: false; reason: "unknown_map" | "already_there" | "in_session" };

export function travelTo(
  mapId: string,
  /** 落点（出入口带自己的；不给就用目标图出生点） */
  landing?: { x: number; y: number; heading: number },
): TravelResult {
  if (mapId === getCurrentMapId()) {
    return { ok: false, reason: "already_there" };
  }

  const target = findMapDefinition(mapId);
  if (!target) return { ok: false, reason: "unknown_map" };

  if (isInSession()) return { ok: false, reason: "in_session" };

  // 起身失败也无妨（本来就站着时 standUp 返回 false）
  standUp("moved");

  switchMapState(target);

  const arrive = landing ?? target.spawn;

  /*
   * 站到目标图的出生点。要在场景重建**之前**写好——新 RoomScene 的
   * CharacterController 构造时从 participants 读初值。
   *
   * 用 restoreLocalPosition 不用 setLocalTransform：后者不写 mapId，
   * 存盘时 position.mapId 还是旧图，重开游戏就落回去了。它顺带清空
   * participants 表——单机没别人，联机被上面的守卫挡了，清空无害。
   */
  restoreLocalPosition({
    mapId: target.mapId,
    x: arrive.x,
    y: arrive.y,
    heading: arrive.heading,
  });

  emit("map_changed", {
    mapId: target.mapId,
    localizationKey: target.localizationKey,
  });

  // 换图是大事务，落盘不等下一次 autosave。
  // 失败要吞掉（headless 校验没有 IndexedDB；隐身窗口也可能拒绝），
  // 存不上盘不该把"人已经到了"这件事炸回去
  void saveNow().catch(() => {});

  lastTravelAt = Date.now();
  return { ok: true };
}

/** 出入口触发的冷却。落点都设计在对面触发区之外，这层只是保险 */
const PORTAL_COOLDOWN_MS = 1000;
let lastTravelAt = 0;

/**
 * 玩家走进出入口区就切图（箱庭②）。RoomScene 的交互节流循环
 * （0.15s 一次）喂坐标进来——出入口是"踩上去就走"的地面，
 * 不是要按 F 的门，参照动森的镇口。
 */
export function tickPortalTravel(x: number, z: number): void {
  if (Date.now() - lastTravelAt < PORTAL_COOLDOWN_MS) return;

  for (const portal of getCurrentMap().portals ?? []) {
    const { zone } = portal;
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
      travelTo(portal.targetMapId, portal.landing);
      return;
    }
  }
}
