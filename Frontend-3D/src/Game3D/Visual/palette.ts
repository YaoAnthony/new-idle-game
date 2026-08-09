import { Color } from "three";

/**
 * 共享色板。低多边形平面着色不用贴图，所有质感来自色块本身，
 * 所以颜色集中管理，避免各处硬编码出一堆不协调的色值。
 */
export const PALETTE = {
  // ---- 房间外壳（2026-07-30 明度大改） ----
  //
  // 原来整张色板挤在中暗棕一条窄带里，棕墙配棕地配棕家具，
  // 形状之间没有明度差，看什么都糊成一团。参考做法（樱花道口那类
  // 低多边形日系场景）：**六成画面是高明度低饱和**，饱和色只当点缀。
  // 所以墙提到奶白、地板提到蜂蜜色，深棕从"底色"降级成"点缀"——
  // 梁、踢脚、家具的深色因此才开始起"勾形"的作用。
  floorWood: "#c09a6a",
  floorWoodAlt: "#b48f5f",
  floorWoodWarm: "#c9a271",

  wall: "#ece1cb",
  wallAlt: "#e4d8bf",
  wallShade: "#cdbda0",
  wallTrim: "#6b4a30",

  // ---- 房子的外皮（V0.13 起从外面也看得到房子） ----
  //
  // 外墙比内墙深一档：同一面墙的里外若同色，淡出外皮看进屋时
  // 两层会糊成一片，分不清"看穿了"还是"没看穿"。
  // 屋顶是**烟熏瓦的蓝灰**——奶油墙 + 深木饰带 + 蓝灰瓦是
  // 日式小屋的标准三件套，也和 OutdoorScene 的樱花/河面呼应。
  extWall: "#e0d2b6",
  extWallShade: "#c2ae8e",
  roofTile: "#6d7480",
  roofTileAlt: "#7d8592",
  roofRidge: "#555b66",
  foundation: "#8d8478",

  // ---- 檐底与缘侧（V0.13）：整栋房子最抓眼的一块 ----
  //
  // 参考图里最好看的不是屋顶是**檐底那片暖木色**。查到的说法：
  // 「垂木を見せる方が和風の色合いが強くなります」——露椽子的檐底
  // 和风浓度最高。所以檐里不做成深棕的"阴影"，做成暖木色的"天花板"，
  // 椽子比它深一档压出条纹，抬头看才有东西看。
  eaveSoffit: "#c9a978",
  eaveSoffitAlt: "#bd9c6c",
  rafter: "#7d5636",
  /** 缘侧木板：比室内地板更晒、更灰，它在外面淋了几年雨 */
  deckPlank: "#b39268",
  deckPlankAlt: "#a5855d",
  deckEdge: "#6b4a30",
  /** 沓脱石：踩着上下缘侧的那块石头 */
  steppingStone: "#7e7a72",

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

  // ---- 舒舒（岩绒巨猫）：照着蓝灰龙猫的毛色配的 ----
  // 灰里压一点薰衣草紫，纯灰会像石雕；肚皮奶油白是"绒"的关键——
  // 深浅两层毛色的交界线本身就在画蓬松感
  shuFur: "#a8a4bf",
  shuMantle: "#8d89a8",
  shuFace: "#cbc8da",
  shuCream: "#f2eee6",
  shuInnerEar: "#dfa9b4",
  shuNose: "#b28494",
  shuClosedEye: "#5b5568",
  mossSeed: "#2c3524",

  foamBody: "#8fc4d4",
  foamLight: "#b6dde8",
  foamCore: "#e8f7fb",
  foamDeep: "#3f6f80",

  emberShell: "#8d8478",
  emberShellLight: "#a89e90",
  emberCrack: "#ff8a45",
  emberGlow: "#ffc98a",

  /**
   * 描边色。原来是暖白粗边（#fdf6e8 + 放大 1.045），在暗棕房间里
   * 整屋像发光线框。底色提亮之后描边反转：**深棕细线**，
   * 轮廓像插画的勾线，而不是霓虹灯。粗细在 Outline.ts。
   */
  outline: "#5b4332",

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

  // ---- 每日任务机（V0.11）：全屋唯一一件"机器感"家具 ----
  //
  // 配色刻意和 HUD 的奶油马卡龙皮肤同源（cream/peach/butter/mint），
  // 因为它就是那条顶部进度条在世界里的实体——看到机器想到进度条，
  // 靠的是同一组颜色在两处出现。木质基座和黑板绿把它按回房间的
  // 暖木语境里，不至于像一台闯进民宿的售货机。
  boardCream: "#fbf3e2",
  boardCreamShade: "#efe3cc",
  boardPeach: "#f2907a",
  boardPeachLight: "#ffb9a3",
  boardButter: "#f4b942",
  boardMint: "#a9e0d1",
  boardSlate: "#5d7264",
  boardSlateDark: "#4c5f53",
  boardPaper: "#fffdf6",
  boardPencil: "#e8b23c",

  stoneWarm: "#a89a89",
  stoneWarmDark: "#8d8071",
  hearthDark: "#3a3230",
  emberOrange: "#ff9d3d",
  emberYellow: "#ffd27a",

  brass: "#c9a35c",
  lampGlow: "#ffe6b0",

  // ---- 唱片机（V0.12）。照着老式号角留声机的实物配：
  //      红橡木柜体 + 镍银机件 + 黄铜大喇叭 + 黑胶红标 ----
  gramOak: "#7c4a2a",
  gramOakLight: "#985f38",
  gramOakPanel: "#5e381f",
  gramFelt: "#4e6b52",
  gramNickel: "#b9bcc2",
  gramNickelDark: "#878b92",
  gramVinyl: "#211e23",
  gramVinylSheen: "#312d35",
  gramLabelRed: "#b8452f",
  gramLabelCream: "#ecdcb8",
  gramBrassBright: "#dcb96e",
  gramBrassDeep: "#a87f3e",
  gramHornBlack: "#2b2726",

  waterBlue: "#7fb2c4",

  // ---- 分区地板（2LDK）。玄关是土间的青灰瓦——踩进屋第一脚
  //      和木地板拉开材质差，"进了门再上一步台阶"的日式秩序感靠它；
  //      洗手间是冷调瓷砖，全屋唯一的冷色地面 ----
  genkanTile: "#9a9184",
  genkanTileAlt: "#8f8679",
  bathTile: "#cfd9d5",
  bathTileAlt: "#c3cfca",

  // ---- 天花板（镜头锁进屋内后可见）。跟着墙一起提亮，
  //      深色只留给横梁——梁在浅顶上才勾得出屋子的结构感 ----
  ceilingWood: "#d9c8a8",
  ceilingWoodAlt: "#d0be9d",
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

  /**
   * 查不到视觉配方时的兜底色。
   *
   * 刻意选中性灰而不是洋红：这东西会**出现在玩家面前**，不是只给开发看的。
   * 洋红块在一屋子暖色低多边形里像个 bug 弹窗；灰块只是"还没做好的东西"，
   * 玩家看一眼就过去了。真正告诉开发的是控制台那条点名。
   */
  placeholder: "#9c968c",

  // ---- 材料。木头系一律复用 woodDark/Mid/Light，这里只补它们没有的 ----
  paperCream: "#f2ecda",
  paperShade: "#ded5be",
  leatherTan: "#a9764a",
  leatherTanDark: "#87552f",
  graphiteGrey: "#4a4952",
  caneGreen: "#8fa855",
  caneNode: "#c6bd7c",
  rootFlesh: "#d8c391",

  /**
   * ---- 食材与成品菜 ----
   *
   * 这些色值原来是 `recipes/cookware.ts` 里一张 itemId → 颜色的表，
   * 和模型分开放着——于是"番茄的颜色"和"番茄长什么样"是两条独立的数据，
   * 迟早会对不上（改了模型忘了改色，或者反过来）。
   *
   * 现在颜色只喂给模型，别处要用主色一律**从模型里取**（dominantColor）。
   * 放进色板是因为整套画风的颜色本来就集中管理，食材没理由例外。
   */
  tomatoRed: "#d0483a",
  eggShell: "#f2e6c2",
  eggYolk: "#f6d878",
  friedTomatoEgg: "#e07a4a",
  riceRaw: "#f4f0e4",
  riceCooked: "#fbf8ef",
  pepperGreen: "#6f9e4c",
  porkPink: "#c98a86",
  centuryEgg: "#4a4258",
  cabbageLeaf: "#bcd08a",
  cabbageSoup: "#d8e0a8",
  pepperPork: "#a8703f",
  cheeseYellow: "#f0c04c",
  /** 乱炖：几样东西混出来的浑色，刻意调得"说不清是什么" */
  stewMurk: "#8a6b47",
  stewMurkLight: "#a2825b",
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
