import { beforeEach, describe, expect, test } from "vitest";

import {
  DEFAULT_INPUT_BINDINGS,
  INPUT_ACTIONS,
  bindingFromKeyboardEvent,
  getBindings,
  isActionDown,
  isAllowedCode,
  labelForCode,
  matchesAction,
  normalizeBindings,
  resetBindings,
  setBindings,
  subscribeBindings,
} from "../src/Game/Input/bindings";

/**
 * 键位映射层。移植自 Oldfrontend 的 InputBindingDefinitions，是"键位可改"
 * 的地基——游戏里所有按键判断都问它。
 *
 * 两条最要命的：
 * - **认 code 不认 key**。存字符的话非 QWERTY 布局上 WASD 直接错位；
 * - **绝不能洗出空绑定**。空了那个动作就永远按不出来，而玩家看不出为什么。
 */

beforeEach(() => {
  localStorage.clear();
  resetBindings();
});

const keyEvent = (code: string): KeyboardEvent =>
  new KeyboardEvent("keydown", { code });

describe("默认绑定", () => {
  test("bindings_every_action_has_at_least_one_code", () => {
    // Arrange & Act
    const bindings = getBindings();

    // Assert：任何一个动作绑不到键就等于这个动作消失了
    for (const action of INPUT_ACTIONS) {
      expect(bindings[action].codes.length).toBeGreaterThan(0);
      expect(bindings[action].labels.length).toBe(bindings[action].codes.length);
    }
  });

  test("bindings_move_actions_cover_wasd_and_arrows", () => {
    // Arrange & Act
    const bindings = getBindings();

    // Assert
    expect(bindings.moveUp.codes).toContain("KeyW");
    expect(bindings.moveUp.codes).toContain("ArrowUp");
  });
});

describe("匹配", () => {
  test("bindings_matches_action_by_physical_code", () => {
    // Arrange & Act & Assert：认的是物理键位
    expect(matchesAction(keyEvent("KeyF"), "interact")).toBe(true);
    expect(matchesAction(keyEvent("KeyG"), "interact")).toBe(false);
  });

  test("bindings_is_action_down_reads_pressed_code_set", () => {
    // Arrange：逐帧轮询用的那条路（CharacterController 存的是 code 集合）
    const pressed = new Set(["KeyA"]);

    // Act & Assert
    expect(isActionDown(pressed, "moveLeft")).toBe(true);
    expect(isActionDown(pressed, "moveRight")).toBe(false);
  });

  test("bindings_rebinding_takes_effect_immediately", () => {
    // Arrange：把"交互"从 F 改到 E
    setBindings({ ...getBindings(), interact: { codes: ["KeyE"], labels: [] } });

    // Act & Assert：新键生效、旧键立刻失效
    expect(matchesAction(keyEvent("KeyE"), "interact")).toBe(true);
    expect(matchesAction(keyEvent("KeyF"), "interact")).toBe(false);
  });
});

