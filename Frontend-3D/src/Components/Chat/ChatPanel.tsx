import { ChatMessageKind, type ChatMessage } from "core";
import { useEffect, useRef, useState } from "react";
import { runCommand } from "../../Game/CommandLine/commands";
import {
  completionsFor,
  usageHintFor,
  type Completion,
} from "../../Game/CommandLine/suggest";
import { emit, on } from "../../Game/EventBus";
import {
  listChatMessages,
  pushChatMessage,
  pushSystemMessage,
} from "../../Game/State/chatLog";
import { t } from "../../i18n/t";

/**
 * 消息面板（Minecraft 那套）。
 *
 * - **回车**开输入框，**斜杠**直接开命令模式
 * - 关着的时候只露最近几条并淡出；开着的时候整段记录可以往回翻
 * - `/` 开头是命令，其余是玩家说的话
 * - Esc 收起
 *
 * 它取代了原来的 DebugConsole。那一版把记录存在组件 state 里，刷新就清空，
 * 而命令反馈、剧情提示各走各的浮层——同一时刻屏幕上飘着两三种提示，
 * 玩家还翻不回去看刚才发生了什么。
 */

/** 关着时最多露几条。再多就把画面糊住了 */
const IDLE_VISIBLE = 5;

/** 关着的消息多久淡掉（毫秒）。和 MC 的 10 秒一个量级 */
const IDLE_FADE_MS = 9000;

