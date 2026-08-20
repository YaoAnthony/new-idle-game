import { useCallback } from "react";

import { useAppDispatch, useAppSelector, useAppStore } from "../../Redux/hooks";
import {
  closePanel,
  openPanel,
  selectIsPanelOpen,
  type PanelId,
} from "../../Redux/features/uiSlice";

type SetOpen = (next: boolean | ((current: boolean) => boolean)) => void;

/**
 * 面板的开关，接在全局面板栈上。用起来和 `useState(false)` 一样。
 *
 * 故意做成同样的 `[open, setOpen]` 形状：面板不该关心自己的开关状态存在哪儿，
 * 它只负责说"我开了 / 关我"。谁在最上面、ESC 该退哪一层，是 [EscArbiter] 的事。
 * 这也让改造只动一行——原来的 `setOpen(false)`、`setOpen(v => !v)` 全部照用。
 */
export function usePanel(id: PanelId): [boolean, SetOpen] {
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectIsPanelOpen(id));

  const setOpen = useCallback<SetOpen>(
    (next) => {
      // updater 形式要拿当下的值算，不能用上面那个 open——它是渲染那一刻的快照，
      // 在 window 监听器里调用时早就过期了
      const current = selectIsPanelOpen(id)(store.getState());
      const value = typeof next === "function" ? next(current) : next;
      dispatch(value ? openPanel(id) : closePanel(id));
    },
    [dispatch, id, store],
  );

  return [open, setOpen];
}
