/**
 * 键位映射层。**游戏里不再有任何一处直接比对按键**——所有按键判断都问
 * 这里"这个事件是不是某个动作"，键位改了全场跟着改。
 *
 * 移植自 Oldfrontend 的 `features/input/InputBindingDefinitions.ts`
 * （RoomScene 里那句"键位以后要可重映射"的注释等的就是这个），
 * 三处按这边的实际情况改了：
 *
 * 1. **认 `event.code` 不认 `event.key`。** 原来散在各处的写法是
 *    `event.key.toLowerCase() === "w"`——那读的是**字符**，AZERTY 键盘上
 *    同一个物理键出来的是 "z"，Dvorak 上是 ","，于是"WASD 移动"在非
 *    QWERTY 布局上直接错位。`code` 认的是物理位置（`KeyW` 永远是那一颗），
 *    重绑定要存的也必须是它——存字符的话玩家换个输入法键位就漂了。
 * 2. **动作表按本项目的实际操作列**（扔东西、倒锅、转家具这些老项目没有）。
 * 3. **存 localStorage 不进存档**：键位是"这台设备怎么操作"，和音量同类，
 *    不是世界状态。换台电脑重设一次是对的，跟着云存档跑反而怪。
 *
 * 不可重绑的两类刻意留在外面：**Esc**（关面板的通用出口，改了会让玩家
 * 困在面板里）和**数字键 1-0**（快捷栏，位置即语义）。老设计也是这么划的。
 */

export type InputAction =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "run"
  | "jump"
  | "interact"
  | "throwItem"
  | "dumpContainer"
  | "rotatePlacement"
  | "backpack"
  | "chat"
  | "command";

export type InputBinding = {
  /** KeyboardEvent.code 列表，一个动作可以绑多个键（WASD + 方向键） */
  codes: string[];
  /** 给 UI 显示的人话，和 codes 一一对应 */
  labels: string[];
};

export type InputBindingsState = Record<InputAction, InputBinding>;

/** 动作在设置面板里的分组与说明（照抄老设计的三组分类） */
export const INPUT_ACTION_GROUPS: ReadonlyArray<{
  titleKey: string;
  actions: InputAction[];
}> = [
  {
    titleKey: "ui.settings.group_move",
    actions: ["moveUp", "moveDown", "moveLeft", "moveRight", "run", "jump"],
  },
  {
    titleKey: "ui.settings.group_items",
    actions: ["interact", "throwItem", "dumpContainer", "rotatePlacement"],
  },
  {
    titleKey: "ui.settings.group_menu",
    actions: ["backpack", "chat", "command"],
  },
];

export const DEFAULT_INPUT_BINDINGS: InputBindingsState = {
  moveUp: { codes: ["KeyW", "ArrowUp"], labels: ["W", "↑"] },
  moveDown: { codes: ["KeyS", "ArrowDown"], labels: ["S", "↓"] },
  moveLeft: { codes: ["KeyA", "ArrowLeft"], labels: ["A", "←"] },
  moveRight: { codes: ["KeyD", "ArrowRight"], labels: ["D", "→"] },
  run: { codes: ["ShiftLeft", "ShiftRight"], labels: ["Shift", "Shift"] },
  jump: { codes: ["Space"], labels: ["空格"] },
  interact: { codes: ["KeyF"], labels: ["F"] },
  throwItem: { codes: ["KeyQ"], labels: ["Q"] },
  dumpContainer: { codes: ["KeyG"], labels: ["G"] },
  rotatePlacement: { codes: ["KeyR"], labels: ["R"] },
  backpack: { codes: ["KeyB"], labels: ["B"] },
  chat: { codes: ["Enter"], labels: ["Enter"] },
  command: { codes: ["Slash"], labels: ["/"] },
};

export const INPUT_ACTIONS = Object.keys(
  DEFAULT_INPUT_BINDINGS,
) as InputAction[];

const NAMED_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "空格",
  Enter: "Enter",
  Tab: "Tab",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  Slash: "/",
  Equal: "=",
  Minus: "-",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Backquote: "`",
};

export function labelForCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return NAMED_LABELS[code] ?? code;
}

/**
 * 允许绑定的键。白名单而不是黑名单——键盘上能发出 code 的东西太杂
 * （媒体键、Fn、IME 状态键），放开的话玩家能把动作绑到一个自己再也
 * 按不出来的键上，然后就只能清缓存了。
 *
 * **Escape 不在名单里**：它是所有面板的通用出口，绑走等于把自己关在里面。
 */
const ALLOWED_CODE =
  /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Enter|Space|Tab|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Slash|Equal|Minus|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Backquote)$/;

export function isAllowedCode(code: string): boolean {
  return ALLOWED_CODE.test(code);
}

/** 一个动作最多绑几个键。多了 UI 一行放不下，也没人真按四个键做一件事 */
const MAX_CODES_PER_ACTION = 3;

function cloneBindings(bindings: InputBindingsState): InputBindingsState {
  return INPUT_ACTIONS.reduce((result, action) => {
    result[action] = {
      codes: [...bindings[action].codes],
      labels: [...bindings[action].labels],
    };
    return result;
  }, {} as InputBindingsState);
}

