import { findGroundDefinition, findItemDefinition, groundOfItem, type GroundId } from "core";
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

/**
 * 铺地的交互分派（地面系统 2026-09-18）：探针落在哪格、手上的东西决定能做什么、气泡说什么。
 * 和田同一条纪律：气泡和 F 问的是同一个判定，"气泡说能按、按了没反应"不可能出现。
 *
 * 只在**手上是地面物品**或**手上是锄头且那格铺过**时才给目标——否则院子里每一格
 * 都会抢走 F，站在门口按 F 开不了门。
 */

export type GroundAction =
  | { kind: "lay"; groundId: GroundId }
  | { kind: "lift"; groundId: GroundId }
  | { kind: "none"; groundId: GroundId; why: LayWhy };

export type GroundTarget = GroundCell & { action: GroundAction };

export function groundTargetAt(x: number, z: number): GroundTarget | null {
  const held = getSelectedStack();
  if (!held) return null;
  const at = groundCellAt(x, z);
  if (!at) return null;
  const ground = groundOfItem(held.itemId);
  if (ground) {
    const verdict = canLayGround(x, z, ground.groundId);
    if (verdict.ok === false) return { ...at, action: { kind: "none", groundId: ground.groundId, why: verdict.why } };
    return { ...at, action: { kind: "lay", groundId: ground.groundId } };
  }
  if (findItemDefinition(held.itemId)?.tool?.toolType === "hoe") {
    const laid = groundAtWorld(x, z);
    if (laid) return { ...at, action: { kind: "lift", groundId: laid } };
  }
  return null;
}

export type GroundHint = { localizationKey: string; params?: Record<string, string>; action?: "interact" };

export function groundHintFor(target: GroundTarget): GroundHint {
  const definition = findGroundDefinition(target.action.groundId);
  const params = { ground: definition ? t(definition.localizationKey) : target.action.groundId };
  switch (target.action.kind) {
    case "lay":
      return { localizationKey: "ground.hint.lay", params, action: "interact" };
    case "lift":
      return { localizationKey: "ground.hint.lift", params, action: "interact" };
    case "none":
      return { localizationKey: `ground.hint.${target.action.why}`, params };
  }
}

export type GroundResult =
  | { ok: true; did: "lay" | "lift"; groundId: GroundId }
  | { ok: false; why: LayWhy | "bare" | "bag_full" };

/** 按 F：铺 / 撬。toast 在这里发，场景只管动作 */
export function interactWithGroundCell(target: GroundTarget): GroundResult {
  if (target.action.kind === "lay") {
    const result = layGround(target.x, target.z, target.action.groundId, { fromHand: true });
    if (result.ok === false) return { ok: false, why: result.why };
    return { ok: true, did: "lay", groundId: result.groundId };
  }
  if (target.action.kind === "lift") {
    const result = liftGround(target.x, target.z);
    if (result.ok === false) {
      if (result.why === "bag_full") emit("story_toast", { localizationKey: "ground.toast.bag_full", durationMs: 2200 });
      return { ok: false, why: result.why };
    }
    return { ok: true, did: "lift", groundId: target.action.groundId };
  }
  return { ok: false, why: target.action.why };
}
