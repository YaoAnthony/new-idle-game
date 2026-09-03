import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { RootState } from "../store";

/**
 * 挡屏面板的开关。**全场唯一的真相源**。
 *
 * 原来没有这份状态：每块面板自己 `useState(open)`，然后往 EventBus 上喊一句
 * `blocking_panel_changed: { open }`，谁想知道"现在有没有面板挡着"就听这一句。
 * 九块面板往同一个布尔里喊，结果是**最后一个说话的人覆盖全场**——ESC 菜单里
 * 点"背包"那条路径实测广播是 `+背包 -菜单`，背包明明开着，标志却成了"没人开"，
 * 于是下一次 ESC 既关了背包又弹出了菜单，一次按键做了两件事。
 *
 * 现在改成"谁开着"本身进状态。派生的那个布尔（`selectHasBlockingPanel`）由栈
 * 算出来，没有人再能覆盖它。
 *
 * 放 Redux 而不是 Game/State：面板开关是 UI 态，[store.ts] 顶上写的分界就是
 * "Redux 只管账户与 UI 态，游戏运行时状态留在 Game/State"。persist 白名单只有
 * `user`，所以这份状态天然不落盘——不然会出现"关游戏时背包开着，下次进来还开着"。
 */

export type PanelId =
  | "backpack"
  | "actions"
  | "chat"
  | "settings"
  | "daily"
  /** 日记本（行动的新入口）。和 actions 并存到迁移完成为止 */
  | "diary"
  | "station"
  | "buildShop"
  /*
   * 石傀儡工坊里的"确认买下"小框。**单独占一层**，不是 buildShop 的内部状态：
   * ESC 该先退掉确认框、货架还留着，而"哪一层在最上面"只有面板栈知道。
   * 不入栈的话 ESC 会把整块面板一起关掉，玩家只是想说"这件先不买"。
   */
  | "purchase"
  | "trade"
  | "building"
  | "storage"
  | "shopShelf"
  | "consign"
  | "newspaper"
  | "reward"
  | "chest"
  | "escMenu";

type UiState = {
  /**
   * 开着的面板，**后开的在后面**。
   *
   * 是栈不是单值：ESC 菜单里点"背包"就是"菜单还开着的时候又开了一块"，两块
   * 同时在。单值会把先开的那块丢掉，ESC 只能关到最新那块，底下那层永远关不掉
   * ——玩家的感受是"有个面板卡住了"。栈的话 ESC 一层一层往回退，退到空了才轮到
   * 侧边栏。UI stack 是这类"层层叠加的界面"的通行做法。
   */
  panelStack: PanelId[];
};

const initialState: UiState = { panelStack: [] };

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    /** 开一块面板。已经开着的话是**提到最上层**，不是入栈两遍 */
    openPanel(state, action: PayloadAction<PanelId>) {
      // 已经在最上面就什么都不做：载荷型面板（工作台/箱子）每次载荷变化都会
      // 同步一次开关，不挡住的话每次都产出一个新数组，白白惊动所有订阅者
      const stack = state.panelStack;
      if (stack[stack.length - 1] === action.payload) return;

      state.panelStack = stack.filter((id) => id !== action.payload);
      state.panelStack.push(action.payload);
    },

    /**
     * 关掉指定的一块。
     *
     * 按 id 移除而不是弹栈顶：面板自己的关闭按钮、点遮罩关闭、以及"这块面板
     * 的数据没了所以它该关"（比如工作台被拆了）都可能关的不是最上面那块。
     */
    closePanel(state, action: PayloadAction<PanelId>) {
      if (!state.panelStack.includes(action.payload)) return;
      state.panelStack = state.panelStack.filter((id) => id !== action.payload);
    },

    /** ESC 专用：退一层 */
    closeTopPanel(state) {
      if (state.panelStack.length === 0) return;
      state.panelStack.pop();
    },

    /** 换地图、回标题这类"整个界面重来"时清场 */
    closeAllPanels(state) {
      if (state.panelStack.length === 0) return;
      state.panelStack = [];
    },
  },
});

export const { openPanel, closePanel, closeTopPanel, closeAllPanels } =
  uiSlice.actions;

export const selectPanelStack = (state: RootState): PanelId[] =>
  state.ui.panelStack;

/** 最上面那块，没有就是 null */
export const selectTopPanel = (state: RootState): PanelId | null =>
  state.ui.panelStack[state.ui.panelStack.length - 1] ?? null;

/**
 * 某块面板开着没有。
 *
 * 返回布尔而不是对象，所以每次渲染现造这个选择器不会让 useSelector 误判成
 * "变了"——真要缓存得用 createSelector，这里没必要。
 */
export const selectIsPanelOpen =
  (id: PanelId) =>
  (state: RootState): boolean =>
    state.ui.panelStack.includes(id);

/** 有没有任何一块挡着屏。剧情系统推迟过场、触摸端收按钮都问这个 */
export const selectHasBlockingPanel = (state: RootState): boolean =>
  state.ui.panelStack.length > 0;

export default uiSlice.reducer;
