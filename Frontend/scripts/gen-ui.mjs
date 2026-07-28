// 程序化生成像素 UI 素材（木质按钮 / 羊皮纸面板 / 焦点箭头 / 滑条旋钮）。
// 运行: node scripts/gen-ui.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pngjs from "pngjs";

const { PNG } = pngjs;
const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/Assets/ui",
);

function hex(c) {
  return [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
    255,
  ];
}

class Art {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.png = new PNG({ width: w, height: h });
  }
  px(x, y, color) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (this.w * y + x) << 2;
    const [r, g, b, a] = hex(color);
    this.png.data[i] = r;
    this.png.data[i + 1] = g;
    this.png.data[i + 2] = b;
    this.png.data[i + 3] = a;
  }
  save(name) {
    fs.writeFileSync(path.join(OUT, name), PNG.sync.write(this.png));
    console.log("wrote", name);
  }
}

// 由外向内逐层填充圆角矩形；cut 控制该层四角的像素级圆角切角。
function fillRounded(a, inset, color, cut = 0) {
  const x0 = inset;
  const y0 = inset;
  const x1 = a.w - 1 - inset;
  const y1 = a.h - 1 - inset;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = Math.min(x - x0, x1 - x);
      const dy = Math.min(y - y0, y1 - y);
      if (dx + dy < cut) continue;
      a.px(x, y, color);
    }
  }
}

// 在某一 inset 层的底边和右边重涂阴影色（左上受光）。
function shadeRing(a, inset, color) {
  const x1 = a.w - 1 - inset;
  const y1 = a.h - 1 - inset;
  for (let x = inset + 1; x <= x1; x++) a.px(x, y1, color);
  for (let y = inset + 1; y <= y1; y++) a.px(x1, y, color);
}

// 木纹抖动：只影响当前为 baseColor 的像素，确定性伪随机。
function grain(a, region, baseColor, darker, lighter) {
  const base = hex(baseColor);
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const i = (a.w * y + x) << 2;
      if (
        a.png.data[i] !== base[0] ||
        a.png.data[i + 1] !== base[1] ||
        a.png.data[i + 2] !== base[2] ||
        a.png.data[i + 3] !== 255
      )
        continue;
      if (!region(x, y)) continue;
      const n = (x * 31 + y * 17) % 13;
      if (n === 0) a.px(x, y, darker);
      else if (n === 7) a.px(x, y, lighter);
    }
  }
}

function nail(a, x, y, pal) {
  a.px(x, y, pal.goldLight);
  a.px(x + 1, y, pal.gold);
  a.px(x, y + 1, pal.gold);
  a.px(x + 1, y + 1, pal.goldDark);
}

// ---- 按钮 18x18, slice 6（显示 border-width 12px = 2x 缩放） ----
function button(pal, name) {
  const a = new Art(18, 18);
  fillRounded(a, 0, pal.outline, 2);
  fillRounded(a, 1, pal.bevelLight, 1);
  shadeRing(a, 1, pal.bevelDark);
  fillRounded(a, 2, pal.wood);
  grain(
    a,
    (x, y) => x >= 2 && y >= 2 && x <= 15 && y <= 15,
    pal.wood,
    pal.woodDark,
    pal.woodLight,
  );
  fillRounded(a, 4, pal.seam);
  fillRounded(a, 5, pal.faceEdgeTop);
  shadeRing(a, 5, pal.faceEdgeBottom);
  // 面板中心 6x6：上下渐变
  for (let y = 6; y <= 11; y++) {
    for (let x = 6; x <= 11; x++) {
      a.px(x, y, y <= 8 ? pal.faceTop : pal.faceBottom);
    }
  }
  nail(a, 2, 2, pal);
  nail(a, 14, 2, pal);
  nail(a, 2, 14, pal);
  nail(a, 14, 14, pal);
  a.save(name);
}

const buttonNormal = {
  outline: "#2e1c11",
  bevelLight: "#c9935a",
  bevelDark: "#5c3a22",
  wood: "#8f5f36",
  woodDark: "#7a4d2b",
  woodLight: "#a06c3e",
  seam: "#452a19",
  faceEdgeTop: "#f4e0ae",
  faceEdgeBottom: "#c2934e",
  faceTop: "#eccf93",
  faceBottom: "#dfb877",
  gold: "#e8c25c",
  goldLight: "#f6d97e",
  goldDark: "#b58a35",
};

