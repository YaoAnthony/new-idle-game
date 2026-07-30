import { useEffect, useRef, useState } from "react";
import { runCommand } from "../../Game/CommandLine/commands";

/**
 * 调试命令行。按 ` 或 / 唤起，Esc 收起。
 * 只在开发期存在，正式玩法里改天气要走天气瓶、家具或事件。
 */
export function DebugConsole() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<string[]>([
    "调试命令行 — 输入 /help 查看可用指令",
  ]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if (!open && !typing && (event.key === "`" || event.key === "/")) {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (open && event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (input.trim().length === 0) return;

    const result = runCommand(input);
    setLog((current) =>
      [...current, `> ${input}`, result.message].filter(Boolean).slice(-40),
    );
    setInput("");
  };

  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded bg-black/45 px-2 py-1 font-mono text-[11px] text-white/70">
        按 ` 打开调试命令行
      </div>
    );
  }

  return (
    <div className="absolute bottom-3 left-3 z-20 w-[min(520px,60vw)] rounded-md border border-white/15 bg-black/75 p-2 font-mono text-[12px] text-white/90 backdrop-blur">
      <pre className="mb-1 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed text-white/75">
        {log.join("\n")}
      </pre>
      <form onSubmit={submit}>
        <input
          ref={inputRef}
          className="w-full rounded border border-white/15 bg-black/50 px-2 py-1 text-white outline-none focus:border-white/40"
          value={input}
          placeholder="/time dusk"
          onChange={(event) => setInput(event.target.value)}
          spellCheck={false}
        />
      </form>
    </div>
  );
}
