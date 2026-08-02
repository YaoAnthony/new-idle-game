import { useEffect, useRef } from "react";
import "./Mobile.css";

/**
 * 虚拟摇杆（浮动式）。
 *
 * **浮动而不是固定**：屏幕左下角整片区域都是感应区，手指按在哪儿摇杆就
 * 出现在哪儿。固定式要求玩家先瞄准那个圆再按下去，而手机是盲操作——
 * 眼睛盯着角色，拇指落点每次都不一样。主流手游（Brawl Stars 那一档）
 * 全是浮动式，就是这个原因。代价是感应区内不能有别的可点元素，
 * 所以左下角那块留给它，别的 UI 不往那儿摆。
 *
 * 自己写而不是引库：调研过 react-joystick-component（71KB、2023 年后没
 * 再更新）和 nipplejs（487KB、命令式操作 DOM、自带一套样式）。摇杆本身
 * 就是这一百行指针数学，而两个库都得再把样式改回本项目的手绘皮肤，
 * 更别说真正的工作量在"向量怎么喂进角色控制器"——那部分没有库能帮忙。
 *
 * ## 为什么全程用 ref + 直接改 DOM，不用 state
 *
 * 第一版把圆心和旋钮位置放在 `useState` 里，实测**第一次 pointermove 丢了**：
 * `pointerdown` 里 `setOrigin(...)` 还没 flush，紧接着的 `pointermove`
 * 读到的闭包里 origin 仍是 null，直接 return。真机上两个事件之间通常隔了
 * 一帧所以侥幸能用，但按下就立刻滑动的那一下必然丢失。
 * 指针事件是**输入频率**（每秒上百次）的东西，让它等 React 渲染周期
 * 本身就是错的——顺带也省掉了每次移动重渲染一次组件。
 */

/** 摇杆半径（px）。拇指推到边缘时的最大位移 */
const RADIUS = 56;

/**
 * 死区（px）。手指落下时的轻微抖动不该让角色挪窝——
 * 没有死区的话，静止按住摇杆时角色会以亚像素速度缓慢漂移。
 */
const DEAD_ZONE = 8;

type Props = {
  /** 推杆方向（各轴 -1~1，z 为负是往前，和 WASD 同一套语义） */
  onMove: (x: number, z: number) => void;
};

export function Joystick({ onMove }: Props) {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  /** 圆心（视口坐标）。null = 现在没在按 */
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  /**
   * `onMove` 放进 ref：它是每次渲染都会重建的闭包，
   * 直接用会让下面的处理函数抓着旧的那一份。
   */
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // 卸载时把速度归零。不归零的话，推着摇杆切到别的界面，角色会一直走下去
  useEffect(() => () => onMoveRef.current(0, 0), []);

  const showBase = (x: number, y: number): void => {
    const base = baseRef.current;
    if (!base) return;
    base.style.left = `${x}px`;
    base.style.top = `${y}px`;
    base.style.opacity = "1";
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
  };

  const hideBase = (): void => {
    if (baseRef.current) baseRef.current.style.opacity = "0";
  };

  const handleDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    /**
     * **新按下的手指直接接管，不做"已经有人在按就忽略"的判断。**
     *
     * 第一版写的是 `if (pointerIdRef.current !== null) return;`，本意是
     * "多指同时按只认第一根"。但它会**永久卡死**：只要有一次 pointerup
     * 没送达——手指滑出感应区、被系统手势（侧边返回、通知栏下拉）打断、
     * 或者 pointercancel 走了别的路径——这个 ref 就一直是非 null，
     * 之后每一次按下都被挡在门外，摇杆彻底失灵且没有任何恢复途径。
     * 实测就是这么发现的：调试期间派发过一次没配对 pointerup 的按下，
     * 之后怎么拖都没反应。
     *
     * 换成后来者接管：多指同时按的最坏情况只是"跟最后按下的那根手指走"，
     * 一帧就自我修正；而卡死是不可恢复的。
     */
    pointerIdRef.current = event.pointerId;
    /**
     * setPointerCapture 会抛（指针已经释放、或者是合成事件）。
     * 抓不到捕获只是"手指滑出感应区后跟丢"，不该让整个按下流程中断——
     * 尤其不能中断到 originRef 都没设上，那样后续 move 全部空转。
     */
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 忽略：没有捕获也能正常推杆，只是滑出边界时会断
    }
    originRef.current = { x: event.clientX, y: event.clientY };
    showBase(event.clientX, event.clientY);
  };

  const handleMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const origin = originRef.current;
    if (pointerIdRef.current !== event.pointerId || !origin) return;

    const rawX = event.clientX - origin.x;
    const rawY = event.clientY - origin.y;
    const distance = Math.hypot(rawX, rawY);

    // 超出半径就贴着边缘走，杆不会被拖出底座
    const clamped = Math.min(distance, RADIUS);
    const scale = distance > 0 ? clamped / distance : 0;
    if (knobRef.current) {
      knobRef.current.style.transform =
        `translate(${rawX * scale}px, ${rawY * scale}px)`;
    }

    if (distance < DEAD_ZONE) {
      onMoveRef.current(0, 0);
      return;
    }

    /**
     * 归一化到 0~1：**从死区边缘开始算**，不是从圆心算。
     * 从圆心算的话，刚出死区就已经有 0.14 的速度，人物会一跳一跳地起步。
     */
    const magnitude = (clamped - DEAD_ZONE) / (RADIUS - DEAD_ZONE);
    // 屏幕的"上"是往前走：屏幕 y 向下为正，而前进是 z 为负，正好同号
    onMoveRef.current((rawX / distance) * magnitude, (rawY / distance) * magnitude);
  };

  const handleUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    originRef.current = null;
    hideBase();
    onMoveRef.current(0, 0);
  };

  return (
    <div
      className="joystick-zone"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      {/* 底座常驻 DOM、靠 opacity 显隐：每次按下都挂载/卸载一个节点的话，
          第一帧还没布局好，摇杆会从屏幕左上角闪一下再跳到手指位置 */}
      <div ref={baseRef} className="joystick-base" style={{ opacity: 0 }}>
        <div ref={knobRef} className="joystick-knob" />
      </div>
    </div>
  );
}