/**
 * 把任何来路不明的东西（旧版本存的、手改的 localStorage）洗成合法绑定。
 * 洗不出合法键的动作退回默认——**绝不能留下一个空绑定**：那个动作会
 * 变成永远按不出来，而玩家看不出是为什么。
 */
export function normalizeBindings(
  input?: Partial<Record<InputAction, Partial<InputBinding>>> | null,
): InputBindingsState {
  return INPUT_ACTIONS.reduce((result, action) => {
    const fallback = DEFAULT_INPUT_BINDINGS[action];
    const raw = input?.[action];
    const codes = [...new Set(Array.isArray(raw?.codes) ? raw.codes : [])]
      .filter(
        (code): code is string =>
          typeof code === "string" && isAllowedCode(code),
      )
      .slice(0, MAX_CODES_PER_ACTION);
    const safe = codes.length > 0 ? codes : fallback.codes;

    // labels 一律现算，不信外面存的——存的可能是上个版本的写法
    result[action] = { codes: safe, labels: safe.map(labelForCode) };
    return result;
  }, {} as InputBindingsState);
}

/**
 * 从事件里取物理键位。
 *
 * 正常情况直接用 `event.code`。但**它并不总是有值**——屏幕键盘、部分
 * 输入法状态、以及自动化/合成事件发出来的 `code` 是空串（这次移植就是
 * 被浏览器自动化按键实测撞出来的：`{key: "e", code: ""}`）。
 * 空 code 会让所有匹配静默失败，表现成"这个键突然没反应了"，
 * 而改成 code 之前用 `event.key` 是能工作的——不兜住就是纯回归。
 *
 * 兜底按 `key` 反推一个 code：单个字母/数字能准确还原，具名键查表。
 * 反推不出来就返回空串，调用方按"匹配不上"处理。
 */
function codeFromEvent(event: KeyboardEvent): string {
  if (event.code) return event.code;

  const key = event.key;
  if (!key) return "";
  if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (key === " ") return "Space";
  if (key === "Shift") return "ShiftLeft";
  if (key === "Control") return "ControlLeft";
  if (key === "Alt") return "AltLeft";

  // 具名键（ArrowUp/Enter/Tab）的 key 和 code 同名，直接用；
  // 符号键反查标签表（"/" → Slash）
  if (isAllowedCode(key)) return key;
  const named = Object.entries(NAMED_LABELS).find(
    ([code, label]) => label === key && isAllowedCode(code),
  );
  return named?.[0] ?? "";
}

/** 重绑定时把玩家刚按的那一下变成绑定；按了不允许的键返回 null */
export function bindingFromKeyboardEvent(
  event: KeyboardEvent,
): InputBinding | null {
  const code = codeFromEvent(event);
  if (!isAllowedCode(code)) return null;
  return { codes: [code], labels: [labelForCode(code)] };
}

// ---- 当前生效的绑定 ----

const STORAGE_KEY = "idle-home:input-bindings";

function loadStored(): InputBindingsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneBindings(DEFAULT_INPUT_BINDINGS);
    return normalizeBindings(
      JSON.parse(raw) as Partial<Record<InputAction, Partial<InputBinding>>>,
    );
  } catch {
    // localStorage 被禁用或内容坏了：用默认键位，游戏照常能玩
    return cloneBindings(DEFAULT_INPUT_BINDINGS);
  }
}

let active: InputBindingsState = loadStored();
const listeners = new Set<(bindings: InputBindingsState) => void>();

export function getBindings(): InputBindingsState {
  return cloneBindings(active);
}

export function setBindings(
  input: Partial<Record<InputAction, Partial<InputBinding>>>,
): InputBindingsState {
  active = normalizeBindings(input);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  } catch {
    // 存不上只影响"下次还记不记得"，这次会话内照常生效
  }
  const snapshot = cloneBindings(active);
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}

export function resetBindings(): InputBindingsState {
  return setBindings(DEFAULT_INPUT_BINDINGS);
}

export function subscribeBindings(
  listener: (bindings: InputBindingsState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---- 给按键处理方用的三个问句 ----

/** keydown/keyup 里问："这一下是不是这个动作？" */
export function matchesAction(
  event: KeyboardEvent,
  action: InputAction,
): boolean {
  const code = codeFromEvent(event);
  return code !== "" && active[action].codes.includes(code);
}

/** 逐帧问："这个动作现在按着吗？"（`pressed` 是一批 event.code） */
export function isActionDown(
  pressed: ReadonlySet<string>,
  action: InputAction,
): boolean {
  return active[action].codes.some((code) => pressed.has(code));
}

/** UI 显示用 */
export function labelsForAction(action: InputAction): string[] {
  return [...active[action].labels];
}

/**
 * 按下/松开时往"当前按着的键"集合里存什么。
 * 走同一个兜底，`isActionDown` 才和 `matchesAction` 认同一套东西——
 * 两边取值方式不一致的话，会出现"按下有反应、松手不停下"这种鬼状态。
 */
export function pressedCodeOf(event: KeyboardEvent): string {
  return codeFromEvent(event);
}
