/**
 * ChatInput — Floating pixel-art text input.
 *
 * Two modes (detected automatically):
 *   • Normal  — text sent to NPC when it does NOT start with "/"
 *   • Command — text executed as a game command when it starts with "/"
 *
 * Enter = send/execute, Escape = cancel.
 * Key events are stopped from propagating to the game while open.
 */
import React, { useRef, useEffect, useMemo, useState } from 'react';
import type { CommandArgumentSuggestion, CommandInfo } from '../systems/CommandSystem';

interface ChatInputProps {
  npcName:      string;
  onSend:       (text: string) => void;
  onCancel:     () => void;
  commands?:     CommandInfo[];
  /** Pre-fill the input (e.g. "/" when opened via slash key). */
  initialValue?: string;
}

const COMMAND_HISTORY_KEY = 'time-plan:idle-game:command-history';
const MAX_COMMAND_HISTORY = 10;
const MAX_VISIBLE_SUGGESTIONS = 50;

interface ParsedCommandInput {
  commandName: string;
  args: string[];
  argsBeforeCurrent: string[];
  currentArg: string;
  currentArgIndex: number;
  hasTrailingSpace: boolean;
}

function commandScore(command: CommandInfo, query: string): number {
  const name = command.name.toLowerCase();
  const description = command.description.toLowerCase();
  if (!query) return 1;
  if (name === query) return 100;
  if (name.startsWith(query)) return 80 - Math.max(0, name.length - query.length);
  if (name.includes(query)) return 50;
  if (description.includes(query)) return 20;
  const fuzzyNameScore = fuzzyScore(name, query);
  if (fuzzyNameScore > 0) return fuzzyNameScore;
  return 0;
}

function fuzzyScore(value: string, query: string): number {
  let matched = 0;
  let position = -1;
  let score = value[0] === query[0] ? 10 : 0;

  for (const char of query) {
    const nextPosition = value.indexOf(char, position + 1);
    if (nextPosition < 0) continue;
    matched += 1;
    score += nextPosition === position + 1 ? 3 : 1;
    position = nextPosition;
  }

  return matched > 0 ? score + matched * 4 - value.length * 0.2 : 0;
}

function suggestionScore(suggestion: CommandArgumentSuggestion, query: string): number {
  const value = suggestion.value.toLowerCase();
  const description = suggestion.description?.toLowerCase() ?? '';
  if (!query) return 1;
  if (value === query) return 100;
  if (value.startsWith(query)) return 80 - Math.max(0, value.length - query.length);
  if (value.includes(query)) return 50;
  if (description.includes(query)) return 20;
  const fuzzyValueScore = fuzzyScore(value, query);
  if (fuzzyValueScore > 0) return fuzzyValueScore;
  return 0;
}

function parseCommandInput(input: string): ParsedCommandInput | null {
  if (!input.startsWith('/')) return null;
  const body = input.slice(1).trimStart();
  if (!body) return null;

  const hasTrailingSpace = /\s$/.test(input);
  const parts = body.trimEnd().split(/\s+/);
  const commandName = parts[0]?.toLowerCase() ?? '';
  const args = parts.slice(1);
  const currentArgIndex = hasTrailingSpace ? args.length : Math.max(0, args.length - 1);
  const currentArg = hasTrailingSpace ? '' : args[currentArgIndex] ?? '';
  const argsBeforeCurrent = hasTrailingSpace ? args : args.slice(0, currentArgIndex);

  return {
    commandName,
    args,
    argsBeforeCurrent,
    currentArg,
    currentArgIndex,
    hasTrailingSpace,
  };
}

function suggestionMatchesContext(suggestion: CommandArgumentSuggestion, parsed: ParsedCommandInput): boolean {
  if (typeof suggestion.argumentIndex === 'number' && suggestion.argumentIndex !== parsed.currentArgIndex) {
    return false;
  }

  if (suggestion.after?.length) {
    if (suggestion.after.length > parsed.argsBeforeCurrent.length) return false;
    return suggestion.after.every((token, index) => (
      parsed.argsBeforeCurrent[index]?.toLowerCase() === token.toLowerCase()
    ));
  }

  return true;
}

function loadCommandHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(COMMAND_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.startsWith('/'))
      .slice(0, MAX_COMMAND_HISTORY);
  }
  catch {
    return [];
  }
}

function saveCommandHistory(history: string[]): void {
  try {
    window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_COMMAND_HISTORY)));
  }
  catch {
    // Local storage can be unavailable in private windows; command execution should still work.
  }
}

export const ChatInput: React.FC<ChatInputProps> = ({ npcName, onSend, onCancel, commands = [], initialValue = '' }) => {
  const inputRef  = useRef<HTMLInputElement>(null);
  const selectedSuggestionRef = useRef<HTMLButtonElement>(null);
  const historyDraftRef = useRef(initialValue);
  const [value, setValue] = useState(initialValue);
  const [commandHistory, setCommandHistory] = useState<string[]>(loadCommandHistory);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  const isCommand = value.startsWith('/');
  const commandQuery = isCommand ? (value.slice(1).trimStart().split(/\s+/)[0] ?? '').toLowerCase() : '';
  const isCompletingCommandName = isCommand && !value.slice(1).trimStart().includes(' ');
  const commandSuggestions = useMemo(() => {
    if (!isCompletingCommandName) return [];
    return commands
      .map((command) => ({ command, score: commandScore(command, commandQuery) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
      .slice(0, MAX_VISIBLE_SUGGESTIONS)
      .map(({ command }) => command);
  }, [commandQuery, commands, isCompletingCommandName]);
  const showCommandSuggestions = isCompletingCommandName && commandSuggestions.length > 0;
  const parsedCommandInput = useMemo(() => parseCommandInput(value), [value]);
  const argumentSuggestions = useMemo(() => {
    if (!parsedCommandInput || isCompletingCommandName) return [];
    const command = commands.find((candidate) => candidate.name.toLowerCase() === parsedCommandInput.commandName);
    const suggestions = command?.argumentSuggestions ?? [];
    const query = parsedCommandInput.currentArg.toLowerCase();

    return suggestions
      .filter((suggestion) => suggestionMatchesContext(suggestion, parsedCommandInput))
      .map((suggestion) => ({ suggestion, score: suggestionScore(suggestion, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.suggestion.value.localeCompare(b.suggestion.value))
      .slice(0, MAX_VISIBLE_SUGGESTIONS)
      .map(({ suggestion }) => suggestion);
  }, [commands, isCompletingCommandName, parsedCommandInput]);
  const showArgumentSuggestions = !showCommandSuggestions && argumentSuggestions.length > 0;
  const suggestionCount = showCommandSuggestions
    ? commandSuggestions.length
    : showArgumentSuggestions
      ? argumentSuggestions.length
      : 0;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Move cursor to end of any pre-filled text
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [showCommandSuggestions, showArgumentSuggestions, commandSuggestions.length, argumentSuggestions.length, value]);

  useEffect(() => {
    if (suggestionCount <= 0) return;
    window.requestAnimationFrame(() => {
      selectedSuggestionRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [selectedSuggestionIndex, suggestionCount]);

  const completeCommand = (command: CommandInfo) => {
    const nextValue = `/${command.name}`;
    setValue(nextValue);
    setHistoryIndex(null);
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextValue.length, nextValue.length);
    });
  };

  const completeArgument = (suggestion: CommandArgumentSuggestion) => {
    if (!parsedCommandInput) return;
    const nextArgs = [...parsedCommandInput.args];
    if (parsedCommandInput.hasTrailingSpace) {
      nextArgs.push(suggestion.value);
    } else {
      nextArgs[parsedCommandInput.currentArgIndex] = suggestion.value;
    }

    const nextValue = `/${parsedCommandInput.commandName} ${nextArgs.join(' ')}`;
    setValue(nextValue);
    setHistoryIndex(null);
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextValue.length, nextValue.length);
    });
  };

  const rememberCommand = (text: string) => {
    if (!text.startsWith('/')) return;
    const nextHistory = [text, ...commandHistory.filter((entry) => entry !== text)].slice(0, MAX_COMMAND_HISTORY);
    setCommandHistory(nextHistory);
    saveCommandHistory(nextHistory);
    setHistoryIndex(null);
  };

  const recallHistory = (direction: -1 | 1) => {
    if (!isCommand || commandHistory.length === 0) return false;

    if (direction < 0) {
      const nextIndex = historyIndex === null
        ? 0
        : Math.min(commandHistory.length - 1, historyIndex + 1);
      if (historyIndex === null) historyDraftRef.current = value;
      const nextValue = commandHistory[nextIndex] ?? value;
      setValue(nextValue);
      setHistoryIndex(nextIndex);
      window.requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.setSelectionRange(nextValue.length, nextValue.length);
      });
      return true;
    }

    if (historyIndex === null) return false;
    const nextIndex = historyIndex - 1;
    const nextValue = nextIndex >= 0 ? commandHistory[nextIndex] ?? value : historyDraftRef.current;
    setValue(nextValue);
    setHistoryIndex(nextIndex >= 0 ? nextIndex : null);
    window.requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.setSelectionRange(nextValue.length, nextValue.length);
    });
    return true;
  };

  const moveSuggestionSelection = (direction: -1 | 1) => {
    if (suggestionCount <= 0) return false;
    setSelectedSuggestionIndex((current) => {
      const normalized = Math.max(0, Math.min(suggestionCount - 1, current));
      return Math.max(0, Math.min(suggestionCount - 1, normalized + direction));
    });
    return true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const selectedCommandSuggestion = commandSuggestions[selectedSuggestionIndex] ?? commandSuggestions[0];
    const selectedArgumentSuggestion = argumentSuggestions[selectedSuggestionIndex] ?? argumentSuggestions[0];
    const commandSuggestionAlreadyTyped = Boolean(
      selectedCommandSuggestion && selectedCommandSuggestion.name.toLowerCase() === commandQuery,
    );
    const argumentSuggestionAlreadyTyped = Boolean(
      selectedArgumentSuggestion
      && parsedCommandInput
      && selectedArgumentSuggestion.value.toLowerCase() === parsedCommandInput.currentArg.toLowerCase(),
    );

    if (e.key === 'Tab' && showCommandSuggestions) {
      e.preventDefault();
      completeCommand(selectedCommandSuggestion);
      return;
    }

    if (e.key === 'Tab' && showArgumentSuggestions) {
      e.preventDefault();
      completeArgument(selectedArgumentSuggestion);
      return;
    }

    if (e.key === 'Enter' && showCommandSuggestions && !commandSuggestionAlreadyTyped) {
      e.preventDefault();
      completeCommand(selectedCommandSuggestion);
      return;
    }

    if (e.key === 'Enter' && showArgumentSuggestions && !argumentSuggestionAlreadyTyped) {
      e.preventDefault();
      completeArgument(selectedArgumentSuggestion);
      return;
    }

    if (e.key === 'ArrowUp' && suggestionCount > 0) {
      e.preventDefault();
      moveSuggestionSelection(-1);
      return;
    }

    if (e.key === 'ArrowDown' && suggestionCount > 0) {
      e.preventDefault();
      moveSuggestionSelection(1);
      return;
    }

    if (e.key === 'ArrowUp' && recallHistory(-1)) {
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowDown' && recallHistory(1)) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      const text = value.trim();
      if (text) {
        rememberCommand(text);
        onSend(text);
        setValue('');
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const labelBg    = isCommand ? '#0d2a0d' : '#4a3500';
  const labelColor = isCommand ? '#88ff88' : '#fffde8';
  const borderClr  = isCommand ? '#44aa44' : '#4a3500';
  const shadowClr  = isCommand ? '#44aa44' : '#c8a850';
  const labelText  = isCommand
    ? '⌨ 命令模式 — Enter 执行'
    : `▶ 对 ${npcName} 说话…`;

  return (
    <div
      style={{
        position:      'absolute',
        bottom:        80,
        left:          '50%',
        transform:     'translateX(-50%)',
        width:         'clamp(280px, 55%, 500px)',
        zIndex:        999,
        display:       'flex',
        flexDirection: 'column',
        gap:           6,
        fontFamily:    '"Courier New", monospace',
        filter:        'drop-shadow(0 4px 12px rgba(0,0,0,0.7))',
      }}
    >
      {/* Mode label */}
      <div style={{
        background:    labelBg,
        color:         labelColor,
        fontSize:      10,
        padding:       '3px 10px',
        borderRadius:  3,
        alignSelf:     'center',
        letterSpacing: 1,
        transition:    'background 0.15s, color 0.15s',
      }}>
        {labelText}
      </div>

      {showCommandSuggestions && (
        <div
          role="listbox"
          aria-label="Command suggestions"
          style={{
            background: '#0d1117',
            border: '2px solid #44aa44',
            borderRadius: 5,
            boxShadow: '0 0 0 1px #163d16, 4px 4px 0 #0d2a0d',
            overflow: 'hidden',
            overflowY: 'auto',
            maxHeight: 184,
          }}
        >
          {commandSuggestions.map((command, index) => (
            <button
              key={command.name}
              ref={index === selectedSuggestionIndex ? selectedSuggestionRef : undefined}
              type="button"
              role="option"
              aria-selected={index === selectedSuggestionIndex}
              onMouseEnter={() => setSelectedSuggestionIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                completeCommand(command);
              }}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 120px) minmax(0, 1fr)',
                gap: 10,
                alignItems: 'center',
                border: 0,
                borderTop: index === 0 ? 0 : '1px solid #233024',
                background: index === selectedSuggestionIndex ? '#18391b' : 'transparent',
                color: '#d7f7a8',
                padding: '7px 9px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: '"Courier New", monospace',
              }}
            >
              <code
                title={`/${command.name}`}
                style={{
                  color: '#88ff88',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                /{command.name}
              </code>
              <span
                title={command.description}
                style={{
                  minWidth: 0,
                  color: '#a8c8a8',
                  fontSize: 11,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {command.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {showArgumentSuggestions && (
        <div
          role="listbox"
          aria-label="Command argument suggestions"
          style={{
            background: '#0d1117',
            border: '2px solid #44aa44',
            borderRadius: 5,
            boxShadow: '0 0 0 1px #163d16, 4px 4px 0 #0d2a0d',
            overflow: 'hidden',
            overflowY: 'auto',
            maxHeight: 184,
          }}
        >
          {argumentSuggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.argumentIndex ?? 'any'}:${suggestion.value}`}
              ref={index === selectedSuggestionIndex ? selectedSuggestionRef : undefined}
              type="button"
              role="option"
              aria-selected={index === selectedSuggestionIndex}
              onMouseEnter={() => setSelectedSuggestionIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                completeArgument(suggestion);
              }}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.35fr) minmax(150px, 1fr)',
                gap: 10,
                alignItems: 'center',
                border: 0,
                borderTop: index === 0 ? 0 : '1px solid #233024',
                background: index === selectedSuggestionIndex ? '#18391b' : 'transparent',
                color: '#d7f7a8',
                padding: '7px 9px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: '"Courier New", monospace',
              }}
            >
              <code
                title={suggestion.value}
                style={{
                  color: '#88ff88',
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                {suggestion.value}
              </code>
              <span
                title={suggestion.description ?? 'argument'}
                style={{
                  minWidth: 0,
                  color: '#a8c8a8',
                  fontSize: 11,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {suggestion.description ?? 'argument'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{
        background:   '#fffde8',
        border:       `3px solid ${borderClr}`,
        borderRadius: 4,
        boxShadow:    `0 0 0 1px ${shadowClr}, 4px 4px 0 ${borderClr}`,
        padding:      '6px 10px',
        display:      'flex',
        gap:          8,
        alignItems:   'center',
        transition:   'border-color 0.15s, box-shadow 0.15s',
      }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={isCommand ? '/weather storm   /weather fog   /time set 480' : '输入消息，回车发送…'}
          value={value}
          onChange={e => {
            setValue(e.target.value);
            setHistoryIndex(null);
          }}
          maxLength={120}
          onKeyDown={handleKeyDown}
          style={{
            flex:       1,
            background: 'transparent',
            border:     'none',
            outline:    'none',
            fontSize:   13,
            color:      isCommand ? '#1a5c1a' : '#3a2000',
            fontFamily: '"Courier New", monospace',
          }}
        />
        <span style={{ fontSize: 9, color: '#888', whiteSpace: 'nowrap' }}>
          ESC 取消
        </span>
      </div>
    </div>
  );
};
