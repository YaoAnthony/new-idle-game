import { ChatMessageKind } from "core";
import { AnimatePresence, motion, useReducedMotion, type Easing } from "motion/react";
import { useEffect, useState } from "react";
import { on } from "../../Game/EventBus";
import { pushChatMessage } from "../../Game/State/chatLog";
import { t } from "../../i18n/t";

/**
 * 提示条（2026-09-12 重做成一栈）。内容由 `story_toast` 推：剧情效果 show_toast、成就达成。
 *
 * 照用户给的 motion 通知栈示例做，**方向反过来**：那份是从底下往上冒，这份挂在屏幕
 * 正上方（Hud/HudTopCenter 那一栈），所以从上往下落——进场 y −14 → 0、退场往上收，
 * 变形原点在顶边。`layout` + `popLayout`：一条退了，下面的补上来是滑过去的，不是跳。
 * 每条自己到点消失，也能点 ✕ 关；同时记进消息流（浮层管"现在看得见"，记录管"翻得回去"）。
 *
 * 样式跟面板一个语言：白卡、暖灰描边、圆角、软投影；有标题的（成就）标题深字 + 正文灰字，
 * 没标题的（剧情一句话）只有正文。
 */
const EXIT_DURATION = 0.2;
const EASE_OUT: Easing = [0.215, 0.61, 0.355, 1];

type Toast = {
  id: number;
  title?: string;
  text: string;
  icon?: string;
};

let nextId = 0;

export function StoryToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const dismiss = (id: number) => {
      timers.delete(id);
      setToasts((list) => list.filter((toast) => toast.id !== id));
    };

    const off = on("story_toast", ({ localizationKey, durationMs, text: prepared, title, icon }) => {
      const text = prepared ?? t(localizationKey);
      pushChatMessage({
        kind: ChatMessageKind.Story,
        text: title ? `${title}：${text}` : text,
        sourceKey: localizationKey,
      });
      const id = ++nextId;
      setToasts((list) => [...list, { id, title, text, icon }]);
      timers.set(id, setTimeout(() => dismiss(id), durationMs));
    });

    return () => {
      off();
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="pointer-events-none flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false} mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            role="status"
            aria-live="polite"
            layout
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -14, scaleX: 0.8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scaleX: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    y: -10,
                    scaleX: 0.9,
                    transition: {
                      opacity: { duration: EXIT_DURATION, ease: EASE_OUT },
                      y: { duration: EXIT_DURATION, ease: EASE_OUT },
                      scaleX: { duration: EXIT_DURATION, ease: EASE_OUT },
                    },
                  }
            }
            transition={{ type: "spring", stiffness: 200, damping: 18, bounce: 0 }}
            style={{ transformOrigin: "center top", fontFamily: '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif' }}
            className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border-2 border-[#EEE9DE] bg-white/95 px-4 py-2.5 shadow-[0_8px_20px_rgba(60,40,20,0.14)] short:gap-2 short:px-3 short:py-2"
          >
            {toast.icon && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#FFF8E1] text-[20px] short:h-7 short:w-7 short:text-[16px]">
                {toast.icon.startsWith("/") ? <img src={toast.icon} alt="" className="h-[78%] w-[78%] object-contain" draggable={false} /> : toast.icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {toast.title && <p className="m-0 truncate text-[15px] font-black leading-tight text-[#2b3b36] short:text-[13px]">{toast.title}</p>}
              <p className={`m-0 text-[13px] leading-snug short:text-[12px] ${toast.title ? "mt-0.5 text-[#8D7B6E]" : "text-[#4a3b2a]"}`}>{toast.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setToasts((list) => list.filter((item) => item.id !== toast.id))}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-0 bg-transparent text-[#BCAAA4] hover:bg-[#F5F0E6] hover:text-[#8D7B6E]"
              aria-label={t("ui.close")}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M10.546 1.354L1.354 10.546M10.546 10.546L1.354 1.354" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
