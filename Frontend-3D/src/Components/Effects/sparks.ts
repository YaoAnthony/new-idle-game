/**
 * 星光粒子（2D canvas）。2026-09-12 从 NotePanel 的落款里抽出来：
 * 信纸的笔尖星光和日记本飞进右上角的尾迹是同一种星，两处共用一份。
 *
 * 用 2D canvas 不用 three：这是 DOM 层里的几十颗星，为它开一个 WebGL 上下文
 * （还得和场景那个抢）换不来任何东西。
 *
 * 星星是四角星（四段二次曲线），不是圆点——圆点是灰尘。金、奶黄、藕紫、米白
 * 四色随机；往上飘、减速、闪。寿命按墙钟算，不按 dt 累加：掉帧时 dt 被夹住，
 * 按 dt 的话星星在墙钟上活得更久，和走墙钟的别的动画对不上。
 *
 * 坐标一律是 **canvas 的 CSS 像素**（调用方不用管 dpr）。
 */

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

const COLORS = ["#e8b93f", "#ffd98d", "#cdb9e8", "#fff4c2"];

export class SparkField {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly sparks: Spark[] = [];
  private readonly dpr = Math.min(window.devicePixelRatio || 1, 2);
  private last = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
  }

  get alive(): number {
    return this.sparks.length;
  }

  /**
   * 在 (x, y) 撒 count 颗。默认朝上散开；给了 dir（弧度）就朝那个方向、小角度散。
   * speed 是 CSS 像素/秒。
   */
  emit(
    x: number,
    y: number,
    count: number,
    options: { speed?: number; big?: boolean; dir?: number; spread?: number } = {},
  ): void {
    const { speed = 55, big = false, dir, spread = 2.2 } = options;
    const dpr = this.dpr;
    const now = performance.now() / 1000;
    for (let i = 0; i < count; i++) {
      const ang = (dir ?? -Math.PI / 2) + (Math.random() - 0.5) * spread;
      const v = speed * dpr * (0.6 + Math.random() * 0.8);
      this.sparks.push({
        x: x * dpr,
        y: y * dpr,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        born: now,
        life: (big ? 0.8 : 0.5) + Math.random() * 0.4,
        size: (big ? 5 : 2.6) * dpr * (0.8 + Math.random() * 0.5),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        phase: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 6,
      });
    }
  }

  /** 从 (x, y) 向四面炸一圈，每三颗一颗大的 */
  burst(x: number, y: number, count = 18, speed = 130): void {
    for (let i = 0; i < count; i++) {
      this.emit(x, y, 1, {
        speed,
        big: i % 3 === 0,
        dir: (i / count) * Math.PI * 2 + Math.random() * 0.3,
        spread: 0,
      });
    }
  }

  /**
   * 推进一帧并重画。返回还活着的颗数——调用方据此决定要不要继续 rAF。
   * 画布尺寸每帧对一次（跟着元素的 CSS 尺寸走），变了才重设——重设会清空画布。
   */
  render(now: number): number {
    const { ctx, canvas, dpr } = this;
    if (!ctx) return 0;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);
    const nowS = now / 1000;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      const age = nowS - s.born;
      if (age >= s.life) {
        this.sparks.splice(i, 1);
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
      star(ctx, s.size * twinkle * (0.6 + 0.4 * k));
      ctx.fill();
      ctx.restore();
    }
    return this.sparks.length;
  }
}

function star(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(0, 0, s, 0);
  ctx.quadraticCurveTo(0, 0, 0, s);
  ctx.quadraticCurveTo(0, 0, -s, 0);
  ctx.quadraticCurveTo(0, 0, 0, -s);
  ctx.closePath();
}
