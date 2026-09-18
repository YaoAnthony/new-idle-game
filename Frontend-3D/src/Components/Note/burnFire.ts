import type { Rect } from "./notePaper";

/**
 * 烧信的粒子（2026-09-16）：烟、火星、boom 那一圈星星。
 *
 * 火本身、焦边、烤焦都在 `NoteBurnScene` 的 shader 里（信纸也进了 three.js，一遍算完才对得齐）。
 * 这里只剩点缀：它们要飞出纸外、数量少、每颗有自己的轨迹，用 2D 画布画最省事。
 *
 * 火线位置和 shader 用同一个进度换算（不带噪声扰动——粒子差几个像素看不出来）：
 *   q' = −0.12 + q × 1.26，信纸内归一化坐标 nx + ny = 2q'。
 */

type Particle = {
  kind: "smoke" | "ember" | "boom";
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  size: number;
  seed: number;
  hue?: string;
};

const BOOM_COLORS = ["#ffd98d", "#ff9ad5", "#e8b93f", "#fff4c2", "#cdb9e8"] as const;

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
/** 一维平滑噪声，−1..1。粒子左右飘用 */
function wander(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1;
}

function smokeSprite(size = 64): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(70,64,58,0.9)");
  g.addColorStop(0.5, "rgba(70,64,58,0.45)");
  g.addColorStop(1, "rgba(70,64,58,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export class BurnFire {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly dpr = Math.min(window.devicePixelRatio || 1, 2);
  private readonly particles: Particle[] = [];
  private readonly smoke = smokeSprite();
  private last = performance.now();
  private front: { content: Rect; q: number; active: boolean } | null = null;
  private budget = { smoke: 0, ember: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
  }

  get alive(): number {
    return this.particles.length;
  }

  setFront(content: Rect, q: number, active: boolean): void {
    this.front = { content, q, active };
  }

  /** boom：从 (x, y) 炸一圈彩色星星（画布 CSS 像素） */
  burst(x: number, y: number): void {
    const now = performance.now() / 1000;
    for (let i = 0; i < 34; i++) {
      const ang = (i / 34) * Math.PI * 2 + Math.random() * 0.4;
      const v = 150 + Math.random() * 160;
      this.particles.push({
        kind: "boom",
        x,
        y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        born: now,
        life: 0.55 + Math.random() * 0.45,
        size: 3 + Math.random() * 4,
        seed: Math.random() * 100,
        hue: BOOM_COLORS[i % BOOM_COLORS.length],
      });
    }
  }

  /** 火线上的一个随机点；线不在纸里返回 null */
  private pointOnFront(): { x: number; y: number } | null {
    const f = this.front;
    if (!f) return null;
    const s = 2 * (-0.12 + f.q * 1.26);
    const lo = Math.max(0, s - 1);
    const hi = Math.min(1, s);
    if (hi <= lo) return null;
    const nx = lo + Math.random() * (hi - lo);
    return { x: f.content.x + nx * f.content.w, y: f.content.y + (s - nx) * f.content.h };
  }

  private spawn(dt: number, nowS: number): void {
    if (!this.front?.active) return;
    this.budget.smoke += 12 * dt;
    this.budget.ember += 28 * dt;
    for (; this.budget.smoke >= 1; this.budget.smoke -= 1) {
      const p = this.pointOnFront();
      if (!p) break;
      this.particles.push({
        kind: "smoke",
        x: p.x,
        y: p.y - 30,
        vx: (Math.random() - 0.5) * 16,
        vy: -24 - Math.random() * 24,
        born: nowS,
        life: 1.2 + Math.random() * 0.9,
        size: 26 + Math.random() * 26,
        seed: Math.random() * 100,
      });
    }
    for (; this.budget.ember >= 1; this.budget.ember -= 1) {
      const p = this.pointOnFront();
      if (!p) break;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const v = 50 + Math.random() * 110;
      this.particles.push({
        kind: "ember",
        x: p.x,
        y: p.y,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        born: nowS,
        life: 0.5 + Math.random() * 0.8,
        size: 1.3 + Math.random() * 1.6,
        seed: Math.random() * 100,
      });
    }
  }

  render(now: number): number {
    const { ctx, canvas, dpr } = this;
    if (!ctx) return 0;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const nowS = now / 1000;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    this.spawn(dt, nowS);

    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const age = nowS - p.born;
      if (age >= p.life) {
        ps.splice(i, 1);
        continue;
      }
      const u = age / p.life;
      const sway = wander(p.seed + nowS * (p.kind === "smoke" ? 0.6 : 1.8));
      if (p.kind === "smoke") {
        p.vx += sway * 60 * dt;
        p.vy *= 0.985;
      } else if (p.kind === "ember") {
        p.vy += 55 * dt;
        p.vx += sway * 90 * dt;
        p.vx *= 0.96;
      } else {
        p.vx *= 0.9;
        p.vy = p.vy * 0.9 + 60 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      ctx.save();
      ctx.scale(dpr, dpr);
      if (p.kind === "smoke") {
        const size = p.size * (0.7 + 1.3 * u);
        ctx.globalAlpha = (u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8) * 0.22;
        ctx.drawImage(this.smoke, p.x - size / 2, p.y - size / 2, size, size);
      } else if (p.kind === "ember") {
        const k = 1 - u;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k * (0.55 + 0.45 * Math.sin(age * 40 + p.seed));
        ctx.fillStyle = u < 0.5 ? "#ffd98d" : "#ff7a1a";
        ctx.shadowColor = "#ff9a2a";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.7 + 0.3 * k), 0, Math.PI * 2);
        ctx.fill();
      } else {
        const k = 1 - u;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k * k;
        ctx.fillStyle = p.hue ?? "#ffd98d";
        ctx.shadowColor = p.hue ?? "#ffd98d";
        ctx.shadowBlur = 8;
        ctx.translate(p.x, p.y);
        ctx.rotate(age * 6 + p.seed);
        const s = p.size * (0.5 + 0.5 * k);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(0, 0, s, 0);
        ctx.quadraticCurveTo(0, 0, 0, s);
        ctx.quadraticCurveTo(0, 0, -s, 0);
        ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.fill();
      }
      ctx.restore();
    }
    return ps.length;
  }
}
