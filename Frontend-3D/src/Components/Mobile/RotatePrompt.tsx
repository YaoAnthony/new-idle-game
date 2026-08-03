import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { isTouchMode } from "../../Game/State/touchMode";
import "./Mobile.css";

/**
 * 竖屏拦截页。
 *
 * **这个游戏只做横屏。** 不是"竖屏也能凑合玩"——底部那条带同时要放
 * 摇杆、快捷栏和动作按钮，横屏 375px 高已经排得很紧，竖屏 375px 宽
 * 连八格快捷栏都放不下（8×38 + 间距 = 344，几乎顶满整个屏宽，
 * 左边还压着摇杆的感应区）。与其做一套永远别扭的竖屏版式，
 * 不如明确要求转屏——玩家转一下手腕的成本，比一直用坏布局低得多。
 *
 * 只在**触摸设备**上拦：桌面把窗口拉窄拉高也会是竖的比例，但那种情况下
 * 玩家有鼠标键盘，一切都能用，弹一个"请旋转设备"只会莫名其妙。
 *
 * 判据用 `orientation: portrait` 而不是比较宽高数值——手机上软键盘弹出、
 * 地址栏收起都会改变可视高度，用数值比会在这些时刻误判来回闪。
 */

function isPortrait(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(orientation: portrait)").matches ?? false;
}

export function RotatePrompt() {
  const [blocked, setBlocked] = useState(() => isTouchMode() && isPortrait());

  useEffect(() => {
    const update = (): void => setBlocked(isTouchMode() && isPortrait());

    const query = window.matchMedia("(orientation: portrait)");
    query.addEventListener("change", update);
    /*
     * 同时听 resize：转屏一定会触发它，而 matchMedia 的 orientation change
     * 在部分 WebView / 嵌入式浏览器里不一定派发（本地预览窗就是一个：
     * 视口改成竖的之后查询结果已经是 true，change 却没来）。
     * 两个都听，谁先到都能纠正，update 本身是幂等的。
     */
    window.addEventListener("resize", update);
    /*
     * 也要跟着触摸模式变：平板插上鼠标就不该再拦（那时候是桌面用法），
     * 调试用的 /touch on 也走这条路径立即生效。
     */
    const off = on("touch_mode_changed", update);

    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      off();
    };
  }, []);

  if (!blocked) return null;

  return (
    <div className="rotate-prompt">
      {/* 一部手机从竖转横的示意：外框 + 转向箭头，比一行字直观 */}
      <svg
        className="rotate-prompt__icon"
        viewBox="0 0 120 120"
        aria-hidden="true"
      >
        <rect
          x="44"
          y="18"
          width="32"
          height="54"
          rx="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M30 86a34 34 0 0 0 60 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M86 78l6 10-11 2z" fill="currentColor" />
      </svg>

      <p className="rotate-prompt__title">请把手机横过来</p>
      <p className="rotate-prompt__body">这个小家是横着住的</p>
    </div>
  );
}
