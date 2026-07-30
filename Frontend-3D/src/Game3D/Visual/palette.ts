import { Color } from "three";

/**
 * 共享色板。低多边形平面着色不用贴图，所有质感来自色块本身，
 * 所以颜色集中管理，避免各处硬编码出一堆不协调的色值。
 */
export const PALETTE = {
  floorWood: "#8a5f3c",
  floorWoodAlt: "#7d5433",
  floorWoodWarm: "#946741",

  wall: "#c8a878",
  wallAlt: "#bf9f6f",
  wallShade: "#a9895e",
  wallTrim: "#6b4a30",

  woodDark: "#5f4127",
  woodMid: "#8a5f3c",
  woodLight: "#a97c4c",

  stoveBody: "#4a4a52",
  stoveTop: "#35353c",
  stoveFire: "#ff9d3d",
  stoveHandle: "#c8a878",

  cardboard: "#b98b58",
  cardboardAlt: "#a87b4b",
  cardboardTape: "#d8c39a",

  petFur: "#9aa0ad",
  petFurLight: "#b6bcc7",
  petInner: "#e0b7bb",
  petEye: "#241d1a",

  // ---- 元素凝聚体：三只都用"外壳深 + 芯浅"的两层配色，
  //      这样它们一眼能看出是同一类东西，只是长在不同地方 ----
  mossBody: "#6f8f5a",
  mossLight: "#8bab72",
  mossSprout: "#b9d18a",
  mossSeed: "#2c3524",

  foamBody: "#8fc4d4",
  foamLight: "#b6dde8",
  foamCore: "#e8f7fb",
  foamDeep: "#3f6f80",

  emberShell: "#8d8478",
  emberShellLight: "#a89e90",
  emberCrack: "#ff8a45",
  emberGlow: "#ffc98a",

  outline: "#fdf6e8",

  // ---- 家具扩充用的低饱和暖色 ----
  fabricCream: "#ede1c4",
  fabricRose: "#c98d80",
  fabricSage: "#9aab7e",
  fabricTeal: "#7e9e97",

  bookRust: "#b06a4f",
  bookOlive: "#8b9158",
  bookDenim: "#6f8398",
  bookSand: "#d3b380",

  terracotta: "#bc7a55",
  terracottaDark: "#a56746",
  soil: "#4f3a28",
  leafGreen: "#7d9c5b",
  leafGreenDark: "#66854b",

  stoneWarm: "#a89a89",
  stoneWarmDark: "#8d8071",
  hearthDark: "#3a3230",
  emberOrange: "#ff9d3d",
  emberYellow: "#ffd27a",

  brass: "#c9a35c",
  lampGlow: "#ffe6b0",

  waterBlue: "#7fb2c4",
  sandPale: "#dcc79a",
  fishOrange: "#e08a4e",

  // ---- 天花板（镜头锁进屋内后可见） ----
  ceilingWood: "#a1794f",
  ceilingWoodAlt: "#967049",
  ceilingBeam: "#6b4a30",

  // ---- 铺地扩充：地毯与大件家具 ----
  rugRust: "#b3745c",
  rugRustDark: "#9c6350",
  rugTrim: "#e0c9a2",
  strawMat: "#cbb076",
  strawMatAlt: "#bda067",
  matGrey: "#6e6a63",
  sofaFabric: "#8f9d84",
  sofaFabricDark: "#7b8971",

  // ---- 厨具：铸铁 + 陶瓷 + 木柄 ----
  ironDark: "#3c3a3d",
  ironMid: "#55535a",
  ironLight: "#6d6a73",
  /** 锅内壁。比外壁深，让人能看出锅是空心的 */
  potInner: "#2a2729",
  ceramicWhite: "#efe7d8",
  ceramicShade: "#d9cebb",
  handleWood: "#7a5433",

  // ---- 火候进度环四色（白 → 绿 → 黄 → 红） ----
  heatRaw: "#f2ece0",
  heatUndercooked: "#8bc34a",
  heatPerfect: "#f2c14b",
  heatOvercooked: "#c0392b",
} as const;

export type PaletteKey = keyof typeof PALETTE;

const cache = new Map<string, Color>();

export function color(value: string): Color {
  const existing = cache.get(value);
  if (existing) return existing;

  const created = new Color(value);
  cache.set(value, created);
  return created;
}

/**
 * 在基色附近做确定性抖动，用于地板/墙面分块。
 * 同一个 (x, y) 永远得到同一个偏移，重新加载场景不会闪。
 */
export function jitterShade(base: string, x: number, y: number, amount = 0.04): Color {
  const noise = ((x * 73856093) ^ (y * 19349663)) % 1000;
  const normalized = (noise / 1000) * 2 - 1;

  const shifted = color(base).clone();
  shifted.offsetHSL(0, 0, normalized * amount);
  return shifted;
}
