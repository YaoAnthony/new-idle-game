import { dinerTuning } from "core";
import type { Object3D } from "three";
import { PALETTE } from "../Game3D/Visual/palette.js";
import { blob, box, cylinder, group } from "../Game3D/Visual/primitives.js";
import { buildInterior } from "./interiors.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 1 级餐厅（期 8）。**造型照用户 2026-08-25 的设计稿。**
 *
 * 稿子上定死的：暖心 / 乡村餐馆，木石为主材；苔绿瓦双坡顶 + 米黄砌石墙
 * + 木构架；正面赤陶白条纹遮阳篷、拱形门洞；一根冒烟的石烟囱；屋顶一扇
 * 阁楼小天窗；门口挂一块**汤碗吊招牌**、立一块 MENU 黑板；石台明外围一圈
 * 木栅栏、花箱、露天桌凳。
 *
 * ## 为什么叫 diner 不叫 restaurant
 *
 * `restaurant` 这个 buildingId **早就被占了**——小镇街上那家布景餐厅
 * （`restaurant.ts`，`interiorMapId: "shop-restaurant"`，换图进店）。
 * 两者除了都卖吃的以外没有任何关系：那家是逛的，这家是玩家自己的。
 * 我第一版直接覆盖了那个文件，是错的，已还原。
 *
 * ## 尺寸不照稿子那句「6×6 格」
 *
 * 稿子标的是 6×6，实际做 **9×7**。用户 2026-08-25 当场推翻了 6×6，
 * 理由成立而且有数：
 *
 * - 6×6 = 36 格²，**比 1 级房子（8×6 = 48 格²）还小**，而"起码和 1 级
 *   房子一样大"是他上一轮给餐厅定的下限。稿子那句是画稿时的示意，
 *   没按这套引擎的格子算过（这套引擎里墙不吃格子：`buildInterior` 的
 *   floorGrid 就等于 footprint，墙厚画在边界线上）。
 * - 内景装得下才行：灶台 2×2、出餐台 3×1、盘架 2×1、两组餐桌椅 4+4、
 *   三只箱桶 3、货架 2×1 = **22 格²**；加上厨房与用餐区之间一条 2 格
 *   横向通道、门口一条 2 格纵向通道、靠墙家具前各留 1 格站位，
 *   下限在 48–55 格²。
 * - 上限来自领地：空院子里逐格试 `previewPlacement`，7×7 只剩 39 个
 *   落点（z ∈ [−1,1]）、10×8 只剩 33 个。再深就基本没地方落。
 *
 * 9×7 = 63 格²落在"宽敞"档，宽 9 也够正面摆下遮阳篷 + 吊招牌 + 黑板。
 *
 * ## 户外那圈东西画在脚印外
 *
 * 石台明、栅栏、花箱、露天桌凳、MENU 黑板都**挑出脚印**当装饰
 * （用户 2026-08-25 选的）。不得不这样：门的位置写死在
 * `footprint.height / 2`（`placement.ts` 的 `buildingDoorAt`），
 * 所以**内景必须等于脚印**，做不出"脚印 11×9、屋子 9×7、中间一圈院子"。
 * 家具小店的地基本来就比脚印大 0.2，这里只是把那点悬挑做大。
 *
 * 代价说清楚：**露天桌和花箱没有碰撞**，人会从中间穿过去。想要真碰撞
 * 得把它们做成可摆放家具，那是另一件事。
 *
 * ## 屋脊方向和小店相反
 *
 * 小店的脊沿前后走（正面是整面山墙，招牌挂山墙上）。餐厅的脊**沿左右走**
 * ——稿子的正视图里屋顶上有一扇带小山墙的**阁楼天窗**，那只有在"前坡"
 * 存在时才成立；而它的招牌是从**转角挑臂**上吊下来的，不需要山墙。
 * 于是山墙落在左右两端，正面是一道长屋檐，遮阳篷正好挂在檐下。
 */

/** 一格多少米。和院子的格宽一致 */
const CELL = 1;

/**
 * 墙高。**里外必须是同一个数**（`buildInterior({ wallHeight })` 也喂它）。
 *
 * 3.4 比小店的 3 高一点：稿子里门是**拱形**的，拱顶要吃掉半米多，
 * 墙只有 3 的话拱肩会顶到屋檐。餐厅本来也该比杂货铺敞亮。
 */
const WALL_H = 3.4;

const WIDTH = 9;
const DEPTH = 7;

/**
 * 摆一棵子树。`group()` 只收 (name, children)，没有 options——
 * 位置只能建完再设，而 `Object3D.position` 是只读属性（`Object.assign`
 * 上去会静默失败，这个坑踩过），所以走 `.set()`。
 */
function placed(node: Object3D, x: number, y: number, z: number, rotY = 0): Object3D {
  node.position.set(x, y, z);
  node.rotation.y = rotY;
  return node;
}

/**
 * 双坡瓦顶。**坡向前后，屋脊沿左右方向走**（见文件头）。
 *
 * 和小店的 `tiledRoof` 是同一套做法转了 90°，没有抽公共函数：两边的
 * 瓦楞条数、出檐、脊高都跟着各自的稿子走，硬合并会得到一个七参数的
 * 函数，改一栋楼要先想清楚另一栋会不会被带歪。
 */
