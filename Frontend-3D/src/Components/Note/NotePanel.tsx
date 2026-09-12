import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { on } from "../../Game/EventBus";
import { letterText } from "../../Game/Systems/mail";
import { signal } from "../../Game/Systems/story";
import { t } from "../../i18n/t";
import { usePanel } from "../PanelStack/usePanel";

/**
 * 从信封里抽出来的那张信纸（居民系统 14）。正文，没有别的——没有寄件人栏、
 * 没有日期、没有按钮。
 *
 * ---- 2026-09-12 重做：从"报纸的纸"换成"对话框的纸" ----
 *
 * 第一版借报纸那套 `news-sheet`（泛黄、衬线、直角、右上一个方框叉）。报纸
 * 是刻意反着全场语言做的版式作品，条子跟着它走等于把一份报纸的边角料
 * 拿来当信纸：放在奶油圆角的 HUD 中间，读起来像一个网页弹窗
 * （用户："一点都不游戏，也不符合目前的 UI 设计"）。
 *
 * 现在按动森的信纸来：
 *   - **纸就是对话气泡那张纸**（奶油底、3px 粉彩描边、大圆角、柔投影），
 *     玩家读它和读旁白那句「门上拿下来了一个信封」是同一种东西；字换成
 *     日记本 / 专注卡那款手写体（Nunito + 霞鹜文楷）——这是别人手写的，
 *     不是系统在说话，对话框那款正文字体放上去就是打印件；
 *   - **顶上压一枚蜡封**，骑在纸的上沿——和对话气泡左上角的名字药丸是
 *     同一种"东西骑在边上"的摆法。蜡是紫的、上面一枚金月牙，颜色从玩家
 *     刚拿在手里的那只信封（recipes/letter.ts）上采的：信纸是从它里面抽
 *     出来的，得认得出是一家；
 *   - 淡淡的横格线，每行一道，正好垫在字底下——信纸的读法靠它，不靠字体；
 *   - **没有关闭叉**。底下一枚对话框那种上下跳的三角，点纸任何地方合上，
 *     和对话框一模一样——玩家在读这张纸之前刚学会那个动作。
 *
 * 动效沿用：遮罩淡入，纸从下方浮起（0.35 s，接拆信封的动作）。不走 Modal 的
 * 印章仪式——那是"打开一块面板"的语言，这里是"摊开一张纸"。reduced-motion 即时。
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

  /*
   * 合上那一拍发 letter_closed（开场的叹气接它）。盯 open 的 true→false，
   * 而不是挂在关闭动作上：ESC / 面板栈从外面把它关掉也算"合上"。
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && letterId) signal("letter_closed", letterId);
    wasOpen.current = open;
  }, [open, letterId]);

  const duration = reduceMotion ? 0 : 0.35;

  return (
    <AnimatePresence>
      {open && letterId ? (
        <motion.div
          key="note"
          className="ui-note-scrim absolute inset-0 z-40 grid min-h-0 place-items-center px-4 py-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration * 0.7 }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          {/*
            整张纸是一个按钮：点哪儿都合上。里面的字和蜡封都不吃指针，
            免得点在字上算"点了字"。
          */}
          <motion.button
            type="button"
            aria-label={t("ui.close")}
            className="ui-note relative block max-h-full min-h-0 cursor-pointer overflow-visible text-left"
            style={{ width: "min(clamp(520px, 78vmin, 680px), 88vw)" }}
            initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration, ease: EASE }}
            onClick={() => setOpen(false)}
          >
            <span className="ui-note-seal pointer-events-none" aria-hidden>
              <WaxSeal />
            </span>
            <span className="ui-note-body pointer-events-none whitespace-pre-line">
              {letterText({ letterId })}
            </span>
            <span className="ui-dialogue-arrow pointer-events-none absolute -bottom-1 left-1/2" />
          </motion.button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * 蜡封：一团紫蜡、上面一枚金月牙和一颗小星。
 *
 * 全部实心块面（和 Modal/seals.tsx 一个路数），缩到 44px 也不糊。蜡的边
 * 不是正圆——外围再叠几粒小圆，才像按下去挤出来的一团，正圆是硬币。
 */
function WaxSeal() {
  const wax = "#5e3a7c";
  const waxDark = "#472b60";
  const gold = "#e8b93f";
  const bumps = [0, 60, 120, 180, 240, 300].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return { cx: 50 + Math.cos(rad) * 33, cy: 50 + Math.sin(rad) * 33 };
  });
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
      {bumps.map((b, i) => (
        <circle key={i} cx={b.cx} cy={b.cy} r={11} fill={waxDark} />
      ))}
      <circle cx="50" cy="50" r="38" fill={waxDark} />
      <circle cx="50" cy="48" r="32" fill={wax} />
      {/* 月牙：两个圆相减，用第二个圆盖回蜡色 */}
      <circle cx="47" cy="47" r="15" fill={gold} />
      <circle cx="53" cy="43" r="12" fill={wax} />
      <circle cx="63" cy="60" r="4" fill={gold} />
    </svg>
  );
}
