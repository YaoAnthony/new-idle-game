import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { emit, handle } from "../../Game/EventBus";
import { letterText } from "../../Game/Systems/mail";
import { signal } from "../../Game/Systems/story";
import { t } from "../../i18n/t";
import { SparkField } from "../Effects/sparks";
import { usePanel } from "../PanelStack/usePanel";
import { BurnFire } from "./burnFire";
import { NoteBurnScene } from "./NoteBurnScene";
import { createNotePaper, DOODLE_DONE, type NotePaper } from "./notePaper";

/**
 * 从信封里抽出来的那张信纸（居民系统 14）。正文，没有别的——没有寄件人栏、没有日期、没有按钮。
 *
 * 历次改动（细节见 git 历史）：
 * - 2026-09-12：纸 = 对话气泡那张纸（奶油底、粉彩描边、大圆角），手写体，顶上一枚紫蜡封，
 *   淡横格线，没有关闭叉，点纸任何地方合上；右下角的落款是一张一笔一笔画出来的鬼脸，笔尖冒星星。
 * - 2026-09-16：读完不是合上，是**烧掉**。火线从左上烧到右下，只剩右下角的鬼脸，停半拍 boom 掉，
 *   信封也从快捷栏里没了（规则 opening_letter_burned）。配音 fire_letter.wav。
 * - 2026-09-16：**信纸本身进 three.js**（用户定）。原来纸是 DOM、火是另外两张画布，三层各画各的，
 *   接缝不自然。现在纸画成贴图（`notePaper`），烧的全部效果在一个 shader 里（`NoteBurnScene`）；
 *   这个组件只剩：遮罩、点纸的热区、两层粒子画布（笔尖星光 / 烟和火星）、时间轴。
 *
 * 触发烧：点纸、点遮罩、ESC（面板栈关掉 note）都算"读完了"。面板栈照旧关，这里看到 open 翻成 false
 * 不卸载，先把火演完再收，收掉那一拍发 letter_burned + letter_closed（开场的叹气接后者，
 * 所以要等火烧完再发，不然对话框会开在火上面）。reduced-motion：不演，直接收。
 */

const EASE = [0.16, 1, 0.3, 1] as const;
/** 火的时长跟用户给的音效（fire_letter.wav，5 秒：噼啪到最后 boom）对齐 */
const BURN_SECONDS = 2.2;
const HOLD_SECONDS = 0.55;
const BOOM_SECONDS = 0.45;
const DONE_SECONDS = BURN_SECONDS + HOLD_SECONDS + BOOM_SECONDS + 0.35;

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

type Phase = "reading" | "burning" | "boom";