function tiledRoof(width: number, depth: number, ridgeY: number, eaveY: number): Object3D[] {
  const parts: Object3D[] = [];
  const rise = ridgeY - eaveY;
  const slopeDepth = Math.hypot(depth / 2, rise);
  const pitch = Math.atan2(rise, depth / 2);
  /** 出檐。稿子上屋檐挑得很出，阴影压在墙上才有"屋子"的重量 */
  const overhang = 0.5;
  const roofW = width + overhang * 2;

  for (const dir of [1, -1]) {
    // 绕 X 正向转会把 +z 压下去，所以前坡（dir=+1）用正角度
    parts.push(
      box([roofW, 0.13, slopeDepth], {
        position: [0, (ridgeY + eaveY) / 2, (dir * depth) / 4],
        rotation: [dir * pitch, 0, 0],
        color: PALETTE.dinerRoof,
      }),
    );
    /*
     * 瓦垄。**第一版做成 0.035 米的细线，渲出来根本看不见**——远看整片
     * 坡就是一块绿板。加粗到 0.14 并压深一档颜色之后才读得出"这是瓦"。
     * 五道而不是三道：坡变陡之后坡面变长，三道会显得稀。
     */
    for (const t of [0.1, 0.23, 0.36, 0.5, 0.64, 0.77, 0.9]) {
      parts.push(
        box([roofW, 0.05, 0.14], {
          position: [
            0,
            (ridgeY + eaveY) / 2 + (0.5 - t) * rise * 0.92 + 0.07,
            (dir * depth) / 4 + dir * (t - 0.5) * slopeDepth * 0.92 * Math.cos(pitch),
          ],
          rotation: [dir * pitch, 0, 0],
          color: PALETTE.dinerRoofDeep,
          castShadow: false,
        }),
      );
    }
    /*
     * 封檐板 + 椽头。稿子上屋檐下面能看到一排木头端头——**它们是
     * "这屋顶有厚度"的全部来源**，少了这一排，坡面就是一张贴在墙顶的纸。
     */
    const eaveZ = dir * (depth / 2 + overhang);
    parts.push(
      box([roofW, 0.2, 0.12], {
        position: [0, eaveY - 0.06, eaveZ],
        color: PALETTE.dinerWoodDeep,
      }),
    );
    for (let i = -4; i <= 4; i += 1) {
      parts.push(
        box([0.12, 0.12, 0.34], {
          position: [i * (width / 9), eaveY - 0.02, eaveZ - dir * 0.2],
          color: PALETTE.dinerWood,
          castShadow: false,
        }),
      );
    }
  }
  // 屋脊：沿左右方向，压一道厚脊瓦
  parts.push(
    box([roofW + 0.08, 0.16, 0.3], {
      position: [0, ridgeY + 0.04, 0],
      color: PALETTE.dinerRoofDeep,
    }),
  );
  return parts;
}

/**
 * 阁楼天窗。稿子的正视图里，前坡正中偏左凸出一个带小山墙的窗。
 *
 * 它不承担任何功能，纯粹是**"楼上有人住"的信号**——一整面光溜溜的瓦坡
 * 读起来像仓库，戳一个窗出来就成了住家开的馆子。
 */
function dormer(x: number, baseY: number, z: number): Object3D[] {
  const w = 1.25;
  const h = 0.95;
  return [
    box([w, h, 0.9], { position: [x, baseY + h / 2, z], color: PALETTE.dinerWall }),
    // 两片小坡顶
    ...[1, -1].map((dir) =>
      box([w + 0.22, 0.08, 0.72], {
        position: [x, baseY + h + 0.16, z + dir * 0.24],
        rotation: [dir * 0.62, 0, 0],
        color: PALETTE.dinerRoof,
      }),
    ),
    // 拱窗：一个方洞 + 顶上一颗压扁的球凑出圆拱，低模里够了
    box([0.52, 0.5, 0.06], {
      position: [x, baseY + 0.42, z + 0.46],
      color: PALETTE.dinerWood,
    }),
    blob(0.27, 0, {
      position: [x, baseY + 0.66, z + 0.46],
      scale: [1, 0.62, 0.22],
      color: PALETTE.dinerWood,
      castShadow: false,
    }),
    box([0.4, 0.4, 0.04], {
      position: [x, baseY + 0.42, z + 0.5],
      color: PALETTE.dinerLamp,
      castShadow: false,
    }),
  ];
}

/**
 * 一扇窗：**窗芯在里，四条框在外**。
 *
 * 第二版把框做成一整块木板压在墙上、再拿一块暖色板盖住中间——木板整个
 * 埋进了 0.16 厚的墙里，渲出来只剩一块凭空贴着的黄方块。改成四条边框
 * 各自挑出墙面 0.09，怎么看都是一扇窗。
 *
 * `axis` 说这扇窗开在哪个面上：法线朝 ±x 还是 ±z。
 */
function windowPanes(
  axis: "x" | "z",
  sign: number,
  face: number,
  cross: number,
  y: number,
  paneW: number,
  paneH: number,
): Object3D[] {
  const out: Object3D[] = [];
  const T = 0.09;
  const bar = 0.11;
  const put = (
    along: number,
    dy: number,
    lengthAlong: number,
    height: number,
    depth: number,
    color: string,
    shadow = true,
  ) => {
    const pos: [number, number, number] =
      axis === "x"
        ? [sign * face + sign * depth, y + dy, cross + along]
        : [cross + along, y + dy, sign * face + sign * depth];
    const size: [number, number, number] =
      axis === "x" ? [0.06, height, lengthAlong] : [lengthAlong, height, 0.06];
    out.push(box(size, { position: pos, color, castShadow: shadow }));
  };

  // 窗芯（暖光）压在墙外一点点，四条框再挑出去
  put(0, 0, paneW, paneH, 0.04, PALETTE.dinerLamp, false);
  put(0, paneH / 2 + bar / 2, paneW + bar * 2, bar, T, PALETTE.dinerWood);
  put(0, -paneH / 2 - bar / 2, paneW + bar * 2, bar, T, PALETTE.dinerWood);
  put(paneW / 2 + bar / 2, 0, bar, paneH, T, PALETTE.dinerWood);
  put(-paneW / 2 - bar / 2, 0, bar, paneH, T, PALETTE.dinerWood);
  // 中竖梃：一格玻璃太大，读起来像灯箱
  put(0, 0, 0.07, paneH, T - 0.02, PALETTE.dinerWood, false);
  // 窗台
  put(0, -paneH / 2 - bar, paneW + bar * 4, 0.1, T + 0.06, PALETTE.dinerWoodDeep, false);
  return out;
}

