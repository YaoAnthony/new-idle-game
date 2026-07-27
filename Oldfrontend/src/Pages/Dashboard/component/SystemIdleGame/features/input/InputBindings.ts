import Phaser from 'phaser';
import {
  cloneInputBindings,
  DEFAULT_INPUT_BINDINGS,
  normalizeInputBindings,
  type InputAction,
  type InputBinding,
  type InputBindingsState,
} from './InputBindingDefinitions';

export {
  DEFAULT_INPUT_BINDINGS,
  INPUT_ACTIONS,
  inputBindingFromKeyboardEvent,
  normalizeInputBindings,
  type InputAction,
  type InputBinding,
  type InputBindingsState,
} from './InputBindingDefinitions';

const listeners = new Set<(bindings: InputBindingsState) => void>();
let activeInputBindings: InputBindingsState = cloneInputBindings(DEFAULT_INPUT_BINDINGS);

export function setActiveInputBindings(input?: Partial<Record<InputAction, Partial<InputBinding>>> | null): InputBindingsState {
  activeInputBindings = normalizeInputBindings(input);
  const snapshot = cloneInputBindings(activeInputBindings);
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}

export function getActiveInputBindings(): InputBindingsState {
  return cloneInputBindings(activeInputBindings);
}

export function subscribeInputBindings(listener: (bindings: InputBindingsState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function codeToPhaserKeyCode(code: string): number | null {
  const keyCodes = Phaser.Input.Keyboard.KeyCodes as Record<string, number>;
  if (/^Key[A-Z]$/.test(code)) return keyCodes[code.slice(3)] ?? null;
  if (/^Digit[0-9]$/.test(code)) {
    const digitNames = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
    return keyCodes[digitNames[Number(code.slice(5))]] ?? null;
  }
  const named: Record<string, string> = {
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    Enter: 'ENTER',
    Escape: 'ESC',
    Space: 'SPACE',
    Slash: 'FORWARD_SLASH',
    Equal: 'PLUS',
    Minus: 'MINUS',
    BracketLeft: 'OPEN_BRACKET',
    BracketRight: 'CLOSED_BRACKET',
    Backslash: 'BACK_SLASH',
    Semicolon: 'SEMICOLON',
    Quote: 'QUOTES',
    Comma: 'COMMA',
    Period: 'PERIOD',
    Backquote: 'BACKTICK',
    Tab: 'TAB',
  };
  return keyCodes[named[code]] ?? null;
}

export function createPhaserKeys(scene: Phaser.Scene, action: InputAction): Phaser.Input.Keyboard.Key[] {
  const keyboard = scene.input.keyboard;
  if (!keyboard) return [];
  return activeInputBindings[action].codes
    .map(codeToPhaserKeyCode)
    .filter((code): code is number => typeof code === 'number')
    .map((code) => keyboard.addKey(code, false));
}

export function isAnyPhaserKeyDown(keys: readonly Phaser.Input.Keyboard.Key[]): boolean {
  return keys.some((key) => key.isDown);
}

export function isAnyPhaserKeyJustDown(keys: readonly Phaser.Input.Keyboard.Key[]): boolean {
  return keys.some((key) => Phaser.Input.Keyboard.JustDown(key));
}

export function matchesKeyboardEventAction(event: KeyboardEvent, action: InputAction): boolean {
  return activeInputBindings[action].codes.includes(event.code);
}

export function getInputLabels(action: InputAction): string[] {
  return activeInputBindings[action].labels;
}