export function NotePanel() {
  const [open, setOpen] = usePanel("note");
  const [letterId, setLetterId] = useState<string | null>(null);
  /** 面板栈关了之后纸还要留着烧完，所以显示与否自己记 */
  const [shown, setShown] = useState(false);
  const [phase, setPhase] = useState<Phase>("reading");
  const [paper, setPaper] = useState<NotePaper | null>(null);
  const reduceMotion = useReducedMotion();

  const sceneRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  /** 开烧的时刻（performance.now）；null = 还在读 */
  const burnStart = useRef<number | null>(null);

  useEffect(
    () =>
      handle("note_open_requested", ({ letterId: next }) => {
        burnStart.current = null;
        setLetterId(next);
        setPhase("reading");
        setShown(true);
        setOpen(true);
      }),
    [setOpen],
  );

  // 画纸。字体没加载完就先画一版，加载完再画一版（不然手写体会先用兜底字体顶上）
  useEffect(() => {
    if (!shown || !letterId) return;
    let cancelled = false;
    const build = () => {
      if (!cancelled) setPaper(createNotePaper(letterText({ letterId })));
    };
    build();
    if (document.fonts && document.fonts.status !== "loaded") void document.fonts.ready.then(build);
    return () => {
      cancelled = true;
    };
  }, [shown, letterId]);

  const finish = useRef<() => void>(() => undefined);
  finish.current = () => {
    const id = letterId;
    burnStart.current = null;
    setShown(false);
    setPaper(null);
    if (id) {
      signal("letter_burned", id);
      signal("letter_closed", id);
    }
  };

  // 面板栈把它关掉 → 开烧
  useEffect(() => {
    if (open || !shown || !letterId || burnStart.current !== null) return;
    if (reduceMotion) {
      finish.current();
      return;
    }
    burnStart.current = performance.now();
    setPhase("burning");
    emit("letter_burn_started", { letterId });
  }, [open, shown, letterId, reduceMotion]);

  // 主循环：落款一笔一笔画、笔尖星光、烧、boom、收
  useEffect(() => {
    const sceneCanvas = sceneRef.current;
    const penCanvas = penRef.current;
    const fxCanvas = fxRef.current;
    if (!paper || !sceneCanvas || !penCanvas || !fxCanvas) return;

    let scene: NoteBurnScene;
    try {
      scene = new NoteBurnScene(sceneCanvas, paper);
    } catch {
      // 没有 WebGL：不演，读完直接收
      return;
    }
    const pen = new SparkField(penCanvas);
    const fx = new BurnFire(fxCanvas);
    const opened = performance.now();
    const signCenter = { x: paper.sign.x + paper.sign.w / 2, y: paper.sign.y + paper.sign.h / 2 };
    let doodleDone = false;
    let penBurst = false;
    let boomed = false;
    let finished = false;
    let penBudget = 0;
    let lastPen = opened;
    let raf = 0;

    const frame = (now: number) => {
      const s = (now - opened) / 1000;
      const bs = burnStart.current;

      // ---- 落款 ----
      if (!doodleDone) {
        const at = reduceMotion || bs !== null ? DOODLE_DONE + 1 : s;
        paper.drawAt(at);
        scene.refreshInk();
        if (at >= DOODLE_DONE) doodleDone = true;
      }
      const dt = Math.min((now - lastPen) / 1000, 0.1);
      lastPen = now;
      if (!reduceMotion && bs === null) {
        const tip = paper.penTip(s);
        if (tip) {
          penBudget += 90 * dt;
          for (; penBudget >= 1; penBudget -= 1) pen.emit(tip.x, tip.y, 1);
        } else {
          penBudget = 0;
        }
        if (!penBurst && s >= DOODLE_DONE) {
          penBurst = true;
          pen.burst(signCenter.x, signCenter.y);
        }
      }

      // ---- 烧 ----
      if (bs !== null) {
        const tb = (now - bs) / 1000;
        const q = easeInOut(Math.min(1, tb / BURN_SECONDS));
        scene.setProgress(q);
        scene.setHeat(Math.min(1, tb / 0.15));
        scene.setFire(tb < BURN_SECONDS ? Math.min(1, tb / 0.15) : Math.max(0, 1 - (tb - BURN_SECONDS) / 0.4));
        fx.setFront(paper.content, q, tb < BURN_SECONDS);
        if (tb >= BURN_SECONDS + HOLD_SECONDS) {
          scene.setBoom(Math.min(1, (tb - BURN_SECONDS - HOLD_SECONDS) / BOOM_SECONDS));
          if (!boomed) {
            boomed = true;
            fx.burst(signCenter.x, signCenter.y);
            setPhase("boom");
          }
        }
        if (!finished && tb >= DONE_SECONDS) {
          finished = true;
          finish.current();
          return;
        }
      }

      scene.render(now / 1000);
      pen.render(now);
      fx.render(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      scene.dispose();
    };
  }, [paper, reduceMotion]);

  const duration = reduceMotion ? 0 : 0.35;
  const burning = phase !== "reading" && shown;
  // 纸太高就整体缩小塞进屏幕（贴图是按 CSS 像素画的，缩放只是显示）。按**信纸本身**算，
  // 四周给火留的白边允许伸出屏幕——不然留白越大纸越小
  const fit = paper
    ? Math.min(1, (window.innerHeight - 24) / paper.content.h, (window.innerWidth - 16) / paper.content.w)
    : 1;

  return (
    <AnimatePresence>
      {shown && letterId ? (
        <motion.div
          key="note"
          className="ui-note-scrim absolute inset-0 z-40 grid min-h-0 place-items-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration * 0.7 }}
          onPointerDown={(event) => {
            if (!burning && event.target === event.currentTarget) setOpen(false);
          }}
        >
          {paper && (
            <motion.div
              className="relative shrink-0"
              style={{ width: paper.width, height: paper.height, scale: fit }}
              initial={reduceMotion ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration, ease: EASE }}
            >
              {/* 纸 + 火：one shader。boom 的时候整块一鼓一缩——那时只剩落款，读出来就是鬼脸在蹦 */}
              <motion.div
                className="absolute inset-0"
                style={{ transformOrigin: `${paper.sign.x + paper.sign.w / 2}px ${paper.sign.y + paper.sign.h / 2}px` }}
                animate={phase === "boom" ? { scale: [1, 1.3, 0], rotate: [0, -12, 20] } : { scale: 1, rotate: 0 }}
                transition={{ duration: BOOM_SECONDS, ease: "easeIn", times: [0, 0.45, 1] }}
              >
                <canvas ref={sceneRef} className="ui-note-layer" aria-hidden />
              </motion.div>
              <canvas ref={penRef} className="ui-note-layer" aria-hidden />
              <canvas ref={fxRef} className="ui-note-layer" aria-hidden />
              {phase === "boom" && (
                <span
                  className="ui-note-puff"
                  style={{ left: paper.sign.x + paper.sign.w / 2, top: paper.sign.y + paper.sign.h / 2 }}
                  aria-hidden
                />
              )}

              {/* 点纸任何地方 = 读完了（= 开烧）。烧着的时候失效 */}
              <button
                type="button"
                aria-label={t("ui.close")}
                disabled={burning}
                className="absolute cursor-pointer rounded-[22px] disabled:cursor-default"
                style={{
                  left: paper.content.x,
                  top: paper.content.y,
                  width: paper.content.w,
                  height: paper.content.h,
                }}
                onClick={() => {
                  if (!burning) setOpen(false);
                }}
              >
                {/* 读屏器读这段；画面上的字在贴图里 */}
                <span className="sr-only whitespace-pre-line">{letterText({ letterId })}</span>
                {!burning && <span className="ui-dialogue-arrow pointer-events-none absolute -bottom-1 left-1/2" />}
              </button>
            </motion.div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