/** 侧墙的窗（法线朝 ±x） */
function sideWindow(sx: number, halfW: number, y: number, z: number): Object3D[] {
  return windowPanes("x", sx, halfW, z, y, 1.0, 1.0);
}

/** 背墙的窗（法线朝 −z） */
function backWindow(x: number, y: number, halfD: number): Object3D[] {
  return windowPanes("z", -1, halfD, x, y, 1.1, 1.0);
}

/** 正面右侧的窗 + 窗台上的花箱（法线朝 +z） */
function frontWindow(x: number, y: number, halfD: number): Object3D[] {
  return [
    ...windowPanes("z", 1, halfD, x, y, 1.0, 0.95),
    ...planterParts(x, y - 0.72, halfD + 0.22, 1.3),
  ];
}

/** 一株花：一撮叶子 + 三点花。花箱里重复用 */
function bloom(x: number, y: number, z: number): Object3D[] {
  return [
    blob(0.13, 0, { position: [x, y, z], scale: [1, 0.8, 1], color: PALETTE.dinerLeaf }),
    ...[-0.07, 0.0, 0.07].map((dx, i) =>
      blob(0.045, 0, {
        position: [x + dx, y + 0.1 + (i % 2) * 0.03, z + (i - 1) * 0.05],
        color: i === 1 ? PALETTE.dinerBloom : "#f2ede0",
        castShadow: false,
      }),
    ),
  ];
}

/**
 * 长条花箱的零件（不成组，直接给世界坐标）。窗台上那只要挂在半空，
 * 成组之后还得再算一层局部坐标，不如把高度也收进参数。
 */
function planterParts(x: number, y: number, z: number, length: number): Object3D[] {
  const count = Math.max(2, Math.round(length / 0.42));
  return [
    box([length, 0.3, 0.34], { position: [x, y + 0.15, z], color: PALETTE.dinerWood }),
    box([length + 0.06, 0.06, 0.4], {
      position: [x, y + 0.32, z],
      color: PALETTE.dinerWoodDeep,
      castShadow: false,
    }),
    ...Array.from({ length: count }, (_, i) =>
      bloom(x - length / 2 + (length / count) * (i + 0.5), y + 0.38, z),
    ).flat(),
  ];
}

/** 长条花箱。稿子里正面和侧面各摆了一只 */
function planter(x: number, z: number, length: number, rotY = 0): Object3D {
  return placed(group("planter", planterParts(0, 0, 0, length)), x, 0, z, rotY);
}

/**
 * 汤碗吊招牌。**这是"这是家餐馆"的头号凭据**，所以做得比别的道具细。
 *
 * 稿子上它是从一根铁艺挑臂上吊下来的一块盾形木牌，牌面画着一碗冒热气的
 * 汤。低模里"盾形"用一个方块加一颗压扁的球凑，热气用三个越飘越高的团子
 * ——和烟囱的烟同一套写法。
 */
function hangingSign(x: number, y: number, z: number): Object3D {
  return placed(
    group("diner-sign", [
      // 铁艺挑臂：一根横杆 + 一根斜撑
      cylinder(0.035, 0.035, 1.1, 6, {
        position: [0.55, 0, 0],
        rotation: [0, 0, Math.PI / 2],
        color: PALETTE.dinerIron,
      }),
      cylinder(0.028, 0.028, 0.62, 6, {
        position: [0.24, -0.22, 0],
        rotation: [0, 0, Math.PI / 4],
        color: PALETTE.dinerIron,
      }),
      // 两条吊链
      ...[0.82, 1.04].map((dx) =>
        cylinder(0.014, 0.014, 0.22, 4, {
          position: [dx, -0.11, 0],
          color: PALETTE.dinerIron,
          castShadow: false,
        }),
      ),
      /*
       * 牌面。**做大到 0.86**：第二版 0.62 宽的牌子挂在 3 米高处，
       * 从街上看只是一小块色斑，而它本该是整栋楼的招牌。
       * 深色包边让它从奶白墙上跳出来。
       */
      box([0.9, 0.72, 0.05], { position: [1.0, -0.58, 0], color: PALETTE.dinerWoodDeep }),
      box([0.78, 0.6, 0.08], { position: [1.0, -0.58, 0], color: PALETTE.dinerSign }),
      blob(0.39, 0, {
        position: [1.0, -0.88, 0],
        scale: [1, 0.5, 0.2],
        color: PALETTE.dinerSign,
        castShadow: false,
      }),
      // 牌面上的汤碗（只做剪影：一只碗 + 三缕热气）
      blob(0.2, 0, {
        position: [1.0, -0.68, 0.06],
        scale: [1, 0.52, 0.18],
        color: PALETTE.dinerWoodDeep,
        castShadow: false,
      }),
      ...[0, 1, 2].map((i) =>
        blob(0.04 + i * 0.014, 0, {
          position: [1.0 + (i - 1) * 0.09, -0.46 + i * 0.09, 0.06],
          color: PALETTE.dinerWoodDeep,
          castShadow: false,
        }),
      ),
    ]),
    x,
    y,
    z,
  );
}

