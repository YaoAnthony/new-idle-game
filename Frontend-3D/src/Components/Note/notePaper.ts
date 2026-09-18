/**
 * 把那张信纸画成一张**贴图**（2026-09-16）。
 *
 * 信纸原来是 DOM（`.ui-note` 那一套 CSS），烧的时候要三层叠着演：CSS 遮罩去掉纸、一张画布 multiply
 * 染焦、一张画布画火。三层各画各的、互相不知道对方在哪，接缝就是不自然（用户："火焰和信封做的非常不自然"）。
 * 改成**信纸本身也进 three.js**（用户定）：纸画成贴图 → 一个平面 → 一遍 shader 里同时算
 * 溶解、焦边、烤焦、余烬、火焰，全部来自同一个噪声场，天然对得上。
 *
 * 这个文件只管"把纸画出来"，不碰烧。尺寸和颜色**逐条照搬原来的 CSS**（`.ui-note` 那几个自定义属性），
 * 所以读信那一段和以前一模一样；烧起来才是新的。
 *
 * 落款的鬼脸是一笔一笔画上去的（原来是 SVG 的 pathLength 动画），这里用 Path2D + 虚线偏移做同一件事，
 * 笔尖位置也从这儿算（星光要跟着笔走）。
 */

const FONT = '"Nunito", "LXGW WenKai GB", "Kaiti SC", sans-serif';
const CREAM = "#fffcf5";
const CREAM_2 = "#fff4e6";
const LINE_DEEP = "#e3ae90";
const INK = "#6a5346";
const DOODLE_INK = "#5e3a7c";
const RADIUS = 22;
const BORDER = 3;

/**
 * 火苗和余光要往纸外面漫，贴图四周留白。火苗最高约 64×1.35 ≈ 86px，加上辉光，留 120；
 * 留少了火苗会被画布边平平切掉（用户 2026-09-16 报的"有一个框限制住了"）。
 */
export const PAPER_PAD = 120;

/** 笔顺：脸 → 帽檐 → 帽尖 → 眨的眼 → 睁的眼 → 嘴 → 舌头（照搬原来的 SVG） */
const DOODLE_STROKES = [
  "M60 32 C78 30 92 44 90 60 C88 78 74 90 58 88 C40 87 28 74 30 58 C32 42 44 33 62 33",
  "M28 36 C46 29 76 29 94 36",
  "M46 33 C50 22 55 12 60 5 C68 6 75 8 83 5 C77 13 79 24 78 33",
  "M42 54 L52 59 L42 64",
  "M70 55 C74 54 76 58 73 60 C70 62 67 58 70 55",
  "M42 70 C50 82 70 82 80 68",
  "M60 77 C59 86 68 88 70 79",
];
/** 落款的时间轴（秒）。和原来的 DOODLE 常量一致 */
export const DOODLE = { start: 1, step: 0.16, each: 0.34 };
export const DOODLE_DONE = DOODLE.start + DOODLE.step * (DOODLE_STROKES.length - 1) + DOODLE.each;

const clamp = (min: number, value: number, max: number): number => Math.max(min, Math.min(max, value));
/** motion 的 easeInOut，笔画进度用它 */
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export type Rect = { x: number; y: number; w: number; h: number };

export type NotePaper = {
  /** 纸、字、蜡封（不含落款） */
  canvas: HTMLCanvasElement;
  /**
   * 落款的墨迹，单独一张透明贴图。烧的时候纸整张烧光，墨迹不受火——最后只剩那张鬼脸本身
   * （用户 2026-09-16："我就想留下那个 svg，然后消失"，不要底下那块纸）。
   */
  ink: HTMLCanvasElement;
  /** 画布的 CSS 尺寸（贴图按 dpr 放大） */
  width: number;
  height: number;
  /** 信纸 + 骑在上沿的蜡封，在画布里的位置（CSS 像素）。烧的进度、火的范围都按它算 */
  content: Rect;
  /** 落款那一小块（boom 的中心） */
  sign: Rect;
  /** 落款画到第几笔（秒，从打开算起）。0 = 一笔没画；≥ DOODLE_DONE = 画完。只重画 ink */
  drawAt(seconds: number): void;
  /** 笔尖此刻在画布哪儿（CSS 像素）；没在画返回 null */
  penTip(seconds: number): { x: number; y: number } | null;
};

/** 按原来的 CSS 算这一屏该多大 */
function metrics(): { fs: number; line: number; seal: number; pad: number; paperW: number } {
  const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
  const fs = clamp(17, 2.6 * vmin, 24);
  return {
    fs,
    line: fs * 1.9,
    seal: clamp(52, 7.2 * vmin, 72),
    pad: clamp(24, 3.6 * vmin, 40),
    paperW: Math.min(clamp(520, 78 * vmin, 680), window.innerWidth * 0.88),
  };
}

/** `white-space: pre-line` 的断行：显式换行照断，超宽的按字断（中文本来就按字断） */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      out.push("");
      continue;
    }
    let current = "";
    for (const ch of paragraph) {
      const next = current + ch;
      if (current !== "" && ctx.measureText(next).width > maxWidth) {
        out.push(current);
        current = ch;
      } else {
        current = next;
      }
    }
    out.push(current);
  }
  return out;
}

