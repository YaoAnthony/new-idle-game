export type InputAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'interact'
  | 'drop'
  | 'chat'
  | 'command'
  | 'settings'
  | 'profilePanel';

export interface InputBinding {
  codes: string[];
  labels: string[];
}

export type InputBindingsState = Record<InputAction, InputBinding>;

export const DEFAULT_INPUT_BINDINGS: InputBindingsState = {
  moveUp: { codes: ['KeyW', 'ArrowUp'], labels: ['W', '↑'] },
  moveDown: { codes: ['KeyS', 'ArrowDown'], labels: ['S', '↓'] },
  moveLeft: { codes: ['KeyA', 'ArrowLeft'], labels: ['A', '←'] },
  moveRight: { codes: ['KeyD', 'ArrowRight'], labels: ['D', '→'] },
  interact: { codes: ['KeyF'], labels: ['F'] },
  drop: { codes: ['KeyQ'], labels: ['Q'] },
  chat: { codes: ['Enter'], labels: ['Enter'] },
  command: { codes: ['Slash'], labels: ['/'] },
  settings: { codes: ['Equal'], labels: ['='] },
  profilePanel: { codes: ['KeyI'], labels: ['I'] },
};

export const INPUT_ACTIONS = Object.keys(DEFAULT_INPUT_BINDINGS) as InputAction[];

export function labelForInputCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code === 'Slash') return '/';
  if (code === 'Equal') return '=';
  if (code === 'Minus') return '-';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Backslash') return '\\';
  if (code === 'Semicolon') return ';';
  if (code === 'Quote') return "'";
  if (code === 'Comma') return ',';
  if (code === 'Period') return '.';
  if (code === 'Backquote') return '`';
  return code;
}

export function isAllowedInputCode(code: string): boolean {
  return /^(Key[A-Z]|Digit[0-9]|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Enter|Escape|Space|Slash|Equal|Minus|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Backquote|Tab)$/.test(code);
}

export function cloneInputBindings(bindings: InputBindingsState): InputBindingsState {
  return INPUT_ACTIONS.reduce((result, action) => {
    result[action] = {
      codes: [...bindings[action].codes],
      labels: [...bindings[action].labels],
    };
    return result;
  }, {} as InputBindingsState);
}

export function normalizeInputBinding(binding: Partial<InputBinding> | null | undefined, fallback: InputBinding): InputBinding {
  const codes = [...new Set(Array.isArray(binding?.codes) ? binding.codes : [])]
    .filter((code): code is string => typeof code === 'string' && isAllowedInputCode(code))
    .slice(0, 3);
  const safeCodes = codes.length > 0 ? codes : fallback.codes;
  return {
    codes: safeCodes,
    labels: safeCodes.map(labelForInputCode),
  };
}

export function normalizeInputBindings(input?: Partial<Record<InputAction, Partial<InputBinding>>> | null): InputBindingsState {
  return INPUT_ACTIONS.reduce((result, action) => {
    result[action] = normalizeInputBinding(input?.[action], DEFAULT_INPUT_BINDINGS[action]);
    return result;
  }, {} as InputBindingsState);
}

export function inputBindingFromKeyboardEvent(event: KeyboardEvent): InputBinding | null {
  if (!isAllowedInputCode(event.code)) return null;
  return {
    codes: [event.code],
    labels: [labelForInputCode(event.code)],
  };
}