/** MENU 黑板。稿子里是一块立在门右手边的 A 字架 */
function menuBoard(x: number, z: number): Object3D {
  return placed(
    group("menu-board", [
      ...[-1, 1].flatMap((s) =>
        [-0.22, 0.22].map((dx) =>
          box([0.055, 0.82, 0.055], {
            position: [dx, 0.41, s * 0.13],
            rotation: [s * 0.15, 0, 0],
            color: PALETTE.dinerWood,
          }),
        ),
      ),
      box([0.58, 0.66, 0.05], {
        position: [0, 0.62, -0.1],
        rotation: [-0.15, 0, 0],
        color: PALETTE.dinerWood,
      }),
      box([0.48, 0.54, 0.03], {
        position: [0, 0.62, -0.07],
        rotation: [-0.15, 0, 0],
        color: PALETTE.dinerSlate,
        castShadow: false,
      }),
      // 黑板上潦草的两行字 + 一只碗，只做剪影
      ...[0.74, 0.62].map((y, i) =>
        box([0.3 - i * 0.06, 0.035, 0.02], {
          position: [0, y, -0.05],
          rotation: [-0.15, 0, 0],
          color: PALETTE.dinerAwningLight,
          castShadow: false,
        }),
      ),
      blob(0.08, 0, {
        position: [0, 0.47, -0.04],
        scale: [1, 0.5, 0.2],
        color: PALETTE.dinerAwningLight,
        castShadow: false,
      }),
    ]),
    x,
    0,
    z,
  );
}

/** 挑臂灯笼。稿子的三视图里前后各挂了一只 */
function lantern(x: number, y: number, z: number, dir: number): Object3D {
  return placed(
    group("diner-lantern", [
      cylinder(0.032, 0.032, 0.5, 6, {
        position: [dir * 0.25, 0, 0],
        rotation: [0, 0, Math.PI / 2],
        color: PALETTE.dinerIron,
      }),
      cylinder(0.014, 0.014, 0.16, 4, {
        position: [dir * 0.48, -0.08, 0],
        color: PALETTE.dinerIron,
        castShadow: false,
      }),
      box([0.2, 0.26, 0.2], { position: [dir * 0.48, -0.29, 0], color: PALETTE.dinerIron }),
      box([0.15, 0.19, 0.15], {
        position: [dir * 0.48, -0.29, 0],
        color: PALETTE.dinerLamp,
        castShadow: false,
      }),
      box([0.24, 0.05, 0.24], {
        position: [dir * 0.48, -0.14, 0],
        color: PALETTE.dinerIron,
        castShadow: false,
      }),
    ]),
    x,
    y,
    z,
  );
}

/** 露天矮桌 + 两只小凳。稿子里摆在正面左手边的台明上 */
function patioSet(x: number, z: number): Object3D {
  return placed(
    group("patio-set", [
      box([0.86, 0.08, 0.62], { position: [0, 0.52, 0], color: PALETTE.dinerWood }),
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) =>
          box([0.07, 0.5, 0.07], {
            position: [sx * 0.34, 0.25, sz * 0.22],
            color: PALETTE.dinerWoodDeep,
          }),
        ),
      ),
      // 桌上：一只汤碗 + 一个瓶子
      blob(0.13, 0, {
        position: [-0.16, 0.6, 0],
        scale: [1, 0.5, 1],
        color: PALETTE.dinerWall,
        castShadow: false,
      }),
      cylinder(0.055, 0.055, 0.24, 6, {
        position: [0.2, 0.68, -0.06],
        color: PALETTE.dinerRoofDeep,
        castShadow: false,
      }),
      // 两只小凳
      ...[-0.78, 0.78].map((dx) =>
        placed(
          group("stool", [
            cylinder(0.16, 0.16, 0.07, 8, { position: [0, 0.36, 0], color: PALETTE.dinerWood }),
            ...[-1, 1].flatMap((sx) =>
              [-1, 1].map((sz) =>
                box([0.05, 0.34, 0.05], {
                  position: [sx * 0.1, 0.17, sz * 0.1],
                  color: PALETTE.dinerWoodDeep,
                }),
              ),
            ),
          ]),
          dx,
          0,
          0,
        ),
      ),
    ]),
    x,
    0,
    z,
  );
}

/**
 * 正面那个**拱形门洞**。
 *
 * 第一版拿一颗压扁的球去填拱肩，渲出来是个悬在洞里的淡色六边形——球的
 * 轮廓和圆拱根本不是一回事，而且它把洞堵了一半。这一版按真几何来：
 *
 * - 拱线 `y = springY + sqrt(r^2 - x^2)`，沿它摆一圈**楔形石**；
 * - 拱肩用**一列竖条**填到墙顶，每条的下缘就落在拱线上——精确、无缝，
 *   而且列数越多越圆，是可调的。
 */