describe("洗数据", () => {
  test("bindings_normalize_falls_back_to_default_when_all_codes_invalid", () => {
    // Arrange：全是非法键（手改的 localStorage、旧版本的写法）
    const washed = normalizeBindings({
      interact: { codes: ["F13", "MediaPlay", ""] },
    });

    // Assert：退回默认，绝不留空绑定
    expect(washed.interact.codes).toEqual(DEFAULT_INPUT_BINDINGS.interact.codes);
  });

  test("bindings_normalize_drops_duplicates_and_caps_count", () => {
    // Arrange
    const washed = normalizeBindings({
      interact: {
        codes: ["KeyE", "KeyE", "KeyR", "KeyT", "KeyY"],
      },
    });

    // Assert：去重 + 封顶 3 个
    expect(washed.interact.codes).toEqual(["KeyE", "KeyR", "KeyT"]);
  });

  test("bindings_normalize_recomputes_labels_ignoring_stored_ones", () => {
    // Arrange：存的 label 是错的（上个版本的写法）
    const washed = normalizeBindings({
      interact: { codes: ["KeyE"], labels: ["旧的错标签"] },
    });

    // Assert：label 一律现算
    expect(washed.interact.labels).toEqual(["E"]);
  });

  test("bindings_escape_is_not_bindable", () => {
    // Arrange & Act & Assert：Esc 是所有面板的通用出口，绑走就出不来了
    expect(isAllowedCode("Escape")).toBe(false);
    expect(bindingFromKeyboardEvent(keyEvent("Escape"))).toBeNull();
  });

  /*
   * 回归：`event.code` 并不总是有值——屏幕键盘、部分输入法状态、
   * 合成事件发出来的是空串（浏览器自动化实测：`{key:"e", code:""}`）。
   * 只读 code 的话所有匹配静默失败，表现成"这个键突然没反应了"，
   * 而改用 code 之前读 key 是能工作的，不兜住就是纯回归。
   */
  test("bindings_falls_back_to_key_when_code_is_empty", () => {
    // Arrange：没有 code、只有 key 的事件
    const noCode = new KeyboardEvent("keydown", { key: "f" });

    // Act & Assert：照样认得出这是"交互"
    expect(noCode.code).toBe("");
    expect(matchesAction(noCode, "interact")).toBe(true);
  });

  test("bindings_fallback_covers_named_and_symbol_keys", () => {
    // Arrange & Act & Assert
    expect(
      matchesAction(new KeyboardEvent("keydown", { key: "ArrowUp" }), "moveUp"),
    ).toBe(true);
    expect(
      matchesAction(new KeyboardEvent("keydown", { key: " " }), "jump"),
    ).toBe(true);
    expect(
      matchesAction(new KeyboardEvent("keydown", { key: "/" }), "command"),
    ).toBe(true);
  });

  test("bindings_rebind_works_from_event_without_code", () => {
    // Arrange & Act：改键那条路也要能吃下无 code 的事件
    const binding = bindingFromKeyboardEvent(
      new KeyboardEvent("keydown", { key: "e" }),
    );

    // Assert
    expect(binding).toEqual({ codes: ["KeyE"], labels: ["E"] });
  });

  test("bindings_from_keyboard_event_labels_the_key", () => {
    // Arrange & Act
    const binding = bindingFromKeyboardEvent(keyEvent("Slash"));

    // Assert
    expect(binding).toEqual({ codes: ["Slash"], labels: ["/"] });
  });

  test("bindings_label_for_code_is_human_readable", () => {
    // Arrange & Act & Assert
    expect(labelForCode("KeyW")).toBe("W");
    expect(labelForCode("Digit3")).toBe("3");
    expect(labelForCode("ArrowLeft")).toBe("←");
    expect(labelForCode("Space")).toBe("空格");
  });
});

describe("持久化与订阅", () => {
  test("bindings_persist_across_reload", () => {
    // Arrange：改键
    setBindings({ ...getBindings(), backpack: { codes: ["KeyI"], labels: [] } });

    // Act：模拟重新加载（读回 localStorage 里那份）
    const stored = JSON.parse(
      localStorage.getItem("idle-home:input-bindings") ?? "{}",
    );
    const washed = normalizeBindings(stored);

    // Assert
    expect(washed.backpack.codes).toEqual(["KeyI"]);
  });

  test("bindings_subscribers_are_notified_on_change", () => {
    // Arrange
    let seen = 0;
    const off = subscribeBindings(() => {
      seen += 1;
    });

    // Act
    setBindings({ ...getBindings(), jump: { codes: ["KeyZ"], labels: [] } });
    off();
    setBindings({ ...getBindings(), jump: { codes: ["KeyX"], labels: [] } });

    // Assert：退订之后不再收到
    expect(seen).toBe(1);
  });

  test("bindings_reset_restores_defaults", () => {
    // Arrange
    setBindings({ ...getBindings(), interact: { codes: ["KeyE"], labels: [] } });

    // Act
    resetBindings();

    // Assert
    expect(getBindings().interact.codes).toEqual(
      DEFAULT_INPUT_BINDINGS.interact.codes,
    );
  });
});
