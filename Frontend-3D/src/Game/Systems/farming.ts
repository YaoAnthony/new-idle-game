import {
  farmActionAt,
  farmStageAt,
  findItemDefinition,
  type FarmStage,
  type FarmState,
} from "core";

import { pushSystemMessage } from "../State/chatLog";
import { addItem, consumeSelectedOne, getSelectedStack } from "../State/inventory";
import { findPlacement, setBuildingState } from "../State/buildings";

/**
 * 农田的玩法：走过去按 F。**同一个键做不同的事，由地里的状态决定**——
 * 手上拿着种子就播种，干了就浇水，熟了就收获。
 *
 * 阶段本身是 Core 算的（`farmStageAt`，从时间戳推），这一层只做
 * "按下去发生什么"和"从背包里拿走 / 放回去"。
 */

function nowUtc(): string {
  return new Date().toISOString();
}

function stateOf(instanceId: string): FarmState | undefined {
  const placement = findPlacement(instanceId);
  const state = placement?.state;
  if (!state || typeof state.seedItemId !== "string") return undefined;
  if (typeof state.plantedUtc !== "string") return undefined;
  return {
    seedItemId: state.seedItemId,
    plantedUtc: state.plantedUtc,
    wateredUtc: typeof state.wateredUtc === "string" ? state.wateredUtc : undefined,
  };
}

function seedOf(state: FarmState | undefined) {
  return state ? findItemDefinition(state.seedItemId)?.seed : undefined;
}

/** 这块地现在什么样。视图和交互提示都问它 */
export function farmStageOf(instanceId: string): FarmStage {
  const state = stateOf(instanceId);
  return farmStageAt(state, seedOf(state), nowUtc());
}

export type FarmResult =
  | { ok: true; did: "sow" | "water" | "harvest"; detail?: string }
  | { ok: false; reason: "not_a_farm" | "nothing_to_do" };

/**
 * 按 F。**手上拿着什么会改变结果**，所以要先看选中格。
 *
 * 收获之后回到空地（清掉状态），不是"自动补种"——补种是玩家的决定，
 * 而且他手上未必还有种子。
 */
export function interactWithFarm(instanceId: string): FarmResult {
  const placement = findPlacement(instanceId);
  if (!placement || placement.buildingId !== "farm_plot") {
    return { ok: false, reason: "not_a_farm" };
  }

  const held = getSelectedStack();
  const heldSeed = held ? findItemDefinition(held.itemId)?.seed : undefined;
  const stage = farmStageOf(instanceId);
  const action = farmActionAt(stage, Boolean(heldSeed));

  if (action === "sow" && held && heldSeed) {
    consumeSelectedOne();
    setBuildingState(instanceId, {
      seedItemId: held.itemId,
      plantedUtc: nowUtc(),
      wateredUtc: undefined,
      stage: "planted",
    });
    return { ok: true, did: "sow" };
  }

  if (action === "water") {
    setBuildingState(instanceId, { wateredUtc: nowUtc(), stage: "growing" });
    return { ok: true, did: "water" };
  }

  if (action === "harvest") {
    const state = stateOf(instanceId);
    const seed = seedOf(state);
    if (state && seed) {
      addItem(seed.cropItemId, seed.yield);
      pushSystemMessage(`收了 ${seed.yield} 个`);
    }
    // 回到空地：状态整块清掉，不自动补种
    setBuildingState(instanceId, {
      seedItemId: undefined,
      plantedUtc: undefined,
      wateredUtc: undefined,
      stage: "empty",
    });
    return { ok: true, did: "harvest" };
  }

  return { ok: false, reason: "nothing_to_do" };
}

/**
 * 把当前阶段刷进实例状态，好让视图切那一组苗。
 *
 * 阶段是算出来的，但**视图需要一个可以监听的变化**——每帧去算一遍再比
 * 也行，但那样每块田每帧都要 parse 两个时间戳。定期刷一次便宜得多，
 * 而作物生长本来就不需要逐帧精度。
 */
export function tickFarms(instances: readonly string[]): void {
  for (const instanceId of instances) {
    const placement = findPlacement(instanceId);
    if (!placement || placement.buildingId !== "farm_plot") continue;
    const stage = farmStageOf(instanceId);
    if (placement.state?.stage !== stage) {
      setBuildingState(instanceId, { stage });
    }
  }
}
