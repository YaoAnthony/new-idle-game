import { findGroundDefinition, findItemDefinition, type GroundId } from "core";
import { emit } from "../EventBus";
import { getSelectedStack } from "../State/inventory";
import {
  canLayGround,
  groundAtWorld,
  groundCellAt,
  layGround,
  liftGround,
  type GroundCell,
  type LayWhy,
} from "../State/grounds";
import { t } from "../../i18n/t";
import { tf } from "../../i18n/format";

/**
 * 铺地的交互分派（地面系统 2026-09-18；2026-09-19 改成鼠标铺）。
 *
 * ## 两条路，各管各的
 *
 * **铺** 走鼠标：拿着地面物品就进铺地模式，光标跟着鼠标走、左键落一格
 * （`groundPaintTargetAt` + `layGroundHere`，交互层在 Game3D/Interaction/GroundPaintController）。
 * 用户 2026-09-19 点名要这个：铺路是连着铺一片的活儿，走到每一格跟前按一次 F 太笨，
 * 而室内装饰早就是"点哪儿放哪儿"——同一种动作不该有两种手感。
 *
 * **撬** 还在 F 上：锄头是工具，工具的动作（抡起来、砸下去）挂在 F 上，
 * 和锄地、浇水同一条路，不该因为撬的是地面就换一只手。
 *
 * ## 探针那一支只剩撬
 *
 * `groundTargetAt` 是**玩家身前探针**问的（按 F 那条链）。它现在只在
 * "手上是锄头且那格铺过"时给目标——否则院子里每一格都会抢走 F，
 * 站在门口按 F 开不了门。
 */

/**
 * 探针那条路现在只剩"撬"一种（铺走鼠标，见文件头），所以这里就一个 kind。
 * 留着 `lay` / `none` 两支当"以后可能用得上"是负债：它们谁都到不了，
 * 却要求每个 switch 都陪着写一遍。
 */
export type GroundAction = { kind: "lift"; groundId: GroundId };

export type GroundTarget = GroundCell & { action: GroundAction };

export function groundTargetAt(x: number, z: number): GroundTarget | null {
  const held = getSelectedStack();
  if (!held) return null;
  const at = groundCellAt(x, z);
  if (!at) return null;
  // 拿着地面物品不再走这条路：那是鼠标铺（见文件头），F 得让给门、居民这些
  if (findItemDefinition(held.itemId)?.tool?.toolType === "hoe") {
    const laid = groundAtWorld(x, z);
    if (laid) return { ...at, action: { kind: "lift", groundId: laid } };
  }
  return null;
}

/** 鼠标铺：这一格现在能不能落。`ok` 决定光标是绿是红，`why` 是点下去弹的那句 */
export type GroundPaintTarget = GroundCell & { ok: boolean; why?: LayWhy };

export function groundPaintTargetAt(x: number, z: number, groundId: GroundId): GroundPaintTarget | null {
  const at = groundCellAt(x, z);
  if (!at) return null;
  const verdict = canLayGround(x, z, groundId);
  // `verdict.ok` 直接当真值用，TS 不给窄（联合两支的 ok 都是字面量），写 === false
  if (verdict.ok === false) return { ...at, ok: false, why: verdict.why };
  return { ...at, ok: true };
}

/**
 * 鼠标铺：左键落一格。
 *
 * 落不下去时**只有"这一格已经铺过"是闷着的**——沿着已铺的路来回扫过去是常事，
 * 每扫一格弹一句就成了刷屏。领地外、屋里这些是真的说不清，弹一句。
 */
export function layGroundHere(target: GroundPaintTarget, groundId: GroundId): GroundResult {
  const result = layGround(target.x, target.z, groundId, { fromHand: true });
  if (result.ok === false) {
    if (result.why !== "occupied") {
      const definition = findGroundDefinition(groundId);
      emit("story_toast", {
        localizationKey: `ground.hint.${result.why}`,
        // 参数要自己拼好：story_toast 只认现成正文，不接 params
        text: tf(`ground.hint.${result.why}`, {
          ground: definition ? t(definition.localizationKey) : groundId,
        }),
        durationMs: 2000,
      });
    }
    return { ok: false, why: result.why };
  }
  return { ok: true, did: "lay", groundId: result.groundId };
}

export type GroundHint = { localizationKey: string; params?: Record<string, string>; action?: "interact" };

export function groundHintFor(target: GroundTarget): GroundHint {
  const definition = findGroundDefinition(target.action.groundId);
  const params = { ground: definition ? t(definition.localizationKey) : target.action.groundId };
  return { localizationKey: "ground.hint.lift", params, action: "interact" };
}

export type GroundResult =
  | { ok: true; did: "lay" | "lift"; groundId: GroundId }
  | { ok: false; why: LayWhy | "bare" | "bag_full" };

/** 按 F：撬（锄头）。toast 在这里发，场景只管动作 */
export function interactWithGroundCell(target: GroundTarget): GroundResult {
  const result = liftGround(target.x, target.z);
  if (result.ok === false) {
    if (result.why === "bag_full") emit("story_toast", { localizationKey: "ground.toast.bag_full", durationMs: 2200 });
    return { ok: false, why: result.why };
  }
  return { ok: true, did: "lift", groundId: target.action.groundId };
}
