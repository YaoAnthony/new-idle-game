import { ChatMessageKind, type ChatMessage } from "core";
import { useEffect, useRef, useState } from "react";
import { runCommand } from "../../Game/CommandLine/commands";
import {
  completionsFor,
  usageHintFor,
  type Completion,
} from "../../Game/CommandLine/suggest";
import { emit, on } from "../../Game/EventBus";
import { matchesAction } from "../../Game/Input/bindings";
import "../Mobile/Mobile.css";
import {
  listChatMessages,
  pushChatMessage,
  pushSystemMessage,
} from "../../Game/State/chatLog";
import { isTouchMode } from "../../Game/State/touchMode";
import { usePanel } from "../PanelStack/usePanel";
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

/**
 * 补全列表一次露几行、每行多高（px）。
 *
 * 这个 8 是从 suggest.ts 的 `MAX_COMPLETIONS` 搬过来的。它在那边同时是
 * "列几条"和"有几条"，于是列表既滚不动也翻不完；搬到这里之后它只剩一个
 * 意思——视口高度 = 行数 × 行高，候选有多少条是数据那边的事。
 *
 * 行高写死，而不是让 `py-1` 加继承来的行高自己凑：视口高度要拿它相乘，
 * 凑出来的隐式值一改字号就和视口对不齐，最后一行会露半截——那半截最容易
 * 被读成"到底了"。
 */
const COMPLETION_ROW_PX = 24;
const VISIBLE_COMPLETION_ROWS = 8;

const KIND_CLASS: Record<ChatMessageKind, string> = {
  [ChatMessageKind.Player]: "text-white",
  [ChatMessageKind.System]: "text-[#9fe08f]",
  [ChatMessageKind.Story]: "text-[#f2d98c]",
  [ChatMessageKind.Npc]: "text-[#9fd2f2]",
};

