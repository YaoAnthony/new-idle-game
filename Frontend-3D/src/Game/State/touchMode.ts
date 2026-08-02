import { emit } from "../EventBus";

/**
 * 这台设备该不该显示触摸操作（摇杆 + 动作按钮）。
 *
 * 判据用 `pointer: coarse` 而不是 UA 嗅探或屏幕宽度：
 * - UA 嗅探永远追不上新设备，而且用户改 UA 就失效
 * - 屏幕宽度会把"窄窗口的桌面浏览器"误判成手机——那种情况下玩家有鼠标，
 *   多出一个摇杆只是碍事
 * `pointer: coarse` 问的正是"主要指点设备精不精细"，触摸屏是 coarse、
 * 鼠标是 fine，这是唯一直接对应"该不该给触摸 UI"的信号。
 *
 * 二合一设备（带触摸屏的笔记本）会被判成 coarse 吗？不会——
 * 规范说 `pointer` 描述的是**主要**指点设备，有鼠标就是 fine。
 * 真想在那种设备上用触摸的人可以手动打开（见 `setTouchOverride`）。
 */

/** 手动覆盖：null = 跟随设备，true/false = 强制。调试命令和设置项用 */
let override: boolean | null = null;

function detect(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

let detected = detect();

export function isTouchMode(): boolean {
  return override ?? detected;
}

/**
 * 强制开关触摸操作。`null` 交还给设备判定。
 *
 * 存在的意义有两个：桌面上验证手机布局（不然只能真拿手机试），
 * 以及给那些"笔记本带触摸屏、就想用手指玩"的人一个出口。
 */
export function setTouchOverride(value: boolean | null): void {
  override = value;
  emit("touch_mode_changed", { touch: isTouchMode() });
}

export function getTouchOverride(): boolean | null {
  return override;
}

/**
 * 监听设备变化。**外接鼠标 / 拔掉鼠标是会变的**——平板插上妙控键盘那一刻
 * `pointer` 就从 coarse 变 fine，不跟着变的话摇杆会一直杵在那儿。
 */
export function startTouchModeWatch(): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const query = window.matchMedia("(pointer: coarse)");
  const onChange = (): void => {
    detected = query.matches;
    emit("touch_mode_changed", { touch: isTouchMode() });
  };

  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