/** 蜡封：一团紫蜡 + 金月牙（照搬 WaxSeal 那几个圆） */
function drawSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  const wax = "#5e3a7c";
  const waxDark = "#472b60";
  const gold = "#e8b93f";
  const k = size / 100;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.scale(k, k);
  ctx.translate(-50, -50);
  ctx.fillStyle = waxDark;
  for (let deg = 0; deg < 360; deg += 60) {
    const rad = (deg * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(50 + Math.cos(rad) * 33, 50 + Math.sin(rad) * 33, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(50, 50, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wax;
  ctx.beginPath();
  ctx.arc(50, 48, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(47, 47, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wax;
  ctx.beginPath();
  ctx.arc(53, 43, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(63, 60, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 量一条 SVG 路径的长度和点位。Path2D 不认长度，借一个离屏的 <path> */
function measureStrokes(): Array<{ path: Path2D; svg: SVGPathElement; length: number }> {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.opacity = "0";
  svg.style.pointerEvents = "none";
  document.body.appendChild(svg);
  const out = DOODLE_STROKES.map((d) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", d);
    svg.appendChild(el);
    return { path: new Path2D(d), svg: el, length: el.getTotalLength() };
  });
  // 量完就撤；SVGPathElement 脱离文档之后 getPointAtLength 照样能用
  svg.remove();
  return out;
}

export function createNotePaper(text: string): NotePaper {
  const { fs, line, seal, pad, paperW } = metrics();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  const ink = document.createElement("canvas");
  const ctx = ink.getContext("2d");

  // 先用一个临时上下文量文字（画布还没定大小）
  const probe = document.createElement("canvas").getContext("2d");
  const font = `${fs}px ${FONT}`;
  if (probe) probe.font = font;
  const innerW = paperW - pad * 2 - BORDER * 2;
  const lines = probe ? wrap(probe, text, innerW) : text.split("\n");

  const padTop = seal / 2 + pad * 0.5;
  const bodyH = lines.length * line;
  const signW = line * 2.1;
  const signH = line * 1.7;
  const signTop = pad * 0.25;
  const paperH = padTop + bodyH + signTop + signH + pad + BORDER * 2;

  // 蜡封骑在上沿外面，贴图上要给它留位置
  const sealOver = seal / 2 + 3;
  const width = paperW + PAPER_PAD * 2;
  const height = paperH + sealOver + PAPER_PAD * 2;
  const paperX = PAPER_PAD;
  const paperY = PAPER_PAD + sealOver;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ink.width = canvas.width;
  ink.height = canvas.height;

  const strokes = measureStrokes();
  const signX = paperX + paperW - BORDER - pad + pad * 0.35 - signW;
  const signY = paperY + BORDER + padTop + bodyH + signTop;
  // 落款的 viewBox 是 120×96，按 meet 居中
  const dScale = Math.min(signW / 120, signH / 96);
  const dX = signX + (signW - 120 * dScale) / 2;
  const dY = signY + (signH - 96 * dScale) / 2;

  /** 纸、字、蜡封只画一次；落款在 ink 上每帧重画 */
  const bctx = canvas.getContext("2d");
  if (bctx) {
    bctx.scale(dpr, dpr);
    bctx.beginPath();
    bctx.roundRect(paperX, paperY, paperW, paperH, RADIUS);
    const bg = bctx.createLinearGradient(0, paperY, 0, paperY + paperH);
    bg.addColorStop(0, CREAM);
    bg.addColorStop(1, CREAM_2);
    bctx.fillStyle = bg;
    bctx.fill();
    bctx.lineWidth = BORDER;
    bctx.strokeStyle = LINE_DEEP;
    bctx.stroke();

    // 横格线：一行一道，垫在那一行字底下（和原来的 repeating-gradient 同一个周期）
    const textX = paperX + BORDER + pad;
    const textTop = paperY + BORDER + padTop;
    bctx.strokeStyle = LINE_DEEP;
    bctx.lineWidth = 1;
    for (let i = 0; i < lines.length; i++) {
      const y = Math.round(textTop + (i + 1) * line) - 0.5;
      bctx.beginPath();
      bctx.moveTo(textX, y);
      bctx.lineTo(textX + innerW, y);
      bctx.stroke();
    }

    bctx.font = font;
    bctx.fillStyle = INK;
    bctx.textBaseline = "alphabetic";
    for (let i = 0; i < lines.length; i++) {
      // 基线落在行盒里：(行高 + 字号)/2 是 CSS 行盒的近似基线位置
      bctx.fillText(lines[i], textX, textTop + i * line + (line + fs * 0.72) / 2);
    }

    drawSeal(bctx, paperX + paperW / 2, paperY, seal);
  }

  const drawAt = (seconds: number): void => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ink.width, ink.height);
    ctx.scale(dpr, dpr);
    ctx.save();
    ctx.translate(dX, dY);
    ctx.scale(dScale, dScale);
    ctx.strokeStyle = DOODLE_INK;
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 0; i < strokes.length; i++) {
      const begin = DOODLE.start + DOODLE.step * i;
      const local = clamp(0, (seconds - begin) / DOODLE.each, 1);
      if (local <= 0) continue;
      const drawn = smooth(local) * strokes[i].length;
      ctx.save();
      ctx.setLineDash([drawn, strokes[i].length]);
      ctx.stroke(strokes[i].path);
      ctx.restore();
    }
    ctx.restore();
  };

  const penTip = (seconds: number): { x: number; y: number } | null => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const begin = DOODLE.start + DOODLE.step * i;
      const local = (seconds - begin) / DOODLE.each;
      if (local < 0 || local > 1) continue;
      const p = strokes[i].svg.getPointAtLength(smooth(local) * strokes[i].length);
      return { x: dX + p.x * dScale, y: dY + p.y * dScale };
    }
    return null;
  };

  drawAt(0);

  return {
    canvas,
    ink,
    width,
    height,
    content: { x: paperX, y: paperY - sealOver, w: paperW, h: paperH + sealOver },
    sign: { x: signX, y: signY, w: signW, h: signH },
    drawAt,
    penTip,
  };
}
