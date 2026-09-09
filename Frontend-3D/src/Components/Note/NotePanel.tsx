import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { letterText } from "../../Game/Systems/mail";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 门上的条子（居民系统 14）：一张信纸，正文，没有别的——没有寄件人栏、没有日期、没有按钮。
 * 信纸借信箱那套（news-sheet），条子不进信箱：它贴在门上，不是寄来的。
 *
 * 2026-09-09 加了动效：遮罩淡入，信纸从下方浮起来（0.35 s，和拆信封的动作接上）。
 * 不走 Modal 的印章仪式——那是"打开一块面板"的语言，这里是"摊开一张纸"。
 * reduced-motion 时即时。
 */
const EASE = [0.16, 1, 0.3, 1] as const;

export function NotePanel() {
  const [open, setOpen] = usePanel("note");
  const [letterId, setLetterId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(
    () =>
      on("note_open_requested", ({ letterId: next }) => {
        setLetterId(next);
        setOpen(true);
      }),
    [setOpen],
  );

  const duration = reduceMotion ? 0 : 0.35;

  return (
    <AnimatePresence>
      {open && letterId ? (
        <motion.div
          key="note"
          className="absolute inset-0 z-40 grid min-h-0 place-items-center bg-black/55 px-4 py-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration * 0.7 }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            className="news-sheet relative flex max-h-full min-h-0 flex-col overflow-hidden px-6 pb-5 pt-5"
            style={{ width: "min(520px,92vw)" }}
            initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }
            }
            transition={{ duration, ease: EASE }}
          >
            <button
              type="button"
              className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center border border-[#3b3428] text-[13px] leading-none"
              aria-label={t("ui.close")}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <p
              className="news-body whitespace-pre-line"
              style={{ textIndent: 0, fontSize: 16, lineHeight: 1.8 }}
            >
              {letterText({ letterId })}
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
