import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { letterText } from "../../Game/Systems/mail";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 门上的条子（居民系统 14）：一张信纸，正文，没有别的——没有寄件人栏、没有日期、没有按钮。
 * 信纸借信箱那套（news-sheet），条子不进信箱：它贴在门上，不是寄来的。
 */
export function NotePanel() {
  const [open, setOpen] = usePanel("note");
  const [letterId, setLetterId] = useState<string | null>(null);

  useEffect(() => on("note_open_requested", ({ letterId: next }) => {
    setLetterId(next);
    setOpen(true);
  }), [setOpen]);

  if (!open || !letterId) return null;
  return (
    <div
      className="absolute inset-0 z-40 grid min-h-0 place-items-center bg-black/55 px-4 py-5"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="news-sheet relative flex max-h-full min-h-0 flex-col overflow-hidden px-6 pb-5 pt-5" style={{ width: "min(520px,92vw)" }}>
        <button
          type="button"
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center border border-[#3b3428] text-[13px] leading-none"
          aria-label={t("ui.close")}
          onClick={() => setOpen(false)}
        >
          ×
        </button>
        <p className="news-body whitespace-pre-line" style={{ textIndent: 0, fontSize: 16, lineHeight: 1.8 }}>{letterText({ letterId })}</p>
      </div>
    </div>
  );
}
