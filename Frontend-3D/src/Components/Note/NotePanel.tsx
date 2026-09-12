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
 *     和对话框一模一样——玩家在读这张纸之前刚学会那个动作；
 *   - **落款是一个鬼脸涂鸦**（2026-09-12 加），右下角，打开 1 秒后才一笔
 *     一笔画出来，笔尖上冒星星。设计稿定了条子没有寄件人、文案一字不加，
 *     所以落款不是字，是她随手画的一张戴尖帽吐舌头的脸——懒、随手、只在意
 *     屋子，这个人的签名本来就该是这样。延迟是让玩家先把两行字读完：字和画
 *     同时出现，眼睛会先被动的东西抓走。
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
            <span className="ui-note-sign pointer-events-none" aria-hidden>
              <Doodle instant={Boolean(reduceMotion)} />
            </span>
            <span className="ui-dialogue-arrow pointer-events-none absolute -bottom-1 left-1/2" />
          </motion.button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * 落款的笔画时间轴（秒）。**笔画和星光共用这一份**：星星要跟着笔尖走，
 * 两边各写一套数字，改一处忘一处，星星就会跑在笔前面。
 *
 * start 从 2 收到 1（用户 2026-09-12）：两行字一秒够扫完，等两秒像卡住了。
 */
const DOODLE = { start: 1, step: 0.16, each: 0.34 };
// 笔顺：脸 → 帽檐 → 帽尖 → 眨的眼 → 睁的眼 → 嘴 → 舌头
const DOODLE_STROKES = [
  "M60 32 C78 30 92 44 90 60 C88 78 74 90 58 88 C40 87 28 74 30 58 C32 42 44 33 62 33",
  "M28 36 C46 29 76 29 94 36",
  "M46 33 C50 22 55 12 60 5 C68 6 75 8 83 5 C77 13 79 24 78 33",
  "M42 54 L52 59 L42 64",
  "M70 55 C74 54 76 58 73 60 C70 62 67 58 70 55",
  "M42 70 C50 82 70 82 80 68",
  "M60 77 C59 86 68 88 70 79",
];
/** 画完的那一拍：最后一笔收笔 = 脸蹦一下 = 星星炸开 */
const DOODLE_DONE = DOODLE.start + DOODLE.step * (DOODLE_STROKES.length - 1) + DOODLE.each;
const DOODLE_INK = "#5e3a7c";

/**
 * 落款的鬼脸：戴尖帽、一只眼眨着、吐舌头。
 *
 * 全是描边路径，没有填充——它要读成"用笔画上去的"，和上面实心块面的
 * 蜡封（那是按上去的）不是一种东西。每一笔用 pathLength 从 0 走到 1，
 * 按笔顺错开：先脸、再帽子、再五官，画完整张脸蹦一下，像落笔那一下的劲。
 * 路径故意不闭合、曲线故意歪，闭合的正圆是图标不是涂鸦。
 *
 * 笔尖上冒星星（`useSparkles`）：画在一块盖住整张纸的 canvas 上，不在 SVG 里
 * ——星星要飞出落款那个小框，而且几十颗每帧重画，DOM 节点做不起。
 *
 * instant（reduced-motion）：直接画好，不演，也没有星星。
 */
function Doodle({ instant }: { instant: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useSparkles(svgRef, !instant);
  return (
    <motion.svg
      ref={svgRef}
      viewBox="0 0 120 96"
      width="100%"
      height="100%"
      fill="none"
      stroke={DOODLE_INK}
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      /*
       * 这里**不能写 initial={false}**：motion 会把它沿树往下传，子路径拿到的
       * initial 就成了 false，pathLength 直接停在 1——整张脸一打开就画好了，
       * 延迟形同虚设（第一轮截图就是这样）。给一个显式初始值就断开传递。
       */
      initial={{ scale: 1, rotate: 0 }}
      animate={instant ? undefined : { scale: [1, 1, 1.14, 1], rotate: [0, 0, -6, 0] }}
      transition={{ delay: DOODLE_DONE, duration: 0.32, ease: "easeOut", times: [0, 0, 0.5, 1] }}
      style={{ transformOrigin: "50% 60%", overflow: "visible" }}
    >
      {DOODLE_STROKES.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          initial={instant ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { delay: DOODLE.start + DOODLE.step * i, duration: DOODLE.each, ease: "easeInOut" },
            opacity: { delay: DOODLE.start + DOODLE.step * i, duration: 0.01 },
          }}
        />
      ))}
    </motion.svg>
  );
}

/* ==============   星光   ============== */

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  color: string;
  phase: number;
  rot: number;
  spin: number;
};

const SPARK_COLORS = ["#e8b93f", "#ffd98d", "#cdb9e8", "#fff4c2"];

