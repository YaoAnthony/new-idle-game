import { FurnitureCapability, type BathWater } from "core";
import { on } from "../EventBus";
import { getResting } from "../State/posture";
import {
  advanceBathWater,
  getDefinition,
  getWorld,
  setBathWater,
} from "../State/worldRuntime";

/**
 * 浴缸（2026-08-19）：空缸 → 注水 → 满 → 泡 → 起身放水 → 空缸。
 *
 * 水位是实例状态（PlacedFurnitureState.water：level 0..1 + flow），
 * 这里是推进它的唯一地方：
 * - `requestFill`  空缸按 F：flow=in，开始涨（约 FILL_SECONDS 涨满）
 * - `tickBath`     每帧按速率推进；到顶置 still，到底清空——这两处是
 *                  **转折点**，走 setBathWater 发 op；中间逐帧只改本地
 * - 起身自动放水：听 posture_changed，上一拍坐在满缸里、这一拍不坐了
 *                  → flow=out。挂在 posture 事件上而不是 standUp 里，
 *                  是不让坐卧系统反过来知道"浴缸"这个具体家具
 *
 * 速率写死在这里不进数据：它是手感，不是平衡数值；注水 6 秒是"按下去
 * 看得见它在涨、又不至于等得无聊"的长度，放水快一点（4 秒）——放水是
 * 收尾，没人想盯着看。
 */

export const FILL_SECONDS = 6;
export const DRAIN_SECONDS = 4;

export type BathPhase = "empty" | "filling" | "full" | "draining";

function isBath(furnitureId: string): boolean {
  return (
    getDefinition(furnitureId)?.placement.capabilities.includes(
      FurnitureCapability.Bath,
    ) ?? false
  );
}

/** 这只缸现在处于哪一步（给交互链和气泡用） */
export function bathPhaseOf(instanceId: string): BathPhase {
  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  const water = placed?.state.water;
  if (!water) return "empty";
  if (water.flow === "in") return "filling";
  if (water.flow === "out") return "draining";
  return water.level >= 1 ? "full" : "empty";
}

/** 空缸按 F：开始注水。别的阶段按 F 什么都不做（返回 false） */
export function requestFill(instanceId: string): boolean {
  if (bathPhaseOf(instanceId) !== "empty") return false;
  const water: BathWater = { level: 0, flow: "in" };
  return setBathWater(instanceId, water);
}

/** 满缸放水（起身自动调；也给以后"手动放水"留的口） */
export function requestDrain(instanceId: string): boolean {
  const phase = bathPhaseOf(instanceId);
  if (phase !== "full" && phase !== "filling") return false;
  const placed = getWorld().placedFurniture.find(
    (item) => item.instanceId === instanceId,
  );
  const level = placed?.state.water?.level ?? 1;
  return setBathWater(instanceId, { level, flow: "out" });
}

/** 每帧：所有在涨/在放的缸按速率推进；到顶/到底发转折 */
export function tickBath(deltaSeconds: number): void {
  for (const placed of getWorld().placedFurniture) {
    const water = placed.state.water;
    if (!water || water.flow === "still") continue;
    if (water.flow === "in") {
      const next = water.level + deltaSeconds / FILL_SECONDS;
      if (next >= 1) setBathWater(placed.instanceId, { level: 1, flow: "still" });
      else advanceBathWater(placed.instanceId, next);
    } else {
      const next = water.level - deltaSeconds / DRAIN_SECONDS;
      if (next <= 0) setBathWater(placed.instanceId, null);
      else advanceBathWater(placed.instanceId, next);
    }
  }
}

/**
 * 起身自动放水。记住上一拍坐在哪只缸里；posture 变了之后不在缸里了，
 * 就给那只缸放水。只看"满缸"——注水到一半就起身的也放（不留半缸）。
 */
let soakingIn: string | null = null;

export function startBathSystem(): () => void {
  const sync = (): void => {
    const resting = getResting();
    const now =
      resting && isBath(
        getWorld().placedFurniture.find((item) => item.instanceId === resting.instanceId)
          ?.furnitureId ?? "",
      )
        ? resting.instanceId
        : null;
    if (soakingIn && soakingIn !== now) requestDrain(soakingIn);
    soakingIn = now;
  };
  sync();
  const off = on("posture_changed", sync);
  return () => {
    off();
    soakingIn = null;
  };
}