function archedFront(
  w: number,
  wallH: number,
  baseY: number,
  frontZ: number,
  doorW: number,
  springY: number,
): Object3D[] {
  const parts: Object3D[] = [];
  const r = doorW / 2;
  const wallTop = baseY + wallH;
  const T = 0.16;

  // 门洞两侧的整墙
  for (const sx of [-1, 1]) {
    const segW = (w - doorW) / 2;
    parts.push(
      box([segW, wallH, T], {
        position: [(sx * (doorW + segW)) / 2, baseY + wallH / 2, frontZ],
        color: PALETTE.dinerWall,
      }),
    );
  }

  // 拱肩：竖条填到墙顶，下缘落在拱线上
  const COLS = 13;
  for (let i = 0; i < COLS; i += 1) {
    const x = -r + (doorW / COLS) * (i + 0.5);
    const arcY = baseY + springY + Math.sqrt(Math.max(0, r * r - x * x));
    const h = wallTop - arcY;
    if (h <= 0.02) continue;
    parts.push(
      box([doorW / COLS + 0.01, h, T], {
        position: [x, arcY + h / 2, frontZ],
        color: PALETTE.dinerWall,
        castShadow: false,
      }),
    );
  }

  // 楔形石：沿拱线摆一圈，每块朝着圆心转
  const STONES = 11;
  for (let i = 0; i < STONES; i += 1) {
    const t = (Math.PI * (i + 0.5)) / STONES;
    parts.push(
      box([0.3, 0.22, T + 0.08], {
        position: [
          Math.cos(t) * (r + 0.11),
          baseY + springY + Math.sin(t) * (r + 0.11),
          frontZ + 0.02,
        ],
        rotation: [0, 0, t - Math.PI / 2],
        color: PALETTE.dinerStone,
        castShadow: false,
      }),
    );
  }
  // 拱脚两侧各一块起拱石，交代"拱从这儿开始"
  for (const sx of [-1, 1]) {
    parts.push(
      box([0.34, 0.22, T + 0.08], {
        position: [sx * (r + 0.05), baseY + springY - 0.02, frontZ + 0.02],
        color: PALETTE.dinerStone,
        castShadow: false,
      }),
    );
  }

  // 门洞侧壁：让洞看起来有进深，不是一张贴在墙上的黑纸
  for (const sx of [-1, 1]) {
    parts.push(
      box([0.1, springY, 0.6], {
        position: [sx * r, baseY + springY / 2, frontZ - 0.36],
        color: PALETTE.dinerStoneDeep,
        castShadow: false,
      }),
    );
  }

  return parts;
}

/**
 * 出餐台。稿子的正视图里，拱门下面横着一条台子，店主站在台后。
 *
 * 它是**"这是店不是家"的第三个凭据**（前两个是招牌和遮阳篷）：
 * 一个空拱门是门廊，拱门里横一条台子就是柜台。
 */
function serviceCounter(z: number, width: number, baseY: number): Object3D[] {
  /*
   * **柜台不占满门洞，往左让出一条道。**
   *
   * 稿子上正面那个拱是出餐窗，门开在背面（见后视图）；而这套引擎的门
   * 永远在正面（`buildingDoorAt` 用 `footprint.height / 2`）。照稿子把
   * 柜台横满拱口的话，实机里玩家是从柜台**中间穿过去**进屋的——它没有
   * 碰撞，所以走得通，但看着像穿模。
   *
   * 让开右边 1.2 米：既保住"拱口后面有个柜台"的读法，又留出一条明确的
   * 入口。这是引擎约束和设计稿冲突时的取舍，不是漏做。
   */
  const shift = -0.62;
  return [
    box([width, 0.9, 0.5], { position: [shift, baseY + 0.45, z], color: PALETTE.dinerWood }),
    box([width + 0.16, 0.1, 0.66], {
      position: [shift, baseY + 0.95, z],
      color: PALETTE.dinerWoodDeep,
    }),
    // 台面上：两摞碗 + 一口小锅
    ...[-1.05, -0.72].map((x, i) =>
      blob(0.15, 0, {
        position: [x, baseY + 1.04 + i * 0.02, z],
        scale: [1, 0.42, 1],
        color: PALETTE.dinerWall,
        castShadow: false,
      }),
    ),
    cylinder(0.2, 0.22, 0.24, 8, {
      position: [-0.15, baseY + 1.12, z],
      color: PALETTE.dinerIron,
      castShadow: false,
    }),
    cylinder(0.17, 0.17, 0.05, 8, {
      position: [-0.15, baseY + 1.25, z],
      color: PALETTE.dinerSoup,
      castShadow: false,
    }),
  ];
}

