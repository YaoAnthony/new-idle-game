import { describe, expect, test } from "vitest";

import reducer, {
  closeAllPanels,
  closePanel,
  closeTopPanel,
  openPanel,
  selectHasBlockingPanel,
  selectIsPanelOpen,
  selectPanelStack,
  selectTopPanel,
  type PanelId,
} from "../src/Redux/features/uiSlice";
import type { RootState } from "../src/Redux/store";

/**
 * 面板栈。ESC 的分层退回全靠它。
 *
 * 它取代的是一个共享布尔 `blocking_panel_changed: { open }`：九块面板各自往里
 * 喊自己的开关，最后一个说话的人覆盖全场。实测过的坏结果——ESC 菜单里点"背包"，
 * 广播依次是"背包开了""菜单关了"，于是标志成了"没人开着"，下一次 ESC 既关了
 * 背包又把菜单弹出来，一次按键做了两件事。
 *
 * 所以这里盯的不是"能不能存住一个数组"，而是那几条**顺序**语义。
 */

const stackOf = (...ids: PanelId[]): RootState =>
  ({ ui: { panelStack: ids } }) as RootState;

const run = (state: PanelId[], ...actions: Parameters<typeof reducer>[1][]) =>
  actions.reduce(
    (current, action) => reducer(current, action),
    { panelStack: state },
  ).panelStack;

describe("入栈出栈", () => {
  test("后开的压在上面", () => {
    expect(run([], openPanel("backpack"), openPanel("settings"))).toEqual([
      "backpack",
      "settings",
    ]);
  });

  test("ESC 退最上面那一层，底下的留着", () => {
    expect(
      run([], openPanel("station"), openPanel("backpack"), closeTopPanel()),
    ).toEqual(["station"]);
  });

  test("关中间那一层不动别人", () => {
    // 面板自己的 × 按钮、走远了自动关，关的都不一定是最上面那块
    expect(
      run(["station", "backpack", "settings"], closePanel("backpack")),
    ).toEqual(["station", "settings"]);
  });

  test("已经开着的再开一次是提到最上层，不是入栈两遍", () => {
    // 不去重的话栈里会留下两条 backpack，ESC 得按两下才关得掉一块面板
    expect(
      run(["backpack", "settings"], openPanel("backpack")),
    ).toEqual(["settings", "backpack"]);
  });

  test("空栈上按 ESC 不炸", () => {
    expect(run([], closeTopPanel())).toEqual([]);
  });

  test("回标题清场", () => {
    // 栈活在 Redux 里，比面板组件活得久；不清的话下次进游戏菜单是开着的
    expect(run(["escMenu", "backpack"], closeAllPanels())).toEqual([]);
  });
});

describe("没变化就不换新状态", () => {
  /*
   * 载荷型面板（工作台/箱子/奖励弹窗）每次载荷变化都会同步一次开关，
   * 重复的开关请求要落在原地——否则每次都产出一个新数组，白白惊动所有订阅者。
   */
  test("重复关同一块", () => {
    const before = { panelStack: ["backpack"] as PanelId[] };
    expect(reducer(before, closePanel("settings"))).toBe(before);
  });

  test("重复开最上面那块", () => {
    const before = { panelStack: ["station", "backpack"] as PanelId[] };
    expect(reducer(before, openPanel("backpack"))).toBe(before);
  });

  test("空栈重复清场", () => {
    const before = { panelStack: [] as PanelId[] };
    expect(reducer(before, closeAllPanels())).toBe(before);
    expect(reducer(before, closeTopPanel())).toBe(before);
  });
});

describe("选择器", () => {
  test("谁在最上面", () => {
    expect(selectTopPanel(stackOf("station", "backpack"))).toBe("backpack");
    expect(selectTopPanel(stackOf())).toBeNull();
  });

  test("某块开着没有——问的是整个栈，不只是栈顶", () => {
    // ESC 菜单里开背包那条路径就是"底下还压着一块"，只看栈顶会漏
    const state = stackOf("station", "backpack");
    expect(selectIsPanelOpen("station")(state)).toBe(true);
    expect(selectIsPanelOpen("chat")(state)).toBe(false);
  });

  test("有没有面板挡着屏——剧情推迟过场、触摸端收按钮都问这个", () => {
    expect(selectHasBlockingPanel(stackOf())).toBe(false);
    expect(selectHasBlockingPanel(stackOf("reward"))).toBe(true);
  });

  test("栈本身读得出来", () => {
    expect(selectPanelStack(stackOf("daily"))).toEqual(["daily"]);
  });
});
