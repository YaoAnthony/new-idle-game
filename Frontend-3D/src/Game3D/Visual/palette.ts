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
  /** 沓脱石 / 踏み石：上下缘侧和进门的那些石头 */
  steppingStone: "#7e7a72",
  /** 玄关灯的纸罩。白天也要比周围亮一档，它是"这儿是入口"的信号 */
  lanternPaper: "#f6e6bd",
  /** 玄关引き戸的毛玻璃：透光不透形，屋里的暖色透出来一点 */
  doorGlass: "#e8e2d2",

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

  /* ---- 水獭商人（期 3）：**九个色号全部从用户给的参考图采样** ----
   *
   * 不借最接近的现成色号（那条规矩踩过）——这只是全新一支，
   * 配色本身就是他的辨识度：暖棕的毛 + 奶白的脸腹 + 一条绿围巾
   * + 一件靛蓝背心，全身唯一的高饱和是油灯那点橙黄。
   *
   * 参考图里给的十六进制原样搬过来，一个数字都没改。
   */
  otterFur: "#a47a52",       // 主毛色（参考图 A47A52）
  otterFurDeep: "#5c422f",   // 深棕：背脊、四肢、尾巴（5C422F）
  otterCream: "#ead9b8",     // 脸罩 + 肚皮 + 帆布高光（EAD9B8）
  otterScarf: "#6fa37a",     // 围巾 + 卷起的毯子（6FA37A）
  otterVest: "#3f6e8c",      // 背心（3F6E8C）
  otterVestShade: "#5e7a8e", // 背心暗面 / 边饰（5E7A8E）
  otterCanvas: "#d7c39b",    // 背包帆布（D7C39B）
  otterBrass: "#e1a856",     // 油灯的光、扣件（E1A856）
  otterLeather: "#804e2d",   // 皮带、背带（804E2D）

  /* ---- 史莱姆「咕噜」（期 4 的居民）：**从用户参考图采样** ----
   *
   * 设计稿上「配色方案」那一栏给了六个 hex，**一个数字都没改**。
   * 设定是水系、软萌治愈；材质那一栏写明"半透明果冻质感、内部有气泡、
   * 边缘透亮、颜色从顶部浅到底部稍深"——所以这六个不是随便六个蓝，
   * 是一条**从顶到底的渐变**，`recipes/slime.ts` 按高度插值用它们。
   *
   * 脸上那三样（眼、嘴、腮红）设计稿的色块栏里没给，是**对着原画取的
   * 近似值**——和小龙那批同一个路数，采样对象是图本身，不是借现成色号。
   */
  slimeTop: "#8EE6FF",       // 顶部最浅（8EE6FF）
  slimeBody: "#4CCBFF",      // 主色（4CCBFF）
  slimeDeep: "#77D8EB",      // 底部稍深的青（77D8EB）
  slimePale: "#BCEBFF",      // 淡：气泡、内层（BCEBFF）
  slimeMist: "#E6F6FF",      // 最淡：高光、雾面（E6F6FF）
  slimeGlow: "#FFFFFF",      // 高光纯白（FFFFFF）
  slimeEye: "#26324f",       // 眼珠：深藏青（取自原画，稿上未标）
  slimeBlush: "#f2a8b4",     // 腮红：淡粉（取自原画，稿上未标）
  slimeMouth: "#e2647c",     // 嘴：珊瑚粉（取自原画，稿上未标）

  /* ---- 狐狸「阿茜」（期 4 的居民）：**从用户设计稿采样** ----
   *
   * 稿子「配色方案」那一栏给了六个 hex，**一个数字都没改**。
   * 设定关键词是"可爱·沙雕·夸张·易读·低复杂度"——注意**易读**那一条：
   * 只有六个色，而且分区明确（橙身 / 奶油肚 / 深棕四肢 / 黑棕鼻），
   * 这不是省事，是稿子里「UV友好：颜色分区明确」那条要求的结果。
   */
  foxOrange: "#FF8A21",      // 主色 橙（FF8A21）
  foxOrangeLight: "#FFC88A", // 辅色 浅橙：内耳、尾巴过渡（FFC88A）
  foxCream: "#FFE7C9",       // 毛色 奶油白：肚子、吻部、尾尖（FFE7C9）
  foxBrown: "#5A3A24",       // 细节 深棕：耳尖、手脚、眉毛（5A3A24）
  foxNose: "#2E1F16",        // 鼻子 黑棕（2E1F16）
  foxTongue: "#FF6B6B",      // 舌头 粉红（FF6B6B）

  /* ---- 精灵「薇尔」（期 4 的居民）：**从用户设计稿采样** ----
   *
   * 这张稿的「配色方案」只给了色块**没标 hex**，所以这批是对着色块取的
   * 近似值（同小龙那批的路数）。分三档：主色（深橄榄绿 / 棕 / 灰）、
   * 辅色（土黄 / 卡其 / 石板蓝）、点缀色（草绿 / 青 / 米）。
   *
   * 设定要接上用户 2026-08-24 定的那条：**尖耳朵人形，像个小人，
   * 不是 wisp 那一支**。稿子给的是个游侠——兜帽斗篷 + 单边护肩 + 皮带
   * 挂包 + 长靴，头身比 1:4，600~800 面。
   */
  elfCloak: "#5d6b45",       // 斗篷主色：深橄榄绿
  elfCloakDeep: "#3f4a30",   // 斗篷暗面 / 兜帽内
  elfLeather: "#7a5638",     // 皮带、挂包、靴子
  elfLeatherDeep: "#5a3f28", // 皮件暗面
  elfArmor: "#9aa0a6",       // 护肩金属：冷灰
  elfArmorLight: "#c3c8cc",  // 金属高光面
  elfHair: "#d8d3c6",        // 银灰发
  elfSkin: "#f0d3b4",        // 肤色
  elfTrouser: "#3c4351",     // 裤子：石板蓝
  elfEye: "#4a8fb5",         // 蓝眼睛
  elfTrim: "#c9b98a",        // 点缀：米色叶徽、镶边

  /* ---- 家具小店（期 5）：**从用户设计稿采样** ----
   *
   * 稿子的「配色参考」和「材质参考」两栏给的是色块没标 hex，这批是对着
   * 图取的近似值。设定：可爱 / 低多边形，6×6 格，绿瓦顶 + 奶油灰泥墙 +
   * 木框架 + 橙白条纹雨棚，门口一块展示区。
   */
  shopWood: "#8a6039",       // 木框架、门、招牌底
  shopWoodDeep: "#5f4126",   // 木料暗面、栅栏
  shopRoof: "#7d9a52",       // 绿瓦
  shopRoofDeep: "#5e7a3c",   // 瓦的暗面
  shopWall: "#efe4d0",       // 灰泥墙
  shopStone: "#b9b3a6",      // 石阶、烟囱、地基
  shopAwning: "#d9762f",     // 雨棚的橙条
  shopAwningLight: "#f2e3c8", // 雨棚的白条
  shopSign: "#d8b478",       // 招牌面板
  shopBlue: "#7b93a8",       // 蓝布：坐垫、小黑板边

  /* ---- 1 级餐厅（期 8）：**从用户设计稿采样** ----
   *
   * 稿子的「配色参考」八格 +「材质参考」六格都**没标 hex**，这批是对着
   * 图取的近似值。设定：暖心 / 乡村餐馆，木石为主材，配布帘、招牌与
   * 暖色灯光。
   *
   * **不复用小店那一套。** 两者的绿瓦和木料乍看很近，但餐厅整体更暖更沉
   * （苔绿瓦、米黄砌石、赤陶条纹），小店偏清爽（黄绿瓦、奶白灰泥、
   * 亮橙条纹）。借最接近的色号顶上会让两栋楼在同一个院子里糊成一栋。
   */
  dinerRoof: "#6b8a4b",       // 苔绿瓦
  dinerRoofDeep: "#4e6a37",   // 瓦的暗面、屋脊
  dinerWall: "#e3d5b8",       // 米黄砌石墙
  dinerWallCourse: "#d2c1a1", // 墙上的横向砌缝
  dinerWood: "#8b6440",       // 木构架、门框、桌椅
  dinerWoodDeep: "#5c4028",   // 木料暗面、栅栏、梁
  dinerStone: "#9a968c",      // 石基座、烟囱
  dinerStoneDeep: "#7d7970",  // 石缝、灶膛
  dinerAwning: "#c9713e",     // 遮阳篷的赤陶条
  dinerAwningLight: "#f0e3c9",// 遮阳篷的米白条
  dinerSign: "#c9a877",       // 招牌木牌面
  dinerSlate: "#3d4440",      // MENU 黑板
  dinerIron: "#4c4a45",       // 铁艺挑臂、锅、灶具
  dinerLamp: "#f2c46a",       // 灯笼与吊灯的暖光
  dinerSoup: "#d9924a",       // 锅里的汤
  dinerBread: "#cf9a58",      // 面包
  dinerTomato: "#c2513c",     // 番茄
  dinerLeaf: "#6f9350",       // 花箱的叶子
  dinerBloom: "#e8c45c",      // 花箱的花

  /* ---- 旅行商人「小鱼人」（期 6）：**从用户设计稿采样** ----
   *
   * 稿子「配色参考」给了八个色块**没标 hex**，这批是对着图取的近似值。
   * 设定：鱼人族，乐观友善好奇，**拖着一辆浮筏车在水边卖各种实用好物**。
   *
   * 和水獭的分工要在配色上就拉开：水獭是暖棕 + 奶白的陆生毛皮，
   * 这只是**青蓝 + 橙鳍**的水生鳞皮。一暖一冷，远远看一眼就知道来的是谁。
   */
  fishBody: "#4a7f96",       // 身体主色：青蓝
  fishBodyDeep: "#37637a",   // 暗面 / 背鳍
  fishBelly: "#cfe0e2",      // 肚皮：极浅的水蓝白
  fishFin: "#e08a4a",        // 鳍：橙（头两侧和尾巴，全身唯一的暖色）
  fishCap: "#c9b48a",        // 帽子：土黄
  fishScarf: "#5c8fa3",      // 围巾 / 领子
  fishCheek: "#e8a08c",      // 腮红

  /* 浮筏车。木料比水獭那套稍冷一点——它常年泡水 */
  raftWood: "#8a6a45",       // 甲板、立柱
  raftWoodDeep: "#5d472e",   // 浮桶、暗面
  raftCanvas: "#7ba8ac",     // 防水布蓬：青灰
  raftRope: "#c9b48a",       // 绑绳、渔网
  raftLantern: "#f2c56b",    // 灯笼的光

  /* ---- 小龙「青涟」（期 3 的贼）：**从用户参考图采样** ----
   *
   * 这张图和水獭那张不同，**没标 hex**（五个色块没写数字），所以这批是
   * 对着图上的色块和原画取的近似值——采样的对象是参考图本身，
   * 不是借现成色板。设定：灵渊小龙、幼年期、鳞片细小光滑有水波光泽、
   * 幼年龙角半透明、翅膀骨架轻盈膜薄。
   */
  dragonBody: "#cfe3d9",     // 身体主色：极浅的青瓷绿
  dragonBelly: "#efe9d8",    // 腹部：奶油白（和原画的肚皮鳞带一致）
  dragonMane: "#a8c9ad",     // 鬃毛/背鳍：浅草绿
  dragonManeDeep: "#7fa98c", // 鬃毛暗层
  dragonHorn: "#c9b98f",     // 幼年角：半透明的暖茶色
  dragonEye: "#4f8d80",      // 瞳色如深潭的青
  dragonWing: "#dcebe2",     // 翅膜：近白的粉青（材质上再给透明度）
  dragonShade: "#9db5a7",    // 鳞片阴影的灰绿
  dragonDark: "#5c7466",     // 爪尖、鼻头（比 shade 再深一档，五官要立得住）

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
  /** 富贵竹的竿：比叶子黄一点、亮一点的嫩绿；节是一圈偏黄的浅色 */
  bambooStalk: "#8fb063",
  bambooNode: "#c9c58a",
  /** 盆口铺的小石子 */
  pebble: "#b9b2a6",

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

  // ---- 据点庄园（2026-08-10，色值从概念图参考条采样，见
  //      gpt设计稿/据点箱庭设计稿.md §7a）。石材一族比 foundation
  //      暖一档——墙要"接住"暖木老宅，不能让宅子孤立在冷灰墙里 ----
  baseStone: "#9d8f74",
  baseStoneDark: "#7c7159",
  baseStoneMoss: "#8a8160",
  pavingLight: "#b49b70",
  pavingMid: "#ab9168",
  pavingJoint: "#95875f",
  plotSoil: "#6a5138",
  flowerViolet: "#8b84b8",
  hearthDark: "#3a3230",
  emberOrange: "#ff9d3d",
  emberYellow: "#ffd27a",

  brass: "#c9a35c",
  lampGlow: "#ffe6b0",
  /**
   * 暖光的深一档（2026-08-23，桌灯三件套）。用在**发光体自己的暗部**：
   * 月牙旁的小星星、云朵灯垂下的雨珠——它们要比主光源暗一档，
   * 否则三块一样亮的面挤在一起，谁也不是主角。
   *
   * 不复用 fabricCream：那是布的色，偏灰偏绿，贴在 lampGlow 旁边显脏。
   * 发光体的暗部必须还留在光的色相里，只压明度不动色相。
   */
  lampGlowDeep: "#f7cf8b",

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

  // ---- 金库（2026-08-23）。色值**直接从用户给的参考图上采样**：
  //      深板岩的台基与箱体 + 暖棕的木作 + 高饱和的金，三块颜色互相拉开。
  //
  //      第一版是从现成色板里借的（屋顶的 roofTile 当石、留声机的
  //      gramBrassBright 当金），"不新增配色"听着像纪律，摆出来却和参考图
  //      完全不是一个东西——借来的冷灰偏蓝像塑料，借来的黄铜偏灰堆在币旁边
  //      像发霉。**参考图给了具体颜色时，采样比复用重要**：复用是为了让新东西
  //      落进已有的调子，可这一族本来就是要跳出来的那一件。
  vaultStone: "#4b535d",
  vaultStoneDark: "#3a4149",
  vaultDeck: "#9a6d3d",
  vaultDeckAlt: "#89602f",
  vaultFence: "#8d6132",
  vaultChest: "#3b424a",
  /** 箱体的迎光面 / 柱头的铁箍：比箱身亮一档，同一支板岩 */
  vaultChestLit: "#4b545d",
  vaultGold: "#e0a527",
  vaultCoin: "#f2c02c",

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
 *
 * ## `>>> 0` 不是装饰（2026-08-22 修）
 *
 * 原来是 `((x * A) ^ (y * B)) % 1000`。两个坑叠在一起：
 * `^` 走 ToInt32，**结果可以是负数**；而 JS 的 `%` 保留被除数的符号。
 * 于是 `noise` 落在 (−1000, 1000) 而不是 [0, 1000)，
 * `normalized` 跟着落在 **(−3, 1)** 而不是 [−1, 1)——抖动量最多能到
 * 声明值的三倍，而且只往暗的一边偏。
 *
 * 后果不是"颜色略有不同"，是**整块变黑**：金币罐 l3 那三只罐里有两只的
 * 罐身被压成 `#020100`（基色 `#8a5f3c`），看着像模型破了个洞。墙面也中招，
 * 只是格号小、还没撞上最坏的那几个数。
 *
 * `>>> 0` 把 int32 读成 uint32，`% 1000` 这才真的落在 [0, 999]。
 * **修完所有分块的颜色都会重新随机一遍**（同一个格子仍然稳定），
 * 这是预期的：它们本来就该在基色 ±amount 里，只是以前有些跑出去了。
 */
export function jitterShade(base: string, x: number, y: number, amount = 0.04): Color {
  const noise = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000;
  const normalized = (noise / 1000) * 2 - 1;

  const shifted = color(base).clone();
  shifted.offsetHSL(0, 0, normalized * amount);
  return shifted;
}