function dinerShell(width: number, depth: number): Object3D {
  const w = width * CELL;
  const d = depth * CELL;
  const halfW = w / 2;
  const halfD = d / 2;
  const wallH = WALL_H;
  /**
   * 石台明的高度。**从 0.16 提到 0.42**：第一版渲出来那圈石头是张灰色
   * 薄饼，稿子上它是一层实打实的基座。顺带它把墙"压矮"了——立面比例里
   * 屋顶的份额因此变大，这正是第一版最缺的东西。
   */
  const baseY = 0.42;
  /*
   * 屋脊高度。**第一版 rise=2.5（约 35°）渲出来像谷仓**——墙占了立面的
   * 三分之二，屋顶只是顶上一片缓坡。稿子上屋顶差不多和墙一样高，
   * 坡度目测四十几度。3.9 对 7 米进深 → 约 48°。
   */
  const ridgeY = baseY + wallH + 3.9;
  const eaveY = baseY + wallH + 0.2;
  /** 石台明往外挑多少。稿子上那圈台明显比墙宽出一截 */
  const plinth = 0.85;
  /** 门洞净宽 */
  const doorW = 2.6;
  /**
   * 起拱高度（相对台明面）。拱顶 = springY + doorW/2 = 3.1，墙顶 3.4。
   *
   * 第一版给 2.0，拱顶顶到 3.3，遮阳篷只能骑在拱上——正视图里篷子把
   * 拱券咬掉了一截。降到 1.8 之后篷檐正好落在拱顶和墙顶之间那道缝里。
   */
  const springY = 1.8;

  return group("diner", [
    // ---- 石台明（挑出脚印，纯装饰，没有碰撞）----
    box([w + plinth * 2, baseY, d + plinth * 2], {
      position: [0, baseY / 2, 0],
      color: PALETTE.dinerStone,
    }),
    box([w + plinth * 2 + 0.12, 0.1, d + plinth * 2 + 0.12], {
      position: [0, baseY - 0.05, 0],
      color: PALETTE.dinerStoneDeep,
    }),
    /*
     * 台明侧面的石块缝。一大块灰色立方体读起来是水泥墩子；沿四边压几道
     * 竖缝之后才是"垒起来的石台"。缝比块窄得多，所以用深色细条压上去
     * 而不是真去切块。
     */
    ...[-1, 1].flatMap((sz) =>
      Array.from({ length: 9 }, (_, i) =>
        box([0.06, baseY * 0.7, 0.04], {
          position: [
            -(w + plinth * 2) / 2 + ((w + plinth * 2) / 9) * (i + 0.5),
            baseY * 0.5,
            sz * (d / 2 + plinth + 0.01),
          ],
          color: PALETTE.dinerStoneDeep,
          castShadow: false,
        }),
      ),
    ),
    ...[-1, 1].flatMap((sx) =>
      Array.from({ length: 7 }, (_, i) =>
        box([0.04, baseY * 0.7, 0.06], {
          position: [
            sx * (w / 2 + plinth + 0.01),
            baseY * 0.5,
            -(d + plinth * 2) / 2 + ((d + plinth * 2) / 7) * (i + 0.5),
          ],
          color: PALETTE.dinerStoneDeep,
          castShadow: false,
        }),
      ),
    ),

    // ---- 三面实墙 ----
    ...[-halfW, halfW].map((x) =>
      box([0.16, wallH, d], { position: [x, baseY + wallH / 2, 0], color: PALETTE.dinerWall }),
    ),
    box([w, wallH, 0.16], { position: [0, baseY + wallH / 2, -halfD], color: PALETTE.dinerWall }),

    // ---- 正面：拱形门洞 + 出餐台 ----
    ...archedFront(w, wallH, baseY, halfD, doorW, springY),
    ...serviceCounter(halfD - 0.42, doorW - 1.3, baseY),

    /*
     * ---- 砌石横缝 ----
     *
     * 第一版两道 0.06 的浅条，渲出来几乎看不见（正视图上墙是一整片奶油
     * 色）。这一版四道、加粗到 0.1、并且压到墙面外侧，让它自己投一点影
     * ——稿子上那面墙是看得出石块层理的。
     */
    ...[1.0, 2.0, 3.0].flatMap((y) => [
      box([w + 0.04, 0.07, 0.19], {
        position: [0, baseY + y, halfD],
        color: PALETTE.dinerWallCourse,
        castShadow: false,
      }),
      box([w + 0.04, 0.07, 0.19], {
        position: [0, baseY + y, -halfD],
        color: PALETTE.dinerWallCourse,
        castShadow: false,
      }),
      ...[-halfW, halfW].map((x) =>
        box([0.19, 0.07, d + 0.04], {
          position: [x, baseY + y, 0],
          color: PALETTE.dinerWallCourse,
          castShadow: false,
        }),
      ),
      /*
       * 竖缝。只有横缝的话墙读成**壁板**（第二版正视图就是一排横条纹的
       * 木屋），石砌的关键在于横缝之间被竖缝错开切断。错半格排列，
       * 不然三层竖缝对齐又成了砖柱。
       */
      ...Array.from({ length: 6 }, (_, i) =>
        box([0.07, 0.9, 0.19], {
          position: [
            -w / 2 + (w / 6) * (i + (y === 2.0 ? 0.2 : 0.7)),
            baseY + y - 0.48,
            -halfD,
          ],
          color: PALETTE.dinerWallCourse,
          castShadow: false,
        }),
      ),
      ...[-halfW, halfW].flatMap((x) =>
        Array.from({ length: 5 }, (_, i) =>
          box([0.19, 0.9, 0.07], {
            position: [
              x,
              baseY + y - 0.48,
              -d / 2 + (d / 5) * (i + (y === 2.0 ? 0.2 : 0.7)),
            ],
            color: PALETTE.dinerWallCourse,
            castShadow: false,
          }),
        ),
      ),
    ]),

    /*
     * ---- 木构架 ----
     *
     * 四角立柱 + 檐下腰梁 + **四角斜撑**。斜撑是这一版补的：稿子上那栋楼
     * 的木框架很显眼，只有立柱的话墙面仍然是一大片空白灰泥，读不出
     * "木石混构"。
     */
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.2, wallH, 0.2], {
          position: [sx * halfW, baseY + wallH / 2, sz * halfD],
          color: PALETTE.dinerWood,
        }),
      ),
    ),
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        box([0.14, 1.3, 0.14], {
          position: [sx * (halfW - 0.42), baseY + wallH - 0.62, sz * halfD],
          rotation: [0, 0, sx * 0.72],
          color: PALETTE.dinerWood,
          castShadow: false,
        }),
      ),
    ),
    box([w + 0.14, 0.16, d + 0.14], {
      position: [0, baseY + wallH, 0],
      color: PALETTE.dinerWoodDeep,
    }),

    /*
     * ---- 左右山墙 ----
     *
     * 脊沿左右走，所以三角落在**东西两端**。做法照家具小店那次收敛出来的
     * 结论：**递减的横板堆成阶梯**，每层宽度按这一层的**上缘**在屋顶上的
     * 宽度算。三段圆锥转出来的那条路走过——圆锥底面会同时往两个轴摊开，
     * 转完整栋楼的包围盒就废了；按中线算宽度则每层上面两个角都戳出瓦面。
     *
     * 层数从 8 提到 14：坡陡了以后 8 层的台阶边缘从侧面看很扎眼。
     */
    ...[1, -1].flatMap((sx) =>
      Array.from({ length: 14 }, (_, i) => {
        const bandH = (ridgeY - eaveY) / 14;
        const yMid = eaveY + bandH * (i + 0.5);
        const yTop = eaveY + bandH * (i + 1);
        const depthHere = d * (1 - (yTop - eaveY) / (ridgeY - eaveY)) * 0.94;
        return box([0.17, bandH + 0.01, Math.max(0.1, depthHere)], {
          // 往里缩 0.06：外缘留给博风板去盖
          position: [sx * (halfW - 0.06), yMid, 0],
          color: PALETTE.dinerWall,
        });
      }),
    ),

    /*
     * **博风板**。沿山墙那两条斜边各钉一条木板。
     *
     * 阶梯三角在正视图里还行，一转到 45° 就是一排扎眼的锯齿（第二版
     * 渲出来右端整个是把梳子）。稿子上那两条边是干净的木封边——加两块
     * 斜木板把锯齿的外缘盖掉，比把台阶切到看不见便宜得多，
     * 也正是真房子的做法。
     */
    ...[1, -1].flatMap((sx) =>
      [1, -1].map((sz) =>
        box([0.14, 0.52, Math.hypot(d / 2, ridgeY - eaveY)], {
          position: [
            sx * (halfW + 0.04),
            (ridgeY + eaveY) / 2 - 0.14,
            (sz * d) / 4,
          ],
          rotation: [sz * Math.atan2(ridgeY - eaveY, d / 2), 0, 0],
          color: PALETTE.dinerWoodDeep,
        }),
      ),
    ),
    // 博风板交会处的悬鱼：一块小木牌，把两条斜边收口
    ...[1, -1].map((sx) =>
      box([0.14, 0.42, 0.3], {
        position: [sx * (halfW + 0.03), ridgeY - 0.28, 0],
        color: PALETTE.dinerWood,
      }),
    ),

    // ---- 苔绿瓦双坡顶 ----
    ...tiledRoof(w, d, ridgeY, eaveY),

    // ---- 阁楼天窗（前坡，偏左）----
    ...dormer(-w * 0.22, eaveY + 1.15, halfD - 1.65),

    /*
     * ---- 冒烟的石烟囱 ----
     *
     * 从 0.5 加宽到 0.75、往前挪到屋脊附近：第一版缩在后坡，正视图里只
     * 露出一个小疙瘩。稿子上它是立面剪影的一部分，得从正面就看得见。
     */
    box([0.75, 2.6, 0.75], {
      position: [w * 0.3, ridgeY - 0.6, -0.5],
      color: PALETTE.dinerStone,
    }),
    ...[0.5, 1.15, 1.8].map((y) =>
      box([0.79, 0.08, 0.79], {
        position: [w * 0.3, ridgeY - 1.9 + y, -0.5],
        color: PALETTE.dinerStoneDeep,
        castShadow: false,
      }),
    ),
    box([0.92, 0.16, 0.92], {
      position: [w * 0.3, ridgeY + 0.78, -0.5],
      color: PALETTE.dinerStoneDeep,
    }),
    ...[0, 1, 2].map((i) =>
      blob(0.13 + i * 0.06, 0, {
        position: [w * 0.3 + i * 0.08, ridgeY + 1.08 + i * 0.32, -0.5 - i * 0.06],
        color: "#f4f1ea",
        castShadow: false,
      }),
    ),

    // ---- 侧墙与背墙的窗（木框 + 暖光窗芯 + 窗台）----
    /*
     * 窗**先画窗芯、再在它外面钉四条框**。
     *
     * 第二版是"一块木板 + 一块更小的暖色板压在前面"，结果木板整个埋在
     * 0.16 厚的墙里，渲出来只剩一块凭空贴着的黄色方块。四条框各自在墙外
     * 0.09，怎么看都是一扇窗。
     */
    ...[-1, 1].flatMap((sx) => sideWindow(sx, halfW, baseY + 1.8, -0.6)),
    ...backWindow(-w * 0.28, baseY + 1.8, halfD),

    /*
     * ---- 正面右侧的小窗 + 窗台 ----
     * 稿子上门右边有一扇带花箱的小窗。它平衡了立面：左边挂招牌、
     * 中间是拱门、右边如果什么都没有，整栋楼会往左倒。
     */
    ...frontWindow(halfW - 1.6, baseY + 1.95, halfD),

    /*
     * ---- 赤陶白条纹遮阳篷 ----
     *
     * 第一版挂在离地约 3 米，正视图里它悬在墙中央、和拱门中间隔着一大片
     * 空墙，读起来像块搁板。这一版**压到拱顶正上方**、加宽到盖住整个拱，
     * 并补一圈**波浪篷檐**——那是布篷和木板的区别。
     */
    ...Array.from({ length: 9 }, (_, i) => {
      const awningW = doorW + 2.0;
      const stripeW = awningW / 9;
      const reach = 1.55;
      return box([stripeW, 0.1, reach], {
        position: [
          -awningW / 2 + stripeW * (i + 0.5),
          baseY + springY + doorW / 2 + 0.34,
          halfD + reach / 2 - 0.04,
        ],
        rotation: [0.34, 0, 0],
        color: i % 2 === 0 ? PALETTE.dinerAwning : PALETTE.dinerAwningLight,
        castShadow: i % 2 === 0,
      });
    }),
    /*
     * 波浪篷檐。**必须挂在篷子的前下缘**，不是后上缘。
     *
     * 第二版按后缘的高度摆，那一排半圆就浮在拱券前面，像晾在门口的
     * 一串白灰团子（渲图上第一眼以为是穿模）。位置改成沿倾角推到
     * 篷檐末端：y 减去 reach·sin(θ)，z 加上 reach·cos(θ)。
     */
    ...Array.from({ length: 9 }, (_, i) => {
      const awningW = doorW + 2.0;
      const stripeW = awningW / 9;
      const reach = 1.55;
      const tilt = 0.34;
      return blob(stripeW / 2, 0, {
        position: [
          -awningW / 2 + stripeW * (i + 0.5),
          baseY + springY + doorW / 2 + 0.34 - Math.sin(tilt) * reach * 0.52 - 0.12,
          halfD + Math.cos(tilt) * reach - 0.06,
        ],
        scale: [1, 0.9, 0.14],
        color: i % 2 === 0 ? PALETTE.dinerAwning : PALETTE.dinerAwningLight,
        castShadow: false,
      });
    }),
    /*
     * 撑杆改成**两根铁艺斜撑**。落地撑杆在正视图里是两根杵在门两边的
     * 柱子，把门脸切成三段；稿子上那顶篷是从墙上挑出来的，底下什么都
     * 没有——门口该是空的，人要走进去。
     */
    ...[-1, 1].flatMap((sx) => {
      const bx = sx * (doorW / 2 + 0.95);
      const by = baseY + springY + doorW / 2 + 0.26;
      return [
        // 贴墙的竖托
        box([0.08, 0.44, 0.08], {
          position: [bx, by - 0.22, halfD + 0.1],
          color: PALETTE.dinerIron,
        }),
        // 斜撑：短、贴着墙，不再从门口支棱出来
        cylinder(0.032, 0.032, 0.62, 6, {
          position: [bx, by - 0.2, halfD + 0.32],
          rotation: [Math.PI / 4, 0, 0],
          color: PALETTE.dinerIron,
          castShadow: false,
        }),
      ];
    }),

    /*
     * ---- 汤碗吊招牌 ----
     *
     * **z 必须在墙外**。第一版给的是 `halfD - 0.55`，牌子整个埋进了屋里，
     * 正视图上什么都看不到（只有挑臂的两根杆从墙里戳出来）。
     */
    hangingSign(-halfW - 0.12, baseY + wallH - 0.15, halfD + 0.5),

    // ---- 灯笼：正面右角一只，背面左角一只 ----
    lantern(halfW + 0.1, baseY + wallH - 0.55, halfD + 0.3, 1),
    lantern(-halfW - 0.1, baseY + wallH - 0.55, -halfD + 0.7, -1),

    // ---- 门口：两级石阶，从台明降到地面 ----
    box([doorW + 1.2, 0.16, 0.8], {
      position: [0, baseY - 0.08, halfD + plinth + 0.3],
      color: PALETTE.dinerStone,
    }),
    box([doorW + 0.7, 0.16, 0.55], {
      position: [0, baseY - 0.24, halfD + plinth + 0.62],
      color: PALETTE.dinerStoneDeep,
    }),

    // ---- MENU 黑板：门右手边的台明上 ----
    menuBoard(doorW / 2 + 1.35, halfD + 1.05),

    // ---- 花箱：侧面一只（正面那只已经挂到窗台上了）----
    planter(-halfW - 0.55, -1.4, 2.2, Math.PI / 2),
    planter(halfW + 0.55, 1.2, 1.8, Math.PI / 2),

    // ---- 露天桌凳：正面左手边的台明上 ----
    patioSet(-halfW + 1.7, halfD + 1.15),

    // ---- 木栅栏：围住台明的左右两侧，正面留出门口 ----
    ...[-1, 1].flatMap((sx) =>
      [0, 1, 2, 3, 4].map((i) =>
        box([0.09, 0.6, 0.09], {
          position: [
            sx * (halfW + plinth - 0.14),
            baseY + 0.3,
            -halfD - plinth + 0.55 + i * ((d + plinth * 1.5) / 4.4),
          ],
          color: PALETTE.dinerWoodDeep,
        }),
      ),
    ),
    ...[-1, 1].flatMap((sx) =>
      [0.2, 0.46].map((y) =>
        box([0.06, 0.06, d + plinth * 1.3], {
          position: [sx * (halfW + plinth - 0.14), baseY + y, 0.2],
          color: PALETTE.dinerWoodDeep,
          castShadow: false,
        }),
      ),
    ),
  ]);
}

export const diner: BuildingDefinition = {
  buildingId: "diner",
  localizationKey: "building.diner",
  descriptionKey: "building.diner.desc",
  doorOffset: 0,
  /*
   * 一间。理由和家具小店一样：第二间会让"我的厨房在哪一间"变成一道
   * 没必要的选择题，而餐厅占 9×7，院子里根本放不下两栋。
   */
  maxInstances: 1,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.diner.l1",
      descriptionKey: "building.diner.l1.desc",
      // 稿子标的是 6×6，用户当场推翻——理由和算法见文件头
      footprint: { width: WIDTH, height: DEPTH },
      interior: (style) =>
        buildInterior(
          { width: WIDTH, depth: DEPTH, windows: true, wallHeight: WALL_H },
          style,
        ),
      buildCost: [{ itemId: "gold", quantity: dinerTuning.buildGold }],
      build: () => dinerShell(WIDTH, DEPTH),
    },
  ],
};
