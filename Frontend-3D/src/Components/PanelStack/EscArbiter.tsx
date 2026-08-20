import { useEffect } from "react";

import { emit } from "../../Game/EventBus";
import { useAppDispatch, useAppSelector, useAppStore } from "../../Redux/hooks";
import {
  closeAllPanels,
  closeTopPanel,
  openPanel,
  selectHasBlockingPanel,
  selectPanelStack,
} from "../../Redux/features/uiSlice";

/**
 * ESC 的唯一裁判。不画东西，只管"这一下 ESC 该退哪一层"。
 *
 * 原来九块面板各自在 window 上挂一个 ESC 监听：每块都关自己，ESC 菜单则靠一个
 * 共享布尔判断"该不该由我来开"。同一次按键会被九个监听各处理一遍，谁先谁后取决于
 * 挂载顺序，而那个布尔被最后一个说话的面板覆盖——实测出过"一次 ESC 既关了背包又
 * 弹出侧边栏"。裁判只有一个，就不存在谁先谁后，也没有需要同步的第二份状态。
 *
 * 规则两条：
 * 1. 栈里还有面板 → 退最上面那一层
 * 2. 栈空了 → 开侧边栏（它自己也是栈里的一层，所以再按一下就是退掉它）
 */
export function EscArbiter(): null {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const hasBlockingPanel = useAppSelector(selectHasBlockingPanel);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      /*
       * 按住不放时系统补发的 keydown 不算"又按了一次"。
       *
       * ESC 是"退一步"，按一下就该只退一步。不挡的话按住半秒：第一发关背包，
       * 补发的第二发接着把侧边栏开出来——手感上是"我只按了一下关背包，右边却
       * 弹出个东西"。这是实测出来的，不是防御性代码。
       */
      if (event.repeat) return;

      // 监听器只注册一次，状态得现读；useAppSelector 的值会被闭包冻在注册那一刻
      const stack = selectPanelStack(store.getState());

      if (stack.length > 0) {
        /*
         * 焦点在输入框里也照退。
         *
         * 这一条是从 Backpack 那边继承的教训：原来守卫挡在整个 handler 前面，
         * 先按过 ` 开命令行、或者点过任何输入框之后，ESC 就关不掉背包了。
         * 关闭是兜底操作，任何时候都得管用。真需要吞掉 ESC 的面板（聊天框在
         * 收补全列表）自己 stopPropagation，事件根本到不了这里。
         */
        dispatch(closeTopPanel());
        return;
      }

      // 但"凭空开一块面板"要守住：在输入框里敲 ESC 的人想的是退出这个输入，
      // 不是叫出菜单
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      dispatch(openPanel("escMenu"));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, store]);

  /*
   * 兼容层：老的 `blocking_panel_changed` 继续发，但**只有这一个发送方**，
   * 值由栈算出来。剧情系统（推迟过场）和触摸端（收起摇杆按钮）照旧听它，
   * 不用跟着改；而"九个人往一个布尔里喊"的毛病从源头没了。
   */
  useEffect(() => {
    emit("blocking_panel_changed", { open: hasBlockingPanel });
  }, [hasBlockingPanel]);

  /*
   * 离开游戏（回标题）时清场。
   *
   * 面板栈活在 Redux 里，**比这些面板组件活得久**——原来每块面板的 `open` 是
   * 组件自己的 useState，卸载就没了；现在不清的话，"开着 ESC 菜单点回到标题"
   * 会把 escMenu 留在栈里，下次进游戏一进去菜单就是开的。
   *
   * 挂在裁判身上是因为它的生死正好等于"游戏内 UI 在不在"。
   */
  useEffect(() => {
    return () => {
      dispatch(closeAllPanels());
      emit("blocking_panel_changed", { open: false });
    };
  }, [dispatch]);

  return null;
}