/** 和 motion 的 easeInOut（cubic-bezier(.42,0,.58,1)）够接近，笔尖差半个像素看不出 */
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * 笔尖上的星光。
 *
 * 一块 canvas 盖在整张纸上（.ui-note-sparks，四边各多出 60px），每帧：
 *   1. 按 DOODLE 的时间轴算此刻笔在哪一笔的百分之几，`getPointAtLength`
 *      取到 SVG 坐标，经 `getScreenCTM` 换到屏幕再减 canvas 的位置——
 *      纸的入场还在 scale，每帧重算才贴得住；
 *   2. 在笔尖撒两三颗，往上飘、减速、闪；
 *   3. 收笔那一拍（DOODLE_DONE）从脸中心炸一圈。
 * 星星是四角星（四段二次曲线），不是圆点：圆点是灰尘。
 *
 * 用 2D canvas 不用 three：这是一块 DOM 面板里的几十颗星，开一个 WebGL
 * 上下文（还得和场景那个抢）换不来任何东西。
 *
 * 画完再等星星全灭才停 rAF；面板关掉时 effect 清理，不会留一个跑空的循环。
 */
function useSparkles(svgRef: React.RefObject<SVGSVGElement | null>, enabled: boolean) {
  useEffect(() => {
    const svg = svgRef.current;
    if (!enabled || !svg) return;
    const note = svg.closest(".ui-note");
    if (!note) return;

    const canvas = document.createElement("canvas");
    canvas.className = "ui-note-sparks";
    note.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return;
    }

    const paths = Array.from(svg.querySelectorAll("path"));
    const lengths = paths.map((p) => p.getTotalLength());
    const sparks: Spark[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const t0 = performance.now();
    let last = t0;
    let burst = false;
    let raf = 0;
    /** 笔尖撒星按时间计（每秒 90 颗），不按帧：按帧的话 60 fps 下密成一条线、掉帧时又稀稀拉拉 */
    let spawnBudget = 0;

    const toCanvas = (sx: number, sy: number) => {
      const ctm = svg.getScreenCTM();
      const rect = canvas.getBoundingClientRect();
      if (!ctm) return null;
      const pt = new DOMPoint(sx, sy).matrixTransform(ctm);
      return { x: (pt.x - rect.left) * dpr, y: (pt.y - rect.top) * dpr };
    };

    /** 此刻笔尖在哪（SVG 坐标）；没在画返回 null */
    const penTip = (t: number) => {
      for (let i = paths.length - 1; i >= 0; i--) {
        const begin = DOODLE.start + DOODLE.step * i;
        const local = (t - begin) / DOODLE.each;
        if (local < 0 || local > 1) continue;
        const p = paths[i].getPointAtLength(smooth(local) * lengths[i]);
        return { x: p.x, y: p.y };
      }
      return null;
    };

    const spawn = (x: number, y: number, speed: number, big: boolean, dir?: number) => {
      const ang = dir ?? -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = speed * (0.6 + Math.random() * 0.8);
      sparks.push({
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        born: performance.now() / 1000,
        life: (big ? 0.8 : 0.5) + Math.random() * 0.4,
        size: (big ? 5 : 2.6) * dpr * (0.8 + Math.random() * 0.5),
        color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
        phase: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 6,
      });
    };

    const star = (s: number) => {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(0, 0, s, 0);
      ctx.quadraticCurveTo(0, 0, 0, s);
      ctx.quadraticCurveTo(0, 0, -s, 0);
      ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.closePath();
    };

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      // 上限 0.1：切走再切回来别一帧飞出屏。寿命不用 dt 累加——软渲染 5 fps 时 dt 被夹住，
      // 星星在墙钟上会活四倍长，而笔画（motion）走的是墙钟，两边就对不上了
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // 尺寸跟着纸走（入场 scale、窗口缩放），每帧对一次，变了才重设——重设会清空画布
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const tip = penTip(t);
      if (tip) {
        spawnBudget += 90 * dt;
        const c = toCanvas(tip.x, tip.y);
        for (; spawnBudget >= 1; spawnBudget -= 1) if (c) spawn(c.x, c.y, 55 * dpr, false);
      } else {
        spawnBudget = 0;
      }
      if (!burst && t >= DOODLE_DONE) {
        burst = true;
        const c = toCanvas(60, 58);
        if (c) {
          for (let i = 0; i < 18; i++) {
            spawn(c.x, c.y, 130 * dpr, i % 3 === 0, (i / 18) * Math.PI * 2 + Math.random() * 0.3);
          }
        }
      }

      ctx.clearRect(0, 0, w, h);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = now / 1000 - s.born;
        if (age >= s.life) {
          sparks.splice(i, 1);
          continue;
        }
        s.vx *= 0.93;
        s.vy = s.vy * 0.93 - 40 * dpr * dt; // 往上飘
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.spin * dt;
        const k = 1 - age / s.life;
        const twinkle = 0.65 + 0.35 * Math.sin(age * 26 + s.phase);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.globalAlpha = k * k;
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 6 * dpr;
        star(s.size * twinkle * (0.6 + 0.4 * k));
        ctx.fill();
        ctx.restore();
      }

      if (t < DOODLE_DONE + 0.3 || sparks.length > 0) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, [svgRef, enabled]);
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
