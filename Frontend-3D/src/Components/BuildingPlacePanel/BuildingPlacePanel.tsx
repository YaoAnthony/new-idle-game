import { useEffect, useState } from "react";

import { emit, on } from "../../Game/EventBus";
import { t } from "../../i18n/t";

/**
 * 建筑选址的确认条（决策 B17 的 UI 那一半）。
 *
 * 两种状态，长得不一样：
 * - **还在挑**：只显示提示（"这块地还没开" / "金币罐挡住了"）。不放按钮
 *   ——这时候没有任何要按的东西，放个灰按钮只会让人去点它。
 * - **已选定**：出现 [确认] [重选] [取消]。虚影这时候停在地上不动，
 *   玩家可以走开绕一圈再回来按——这正是两步确认存在的理由。
 */

const REASON_TEXT: Record<string, string> = {
  outside_territory: "这块地还没开",
  overlaps_building: "那儿已经有别的建筑了",
  cell_occupied: "地上有东西挡着",
  max_instances: "这种建筑不能再多建了",
};

const VERB: Record<string, string> = {
  build: "建造",
  move: "移到这里",
  upgrade: "升级并落在这里",
};

type State = {
  active: boolean;
  mode?: "build" | "move" | "upgrade";
  valid?: boolean;
  reason?: string;
  committed?: boolean;
  label?: string;
};

export function BuildingPlacePanel() {
  const [state, setState] = useState<State>({ active: false });

  useEffect(() => on("building_placement_changed", (next) => setState(next)), []);

  if (!state.active) return null;

  const name = state.label ? t(state.label) : "";
  const verb = VERB[state.mode ?? "build"] ?? "建造";

  return (
    <div className="pointer-events-auto absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-2xl bg-[var(--cream-1)]/95 px-4 py-3 shadow-lg">
      {state.committed ? (
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--ink)]">
            在这里{verb}
            {name ? `「${name}」` : ""}？
          </span>
          <button
            type="button"
            className="rounded-lg bg-[#7fb069] px-3 py-1 text-[13px] text-white"
            onClick={() => emit("building_placement_action", { action: "confirm" })}
          >
            确认
          </button>
          <button
            type="button"
            className="rounded-lg bg-[var(--cream-3)] px-3 py-1 text-[13px]"
            onClick={() => emit("building_placement_action", { action: "reselect" })}
          >
            重选
          </button>
          <button
            type="button"
            className="rounded-lg px-3 py-1 text-[13px] text-[var(--ink-soft)]"
            onClick={() => emit("building_placement_action", { action: "cancel" })}
          >
            取消
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-[var(--ink-soft)]">
            {name ? `摆放「${name}」` : "选个位置"} · 点一下选定 · R 转向
          </span>
          {state.valid === false && (
            <span className="text-[#c9544a]">
              {REASON_TEXT[state.reason ?? ""] ?? "这儿不行"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