const buttonHover = {
  ...buttonNormal,
  bevelLight: "#d8a468",
  wood: "#9c6a3d",
  woodDark: "#855634",
  woodLight: "#ad7847",
  faceEdgeTop: "#f9e9c0",
  faceEdgeBottom: "#cd9e58",
  faceTop: "#f4dca4",
  faceBottom: "#e8c485",
  gold: "#f2d06e",
  goldLight: "#ffe694",
};

const buttonPressed = {
  ...buttonNormal,
  bevelLight: "#5c3a22",
  bevelDark: "#c9935a",
  wood: "#7c5230",
  woodDark: "#684226",
  woodLight: "#8a5c36",
  faceEdgeTop: "#b8874a",
  faceEdgeBottom: "#e3c384",
  faceTop: "#cfa25b",
  faceBottom: "#dcb371",
  gold: "#d4ad4e",
  goldLight: "#e0bd62",
};

// 按下态受光反转：shadeRing 已按左上受光写死，这里生成后手动交换即可。
button(buttonNormal, "button-frame-normal.png");
button(buttonHover, "button-frame-hover.png");
button(buttonPressed, "button-frame-pressed.png");

// ---- 面板 30x30, slice 10（显示 border-width 20px = 2x） ----
{
  const pal = {
    outline: "#2e1c11",
    bevelLight: "#c9935a",
    bevelDark: "#5c3a22",
    wood: "#8f5f36",
    woodDark: "#7a4d2b",
    woodLight: "#a06c3e",
    seam: "#452a19",
    trim: "#c08c4f",
    parch: "#f0dfad",
    parchLight: "#f7ecc4",
    parchShade: "#dfc98f",
    gold: "#e8c25c",
    goldLight: "#f6d97e",
    goldDark: "#b58a35",
  };
  const a = new Art(30, 30);
  fillRounded(a, 0, pal.outline, 3);
  fillRounded(a, 1, pal.bevelLight, 1);
  shadeRing(a, 1, pal.bevelDark);
  fillRounded(a, 2, pal.wood);
  grain(
    a,
    (x, y) => x >= 2 && y >= 2 && x <= 27 && y <= 27,
    pal.wood,
    pal.woodDark,
    pal.woodLight,
  );
  fillRounded(a, 6, pal.seam);
  fillRounded(a, 7, pal.trim);
  fillRounded(a, 8, pal.parchShade);
  // 内侧高光：底边 + 右边提亮，形成纸面内凹
  {
    const x1 = 29 - 8;
    const y1 = 29 - 8;
    for (let x = 9; x <= x1; x++) a.px(x, y1, pal.parchLight);
    for (let y = 9; y <= y1; y++) a.px(x1, y, pal.parchLight);
  }
  fillRounded(a, 9, pal.parch);
  // 角落纸面斑点（仅角落非拉伸区）
  for (let y = 9; y < 13; y++) {
    for (let x = 9; x < 13; x++) {
      if ((x * 13 + y * 29) % 11 === 0) a.px(x, y, pal.parchShade);
    }
  }
  nail(a, 3, 3, pal);
  nail(a, 25, 3, pal);
  nail(a, 3, 25, pal);
  nail(a, 25, 25, pal);
  a.save("panel-frame.png");
}

// ---- 菜单焦点箭头 8x12 ----
{
  const a = new Art(8, 12);
  const fill = "#f4e0ae";
  const outline = "#2e1c11";
  for (let y = 0; y < 12; y++) {
    const extent = y < 6 ? y + 2 : 11 - y + 2;
    for (let x = 0; x < Math.min(extent, 8); x++) {
      a.px(x, y, fill);
    }
  }
  // 描边：每行最右像素 + 上下端
  for (let y = 0; y < 12; y++) {
    const extent = Math.min(y < 6 ? y + 2 : 11 - y + 2, 8);
    a.px(extent - 1, y, outline);
  }
  for (let x = 0; x < 2; x++) {
    a.px(x, 0, outline);
    a.px(x, 11, outline);
  }
  a.save("menu-arrow.png");
}

// ---- 滑条旋钮 10x14 ----
{
  const a = new Art(10, 14);
  fillRounded(a, 0, "#2e1c11", 2);
  fillRounded(a, 1, "#dfb877");
  for (let y = 1; y <= 12; y++) a.px(1, y, "#f0d494");
  for (let x = 1; x <= 8; x++) a.px(x, 12, "#b8874a");
  for (const gy of [4, 7, 10]) {
    for (let x = 3; x <= 6; x++) a.px(x, gy, "#c99a55");
  }
  a.save("range-knob.png");
}

console.log("done");
