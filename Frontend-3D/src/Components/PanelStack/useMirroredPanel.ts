import { useEffect, useRef } from "react";

import type { PanelId } from "../../Redux/features/uiSlice";
import { usePanel } from "./usePanel";

/**
 * 给"载荷即开关"的面板用：工作台开在哪张桌子上、箱子开的是哪一个、
 * 奖励弹窗在拆哪个包裹——这些面板的开关不是一个布尔，而是"载荷有没有"。
 *
 * 载荷**不进** Redux。它们是游戏运行时状态（哪件家具、哪个箱子），归 Game/State；
 * Redux 那份只回答"哪些面板开着、谁在最上面"。所以这里做的是把两边对齐：
 *
 * - 载荷有了 → 入栈；载荷没了 → 出栈
 * - 栈里被弹掉了（玩家按了 ESC）→ 回头把载荷清空
 *
 * 第二条是关键：ESC 走的是栈，面板要是不跟着把载荷清掉，就会出现"栈里没它了、
 * 它还画在屏幕上"的分叉。
 *
 * @param isOpen 载荷在不在（`station !== null` 这种）
 * @param close  清空载荷的动作
 */
export function useMirroredPanel(
  id: PanelId,
  isOpen: boolean,
  close: () => void,
): void {
  const [openInStack, setOpen] = usePanel(id);

  // close 多半是每次渲染现造的箭头函数，进 deps 会让下面那个 effect 每帧重跑。
  // 存 ref 里，effect 只在"栈和载荷对不上"的时候被叫醒
  const closeRef = useRef(close);
  closeRef.current = close;

  /**
   * 上一次这块面板在不在栈里。
   *
   * 必须记这个，**不能只看"栈里没有但载荷还在"**：载荷刚设上的那一帧就是这个
   * 样子——入栈的 dispatch 在下面第一个 effect 里发出，而这一帧渲染时读到的
   * `openInStack` 还是 false。只比当前值的话，面板刚开就被自己判成"被弹出去了"
   * 而立刻清空载荷（实测就是开一下即灭）。要认的是**下降沿**：上一帧还在栈里、
   * 这一帧没了，那才是真的被 ESC 弹掉。
   */
  const wasInStack = useRef(false);

  useEffect(() => {
    setOpen(isOpen);
  }, [isOpen, setOpen]);

  useEffect(() => {
    if (wasInStack.current && !openInStack && isOpen) closeRef.current();
    wasInStack.current = openInStack;
  }, [openInStack, isOpen]);
}