export function ChatPanel() {
  // 挡屏面板，开关挂在全局面板栈上（ESC 分层归 EscArbiter）
  const [open, setOpen] = usePanel("chat");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [selected, setSelected] = useState(0);
  const [lastAt, setLastAt] = useState(0);
  /** 只为了在淡出时限到点时逼一次重画，值本身没有意义 */
  const [, setFadeTick] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const completionListRef = useRef<HTMLDivElement>(null);
  /** 鼠标上一次真正待过的位置，用来分辨"鼠标动了"和"列表从鼠标底下滚过去" */
  const pointerAt = useRef({ x: -1, y: -1 });
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

  /**
   * 到点了自己重画一次，把消息记录收起来。
   *
   * 底下那句 `faded = Date.now() - lastAt > IDLE_FADE_MS` 是渲染期算的，
   * **但没人在 9 秒后叫它重算**——不再有新消息就不再有 setState，
   * 于是这块记录一直挂在屏幕上，"9 秒后淡掉"从来没真的发生过。
   * 静止的画面里没有别的东西会触发重渲染，超时这件事必须自己安排。
   *
   * 打开着的时候不排：开着就是要看记录，不该自己收。
   */
  useEffect(() => {
    if (open || lastAt === 0) return;

    const remaining = lastAt + IDLE_FADE_MS - Date.now();
    if (remaining <= 0) return;

    // 必须换个新值：给 setState 传同一个值 React 会直接 bail out，不重画
    const timer = setTimeout(() => setFadeTick((n) => n + 1), remaining);
    return () => clearTimeout(timer);
  }, [open, lastAt]);

  // 全局按键：回车开聊天、斜杠开命令。正在别的输入框里打字时不抢
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (typing || open) return;

      if (matchesAction(event, "chat")) {
        event.preventDefault();
        setDraft("");
        setOpen(true);
      } else if (matchesAction(event, "command")) {
        event.preventDefault();
        setDraft("/");
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  useEffect(
    () => on("ui_panel_requested", ({ panel }) => {
      if (panel === "chat") {
        setDraft("");
        setOpen(true);
      }
    }),
    [setOpen],
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    // 开的时候滚到底：玩家想看的是刚发生的事，不是三天前那条
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [open]);

  useEffect(() => setSelected(0), [draft]);

  /*
   * 键盘挪到哪儿，视口跟到哪儿。
   *
   * `block: "nearest"` 是关键：已经在视野里的就不动，只有走出上下边才滚
   * 最小的一点——用 "center" 的话每按一下整个列表都要重新居中，读起来像
   * 列表在抖，而不是光标在走。
   */
  useEffect(() => {
    const row = completionListRef.current?.children[selected];
    if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
  }, [selected, draft]);

  /*
   * 打字时游戏要停手：不锁的话按 W 会一边打字一边往前走。这条广播现在由
   * 面板栈统一派生（EscArbiter 里那一发），进栈就等于"挡着"，不用自己喊。
   */

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
    /*
     * 触摸端不显示这条提示：它讲的是"回车说话 · / 开命令"，手机上两个
     * 键都不存在，而它正好压在摇杆的感应区上。等真做了触摸端的聊天入口
     * （某个按钮）再把提示换成那一套说法。
     */
    if (isTouchMode()) return null;
    return (
      <div className="pointer-events-none absolute bottom-[var(--hotbar-clear)] left-3 z-20 rounded-full bg-black/40 px-2.5 py-1 font-mono text-[11px] text-white/55">
        {t("ui.chat.closed_hint")}
      </div>
    );
  }

  /*
   * 关着时整个外壳都要 `pointer-events-none`，不只是里面那个列表。
   *
   * 之前只给列表加了，外壳（定位盒，触摸端 414x117 那么大一块）仍然吃指针
   * 事件——它透明、看不出来，但正好压在左下角摇杆的感应区上，实测**摇杆推不动**。
   * 透明 ≠ 不挡：只要 pointer-events 是 auto，命中测试就算它。
   * 开着的时候要能点补全项、能选中文字，所以只在关着时关掉。
   */
  return (
    <div
      className={[
        "absolute z-20 font-mono",
        open ? "" : "pointer-events-none",
        /*
         * 触摸端整条挪到快捷栏上方居中（几何写在 Mobile.css 里，和摇杆、
         * 按钮那些尺寸放一起）。留在左下角的话会跟摇杆、快捷栏糊成一团——
         * 横屏只有 375px 高，底部那条带同时要塞摇杆、快捷栏、动作按钮，
         * 再叠一个五行的消息流是排不下的。
         */
        /*
         * 桌面端整条抬到快捷栏**之上**（--hotbar-clear，定义在 index.css）。
         * 原来是 bottom-3，和快捷栏同一条底线——消息一多就直接盖在格子和
         * 需求条上，谁在上面全看 DOM 顺序，等于两块 HUD 抢同一块地。
         * 抬走之后底部那条带只归快捷栏，左侧这一列只归消息。
         */
        isTouchMode()
          ? `touch-chatlog${open ? "" : " touch-chatlog--idle"}`
          : "bottom-[var(--hotbar-clear)] left-3 w-[min(560px,62vw)]",
      ].join(" ")}
    >
      <div
        ref={listRef}
        // chat-log：矮屏上压缩最大高度，见 index.css。展开时的 224px
        // 在 375 高的横屏上会一路顶到左上角的时钟/需求条那一列
        className={`chat-log mb-1 flex flex-col gap-0.5 overflow-y-auto rounded-xl px-2.5 py-1.5 text-[12px] leading-relaxed transition-opacity ${
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
            <div
              ref={completionListRef}
              /*
               * overflow-x 要一起显式关掉：只开 overflow-y 的话 x 轴会跟着
               * 变成 auto，描述文字本来就 truncate，横向滚动条纯属白占一行高。
               * chat-completions：矮屏上把可视行数压到 4 行，见 index.css。
               */
              className="chat-completions mb-1 overflow-x-hidden overflow-y-auto rounded border border-white/15 bg-black/85"
              style={{
                // content-box：不这么写的话上下两条 1px 边框要从 192 里扣，
                // 第 8 行只剩 22px 露在外面——正好是"看着像到底了"的那种半行
                boxSizing: "content-box",
                maxHeight: VISIBLE_COMPLETION_ROWS * COMPLETION_ROW_PX,
              }}
            >
              {completions.map((completion, index) => (
                <button
                  key={completion.replacement}
                  type="button"
                  onMouseMove={(event) => {
                    /*
                     * 用 mousemove 而不是 mouseenter，还要比一次坐标。
                     *
                     * 列表滚起来之后，新的一行会从静止的鼠标底下经过——浏览器
                     * 照样派鼠标事件，于是"键盘选中的"立刻被"鼠标底下的"顶掉：
                     * 按住↓看着像走两步退一步。坐标没变就说明是滚动带出来的，
                     * 不是玩家在动鼠标，不认。
                     */
                    if (
                      event.clientX === pointerAt.current.x &&
                      event.clientY === pointerAt.current.y
                    ) {
                      return;
                    }
                    pointerAt.current = { x: event.clientX, y: event.clientY };
                    setSelected(index);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyCompletion(completion);
                  }}
                  // 行高走定值：视口高度是它乘出来的，见 COMPLETION_ROW_PX
                  style={{ height: COMPLETION_ROW_PX }}
                  className={`flex w-full items-center gap-3 px-2 text-left text-[12px] ${
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

          {/* 输入行加高到 py-2.5、圆角走 full：原来只有 py-1.5，
              贴着记录列表看着像列表的最后一行，分不出哪儿能打字 */}
          <div
            className={`flex items-center gap-2 rounded-full border-2 bg-black/80 px-3 py-2.5 ${
              isCommand ? "border-[#63c0a8]" : "border-white/20"
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
