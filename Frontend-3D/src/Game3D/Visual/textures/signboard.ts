import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three";

/**
 * 店铺招牌贴图——**运行时 canvas 画出来**，和玄关障子门同一套路子
 * （见 textures/shoji.ts 里那段"为什么是画的不是 PNG"）。
 *
 * 招牌非画不可：概念图里每家店门头都挂着写了字的木牌，那是"这是一条
 * 商业街"最强的信号。用色块拼中文字是不可能的，而加一张 PNG 就给
 * "全部造型程序化"这条规矩开了口子。canvas 两头都占：没有资源文件、
 * 字随规格表走（改店名不用重新导图），还只花一个 draw call。
 */

const TEXTURE_HEIGHT = 128;
const cache = new Map<string, CanvasTexture>();

export type SignConfig = {
  text: string;
  /** 牌面宽高比（世界单位），决定像素宽——不给对字会被拉扁 */
  aspect: number;
  /** 牌底色（木/石/漆） */
  board: string;
  /** 边框与字色 */
  ink: string;
};

/** 环境没有 2d canvas（jsdom）。问过一次就记住，别每块牌子都去踩一遍 */
let canvasBroken = false;

export function signboardTexture(config: SignConfig): CanvasTexture | null {
  if (canvasBroken) return null;
  const key = `${config.text}|${config.aspect}|${config.board}|${config.ink}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const height = TEXTURE_HEIGHT;
  const width = Math.max(64, Math.round(height * config.aspect));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    ctx = null;
  }
  /*
   * **拿不到 2d 上下文就答 null，不抛**（模型即碰撞·期 D 逼出来的）。
   *
   * headless 测试（jsdom）没有 canvas 实现，而碰撞体从视觉模型推导——
   * 建模函数从此必须能在无 canvas 环境跑通。招牌贴图是纯装饰：
   * 没有渲染器的环境根本不会把它画出来，缺它只是牌子变纯色，
   * 抛异常却会让**整栋楼失去碰撞**。
   */
  if (!ctx) {
    canvasBroken = true;
    return null;
  }

  // 牌底 + 一道浅木纹：纯色牌子看着像塑料片
  ctx.fillStyle = config.board;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#000000";
  for (let y = 0; y < height; y += 7) {
    ctx.fillRect(0, y + (y % 14 === 0 ? 0 : 2), width, 1.5);
  }
  ctx.globalAlpha = 1;

  // 双线边框（外粗内细），概念图的牌子都有这道边
  ctx.strokeStyle = config.ink;
  ctx.lineWidth = Math.max(3, height * 0.045);
  ctx.strokeRect(
    ctx.lineWidth / 2,
    ctx.lineWidth / 2,
    width - ctx.lineWidth,
    height - ctx.lineWidth,
  );
  ctx.lineWidth = Math.max(1, height * 0.012);
  const inset = height * 0.11;
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

  // 店名。字号按牌子高度取，宋体系（衬线）最像手写招牌
  ctx.fillStyle = config.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = height * 0.46;
  ctx.font = `700 ${size}px "Songti SC", "SimSun", "Noto Serif SC", serif`;
  // 字距撑开一点，三个字的牌子才不挤在中间
  const chars = [...config.text];
  const step = Math.min(size * 1.25, (width - inset * 3) / chars.length);
  const start = width / 2 - (step * (chars.length - 1)) / 2;
  for (const [i, char] of chars.entries()) {
    ctx.fillText(char, start + i * step, height / 2 + size * 0.03);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // mipmap 必开：不开的话远处的牌子会闪成一片摩尔纹（门贴图的教训）
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  cache.set(key, texture);
  return texture;
}
