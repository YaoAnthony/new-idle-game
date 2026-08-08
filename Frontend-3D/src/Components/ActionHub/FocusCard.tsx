import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { cancelAction, getActiveAction } from "../../Game/Systems/actions";
import { nowMs } from "../../Game/State/clock";
import { t } from "../../i18n/t";

/**
 * 专注中的倒计时卡（V0.13 从 ActionHub 抽出来）。
 *
 * 抽出来有两个理由，都不是"文件太长"这么表面：
 *
 * 1. **它是顶部中央那一栈的成员**，不是行动面板的一部分。留在 ActionHub
 *    里它就得自己 `absolute left-1/2 top-5`，于是和每日进度条抢同一个点
 *    ——两者靠 z-index 分胜负，专注一开始进度条就被盖住了。
 * 2. ActionHub 原来在专注时 **整个组件只渲染这张卡**（`if (active) return`），
 *    右上角那个"行动"按钮跟着消失。那个副作用是对的（专注时不该开面板），
 *    但把它写成"渲染分支"意味着两件无关的东西被焊死在一个返回值里。
 *
 * 现在这张卡自己订阅、自己决定出不出现；ActionHub 只需要在专注时把按钮
 * 收起来。全屏暗角是另一件事，见 FocusVignette。
 */

/** 毫秒 → mm 分 ss 秒 */
function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
}

export function FocusCard() {
  const [active, setActive] = useState(getActiveAction);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => on("action_changed", () => setActive(getActiveAction())), []);

  useEffect(() => {
    if (!active) return;
    const tick = () =>
      setRemaining(Math.max(0, active.startedAtMs + active.durationMs - nowMs()));
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  return (
    /*
     * 这张卡原来是深色玻璃（bg-black/70 + 白字），换奶油马卡龙皮肤时
     * 漏掉了。平时看不太出来，但白噪音台就浮在它旁边，一浅一深挨着
     * 才暴露——所以跟着换过来，两块面板是同一次专注里的同一件事。
     */
    <div className="ui-bar ui-dash relative px-5 py-3 text-center">
      <div className="text-[15px] font-bold text-[var(--ink)]">
        {active.customName}
      </div>
      <div className="mt-0.5 text-[13px] font-bold text-[var(--peach-deep)]">
        {formatMs(remaining)}
      </div>
      <button
        type="button"
        className="ui-tab mt-2 px-2.5 py-0.5 text-[12px]"
        onClick={cancelAction}
      >
        {t("ui.action.stop_early")}
      </button>
    </div>
  );
}

/**
 * 专注时的全屏暗角。**不能进顶部那一栈**——它是铺满屏幕的氛围层，
 * 塞进 flex 列会被当成一个有宽高的兄弟项，把下面的卡挤走。
 */
export function FocusVignette() {
  const [active, setActive] = useState(() => Boolean(getActiveAction()));

  useEffect(
    () => on("action_changed", ({ status }) => setActive(status === "started")),
    [],
  );

  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 shadow-[inset_0_0_140px_rgb(0_0_0_/_0.45)]" />
  );
}