const KIND_CLASS: Record<ChatMessageKind, string> = {
  [ChatMessageKind.Player]: "text-white",
  [ChatMessageKind.System]: "text-[#9fe08f]",
  [ChatMessageKind.Story]: "text-[#f2d98c]",
  [ChatMessageKind.Npc]: "text-[#9fd2f2]",
};

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [selected, setSelected] = useState(0);
  const [lastAt, setLastAt] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 翻历史时先把正在打的那半句存起来，翻回来还给玩家 */
  const draftBeforeHistory = useRef("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const completions = open ? completionsFor(draft) : [];
  const usageHint = open ? usageHintFor(draft) : null;
  const isCommand = draft.startsWith("/");

  useEffect(() => {
    const refresh = () => {
      setMessages([...listChatMessages()]);
      setLastAt(Date.now());
    };
    refresh();
    return on("chat_message", refresh);
  }, []);

  // 全局按键：回车开聊天、斜杠开命令。正在别的输入框里打字时不抢
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (typing || open) return;

      if (event.key === "Enter") {
        event.preventDefault();
        setDraft("");
        setOpen(true);
      } else if (event.key === "/") {
        event.preventDefault();
        setDraft("/");
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // 开的时候滚到底：玩家想看的是刚发生的事，不是三天前那条
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open]);

  useEffect(() => setSelected(0), [draft]);

  // 打字时游戏要停手：不锁的话按 W 会一边打字一边往前走
  useEffect(() => {
    emit("blocking_panel_changed", { open });
  }, [open]);

  const close = (): void => {
    setOpen(false);
    setDraft("");
    setHistoryIndex(null);
  };

  const applyCompletion = (completion: Completion): void => {
    setDraft(completion.replacement);
    setHistoryIndex(null);
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    });
  };

  /** 往回翻自己发过的话。只翻玩家和命令，不翻系统刷的屏 */
  const ownHistory = messages
    .filter((message) => message.kind === ChatMessageKind.Player || message.text.startsWith("/"))
    .map((message) => message.text)
    .reverse();

  const recall = (direction: -1 | 1): boolean => {
    if (ownHistory.length === 0) return false;

    if (direction < 0) {
      const next = historyIndex === null ? 0 : Math.min(ownHistory.length - 1, historyIndex + 1);
      if (historyIndex === null) draftBeforeHistory.current = draft;
      setDraft(ownHistory[next] ?? draft);
      setHistoryIndex(next);
      return true;
    }

    if (historyIndex === null) return false;
    const next = historyIndex - 1;
    setDraft(next >= 0 ? (ownHistory[next] ?? draft) : draftBeforeHistory.current);
    setHistoryIndex(next >= 0 ? next : null);
    return true;
  };

  const send = (): void => {
    const text = draft.trim();
    if (text.length === 0) return close();

    if (text.startsWith("/")) {
      // 命令原样记一条，否则翻记录时只看得见结果、看不见自己敲了什么
      pushChatMessage({ kind: ChatMessageKind.Player, text });
      const result = runCommand(text);
      if (result.message) pushSystemMessage(result.message);
    } else {
      pushChatMessage({ kind: ChatMessageKind.Player, text });
      emit("player_said", { text });
    }

    close();
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    // 别让按键漏到游戏那边去（WASD、数字键、Q 都在 window 上监听）
    event.stopPropagation();

    if (event.key === "Escape") return close();

    if (completions.length > 0) {
      if (event.key === "Tab") {
        event.preventDefault();
        return applyCompletion(completions[selected] ?? completions[0]);
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const step = event.key === "ArrowUp" ? -1 : 1;
        setSelected((current) =>
          Math.max(0, Math.min(completions.length - 1, current + step)),
        );
        return;
      }
    }

    if (event.key === "ArrowUp" && recall(-1)) return event.preventDefault();
    if (event.key === "ArrowDown" && recall(1)) return event.preventDefault();

    if (event.key === "Enter") {
      event.preventDefault();
      send();
    }
  };

  const faded = !open && Date.now() - lastAt > IDLE_FADE_MS;
  const shown = open ? messages : messages.slice(-IDLE_VISIBLE);

  if (!open && (messages.length === 0 || faded)) {
    return (
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-white/55">
        {t("ui.chat.closed_hint")}
      </div>
    );
  }

  return (
    <div className="absolute bottom-3 left-3 z-20 w-[min(560px,62vw)] font-mono">
      <div
        ref={listRef}
        className={`mb-1 flex flex-col gap-0.5 overflow-y-auto rounded px-2 py-1 text-[12px] leading-relaxed transition-opacity ${
          open ? "max-h-56 bg-black/70" : "pointer-events-none max-h-40 bg-black/35"
        }`}
      >
        {shown.map((message) => (
          <div key={message.id} className={KIND_CLASS[message.kind]}>
            {message.speaker && (
              <span className="mr-1 text-white/60">&lt;{message.speaker}&gt;</span>
            )}
            <span className="whitespace-pre-wrap">{message.text}</span>
          </div>
        ))}
      </div>

      {open && (
        <>
          {completions.length > 0 && (
            <div className="mb-1 overflow-hidden rounded border border-white/15 bg-black/85">
              {completions.map((completion, index) => (
                <button
                  key={completion.replacement}
                  type="button"
                  onMouseEnter={() => setSelected(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyCompletion(completion);
                  }}
                  className={`flex w-full items-center gap-3 px-2 py-1 text-left text-[12px] ${
                    index === selected ? "bg-white/15" : ""
                  }`}
                >
                  <code className="shrink-0 text-[#9fe08f]">{completion.label}</code>
                  <span className="truncate text-[11px] text-white/55">
                    {completion.description}
                  </span>
                </button>
              ))}
            </div>
          )}

          {completions.length === 0 && usageHint && (
            <div className="mb-1 rounded border border-white/10 bg-black/85 px-2 py-1 text-[11px] text-white/55">
              {usageHint}
            </div>
          )}

          <div
            className={`flex items-center gap-2 rounded border bg-black/80 px-2 py-1.5 ${
              isCommand ? "border-[#5fae55]" : "border-white/20"
            }`}
          >
            <span className={isCommand ? "text-[#9fe08f]" : "text-white/50"}>
              {isCommand ? ">" : "✉"}
            </span>
            <input
              ref={inputRef}
              value={draft}
              maxLength={200}
              spellCheck={false}
              placeholder={t("ui.chat.placeholder")}
              onChange={(event) => {
                setDraft(event.target.value);
                setHistoryIndex(null);
              }}
              onKeyDown={onInputKeyDown}
              className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/30"
            />
            <span className="shrink-0 text-[10px] text-white/35">
              {t("ui.chat.dismiss")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
