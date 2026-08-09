import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three";
import { PALETTE } from "../palette.js";

/**
 * 玄关引き戸的门面贴图——**运行时用 canvas 画出来，不是资源文件**。
 *
 * ## 为什么从"堆盒子"改成贴图（2026-08-09）
 *
 * 上一版每扇门是外框 4 条 + 腰板 2 块 + 玻璃 1 块 + 组子 5 条 + 引手，
 * 十几个 box 摞在 6 厘米的厚度里。两个后果：
 *
 * 1. **z-fighting**。组子条厚 0.042、玻璃厚 0.024，两者的背面正好落在
 *    同一个平面上，深度缓冲分不出前后，屏幕上就是一片爬动的斜纹。
 *    往厚度里塞越多层，这种事越必然——不是调一下偏移能根治的。
 * 2. **每个 box 是一个独立 Mesh**（见 primitives 的 box），也就是
 *    一个 draw call。一扇门 12 个、两扇 24 个，就为了画一扇平的门。
 *
 * 贴图把两件事一起解决：一张图 = 一个平面 = 1 个 draw call，
 * 而且所有细节都在**同一个表面上**，没有深度可打架。
 *
 * ## 为什么是画出来的，不是 PNG
 *
 * 这个项目的全部造型都是程序化的，没有任何模型/贴图资源
 * （唯一的例外是专辑封面，那是玩家自己的曲库）。加一张 door.png
 * 就等于给这条规矩开一个口子，以后每件东西都要问"画还是贴"。
 * canvas 画出来的贴图两头都占：没有资源文件、参数化（格数、配色
 * 跟着色板走），又拿到贴图的全部好处。
 *
 * 代价是一张 512 高的位图（约 1 MB 显存）和几十行绘制代码——
 * 比起省下的 20 多个 draw call，这个买卖很划算。
 */

/** 贴图高度（像素）。宽度按门扇的长宽比算，格子才不会被拉扁 */
const TEXTURE_HEIGHT = 512;

const cache = new Map<string, CanvasTexture>();

export type ShojiConfig = {
  /** 门扇的宽高比（世界单位）。决定贴图的像素宽 */
  aspect: number;
  /** 组子的竖挡数 */
  columns: number;
  /** 组子的横挡数 */
  rows: number;
  /** 引手画在左边还是右边 */
  pullSide: "left" | "right";
};

/**
 * 画一扇引き戸的正面。坐标全部按 0..1 归一化后乘尺寸，
 * 改宽高比时构图不会走样。
 */
function paint(canvas: HTMLCanvasElement, config: ShojiConfig): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  /** 外框料宽（占贴图短边的比例） */
  const stile = Math.round(w * 0.085);
  /** 腰板占门扇下部多少 */
  const skirtTop = Math.round(h * 0.68);

  // ---- 底：整扇先铺深木色，露出来的就是外框 ----
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(0, 0, w, h);

  // ---- 腰板：下三分之一的实木板。全玻璃的门在低多边形里会变成
  //      一个发白的方洞，有腰板才看得出"这是一扇门" ----
  ctx.fillStyle = PALETTE.woodMid;
  ctx.fillRect(stile, skirtTop + stile, w - stile * 2, h - skirtTop - stile * 2);
  // 腰板上的两道浅刻线，木板才不是一块死色
  ctx.strokeStyle = PALETTE.woodLight;
  ctx.lineWidth = Math.max(1, Math.round(w * 0.008));
  ctx.globalAlpha = 0.35;
  for (const t of [0.34, 0.68]) {
    const y = skirtTop + stile + (h - skirtTop - stile * 2) * t;
    ctx.beginPath();
    ctx.moveTo(stile * 1.6, y);
    ctx.lineTo(w - stile * 1.6, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ---- 毛玻璃 ----
  const glassX = stile;
  const glassY = stile;
  const glassW = w - stile * 2;
  const glassH = skirtTop - stile * 2;
  ctx.fillStyle = PALETTE.doorGlass;
  ctx.fillRect(glassX, glassY, glassW, glassH);

  // 玻璃上一道斜高光：平涂的玻璃没有"这是一层薄东西"的读法
  ctx.save();
  ctx.beginPath();
  ctx.rect(glassX, glassY, glassW, glassH);
  ctx.clip();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(glassX - glassW * 0.1, glassY + glassH * 0.75);
  ctx.lineTo(glassX + glassW * 0.55, glassY - glassH * 0.05);
  ctx.lineTo(glassX + glassW * 0.85, glassY - glassH * 0.05);
  ctx.lineTo(glassX + glassW * 0.2, glassY + glassH * 0.75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;

  // ---- 组子：细木条编的格。和风浓度基本由它决定 ----
  //
  // 条宽 4% 不是随手定的：低于 3% 时即使有 mipmap，远处也会先糊成
  // 一片灰再淡出，格子就没了。宁可比真实的组子粗一点，也要在
  // 玩家常待的距离上看得见"格"。
  const bar = Math.max(3, Math.round(w * 0.04));
  ctx.fillStyle = PALETTE.woodDark;
  for (let i = 1; i <= config.columns; i += 1) {
    const x = glassX + (glassW * i) / (config.columns + 1) - bar / 2;
    ctx.fillRect(x, glassY, bar, glassH);
  }
  for (let i = 1; i <= config.rows; i += 1) {
    const y = glassY + (glassH * i) / (config.rows + 1) - bar / 2;
    ctx.fillRect(glassX, y, glassW, bar);
  }

  // ---- 引手：引き戸没有球形把手，是嵌在框里的一个竖凹槽 ----
  const pullW = Math.round(w * 0.05);
  const pullH = Math.round(h * 0.1);
  const pullX =
    config.pullSide === "right" ? w - stile - pullW * 1.6 : stile + pullW * 0.6;
  const pullY = Math.round(skirtTop * 0.62);
  ctx.fillStyle = PALETTE.brass ?? "#c9a35c";
  ctx.fillRect(pullX, pullY, pullW, pullH);
  ctx.fillStyle = "#00000055";
  ctx.fillRect(pullX + pullW * 0.28, pullY + pullH * 0.12, pullW * 0.44, pullH * 0.76);
}

/**
 * 取一张引き戸贴图（按配置缓存）。同一扇门的两面、两扇门的两片
 * 共用同一份——`aspect` 相同就是同一张图。
 */
export function shojiTexture(config: ShojiConfig): CanvasTexture {
  const key = `${config.aspect.toFixed(3)}|${config.columns}|${config.rows}|${config.pullSide}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const canvas = document.createElement("canvas");
  canvas.height = TEXTURE_HEIGHT;
  canvas.width = Math.max(8, Math.round(TEXTURE_HEIGHT * config.aspect));
  paint(canvas, config);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  /*
   * **mipmap 必须开**。组子只有几像素宽，门稍微离远一点或者斜着看，
   * 一个屏幕像素就要盖住贴图上好几条线——没有 mipmap 时 GPU 只能
   * 抓其中一个像素，抓到哪条线随位置跳变，屏幕上就是一层爬动的斜纹。
   * 第一版关掉 mipmap 时看着像"z-fighting 还没修干净"，其实是这个。
   *
   * 各向异性再补一手：门几乎总是斜着看的，斜看时 mipmap 会糊掉一个
   * 方向上的细节，anisotropy 把那个方向的采样数补回来。
   */
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;

  cache.set(key, texture);
  return texture;
}
