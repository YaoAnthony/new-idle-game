import { useEffect, useState } from "react";

import { emit, on } from "../../Game/EventBus";
import { t } from "../../i18n/t";

/**
 * 建筑选址的两种界面（决策 B17 的 UI 那一半）。
 *
 * - **还在挑**：底部一条细提示（"这块地还没开" / "点一下选定 · R 转向"）。
 *   这时候玩家正在用鼠标挪虚影，界面必须让开——遮住地面就没法选位置了。
 *   不放按钮：这时候没有任何要按的东西，放个灰按钮只会让人去点它。
 * - **已选定**：**一块居中的确认弹窗**。
 *
 * ## 为什么选定之后要用弹窗（2026-08-23 改）
 *
 * 上一版两种状态都是底部那条细带子，按钮只有一行小字那么高。用户的原话
 * 是"这个应该是 modal，而不是在下面搞一个小小的 confirm 这个鬼看得见"——
 * 确实：那是**一次不可撤销的下单**（扣材料、占一块地），却和"R 转向"
 * 那句提示长得一样重，很容易被当成提示忽略过去。
 *
 * 用弹窗，但**背景只压暗不遮死**（`bg-black/35`）：虚影还停在地上，
 * 玩家得看得见自己要确认的是哪一块地。这也是两步确认存在的理由——
 * 选定之后虚影不动，可以走开绕一圈再回来按。
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

  // 选定状态下 ESC = 重选（退回跟着鼠标走），不是直接取消整单
  useEffect(() => {
    if (!state.active || !state.committed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      emit("building_placement_action", { action: "reselect" });
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [state.active, state.committed]);

  if (!state.active) return null;

  const name = state.label ? t(state.label) : "";
  const verb = VERB[state.mode ?? "build"] ?? "建造";

  // ---- 还在挑：底部细提示，绝不遮住地面 ----
  if (!state.committed) {
    return (
      <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-2xl bg-[var(--cream-1)]/95 px-4 py-3 shadow-lg">
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
      </div>
    );
  }

  // ---- 已选定：确认弹窗 ----
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex justify-center pt-[16vh]">
      {/*
       * 压暗但不遮死：虚影还停在地上，要确认的正是"它在那儿对不对"。
       * 点背景 = 重选（等同 ESC），符合"点弹窗外面就退出去"的直觉。
       *
       * 弹窗**不居中**，往上顶到 16vh：虚影贴着地面、在屏幕中下部，
       * 正中的弹窗会正好压住它——那就成了"让你确认一个你看不见的东西"。
       */}
      <button
        type="button"
        aria-label="重选"
        className="absolute inset-0 cursor-default bg-black/35"
        onClick={() => emit("building_placement_action", { action: "reselect" })}
      />

      <div className="ui-bar relative h-fit w-[min(380px,88vw)] px-7 py-6 text-center shadow-2xl">
        <div className="text-[17px] font-bold leading-snug text-[var(--ink)]">
          在这里{verb}
          {name ? `「${name}」` : ""}？
        </div>
        <div className="mt-1.5 text-[12px] text-[var(--ink-soft)]">
          确认之后石傀儡会走过来施工
        </div>

        <div className="mt-4 flex items-center justify-center gap-2.5">
          <button
            type="button"
            className="rounded-xl bg-[#7fb069] px-6 py-2.5 text-[15px] font-bold text-white shadow-[0_2px_0_#5d8a4c]"
            onClick={() => emit("building_placement_action", { action: "confirm" })}
          >
            确认
          </button>
          <button
            type="button"
            className="rounded-xl bg-[var(--cream-3)] px-4 py-2 text-[13px] font-semibold text-[var(--ink)]"
            onClick={() => emit("building_placement_action", { action: "reselect" })}
          >
            重选
          </button>
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-[13px] text-[var(--ink-soft)]"
            onClick={() => emit("building_placement_action", { action: "cancel" })}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
