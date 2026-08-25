import { roomStyleDefinitions, shopkeepingTuning, type RoomSave } from "core";
import { Color } from "three";
import type { MeshLambertMaterial, Object3D } from "three";
import { PALETTE, jitterShade } from "../Game3D/Visual/palette.js";
import { blob, box, cylinder, group } from "../Game3D/Visual/primitives.js";
import { buildStoneWalls } from "../Game3D/World/House/StoneWalls.js";
import { SHINGLE, SHINGLE_DARK } from "../Game3D/World/House/WitchRoof.js";
import { hash01 } from "../Game3D/World/outdoorTerrain.js";
import { furnitureShopInterior } from "./furnitureShopInterior.js";
import { buildInterior } from "./interiors.js";
import type { BuildingDefinition } from "./types.js";

/**
 * 家具小店（期 5；2026-08-26 第三版：从里到外重做）。
 *
 * ## 和主屋的关系：**同一批材料，不同的剪影**
 *
 * 用户前后两句话定了这个设计：
 * 1. "风格要和 1 级小屋一致"——所以墙直接调主屋的 `buildStoneWalls`
 *    （乱石皮 + 灰缝 + 木构架，同一份代码），木瓦用同一批色
 *    （`WitchRoof` 导出的 SHINGLE）。
 * 2. "只是模仿墙壁设计，不代表房顶设计一样，去搜"——搜了中世纪商铺的
 *    参考（half-timbered shop / jettied medieval house），商铺的通行
 *    特征是：**二层向外挑出（jetty）压在木托架上**、**正面山墙朝街**
 *    （招牌挂在山墙上）、窗带木百叶、厚木板门。主屋是弧线女巫帽，
 *    小店是笔直的陡山墙——一个村子的两种屋顶。
 *
 * ## 尺寸 l1 7×7（原 6×6）
 *
 * 用户 2026-08-26："size 小了，要大一些"。6×6 = 36 格² 站在 9×12 的
 * 主屋旁边像个岗亭。7×7 = 49 格²，加上挑层和高山墙，体量对得上话。
 * l2 跟着到 8×8。
 *
 * ## 门是**开着的**——这里修过一个把店封死的 bug
 *
 * 上一版给门洞钉了一扇静止的关门。模型即碰撞之后，**关着的门板就是一堵
 * 墙**：门洞两侧净空只剩 0.17 米，谁都进不去，货架面板做得再好也白搭。
 * 营业中的铺子门就该敞着——门板绕左侧合页转开、贴在外墙上，既是
 * "欢迎进来"的信号，也把门洞真正让出来。
 */

/** 一格多少米。和院子的格宽一致 */
const CELL = 1;

/** 墙高。主屋的女巫小屋也是 3，一致 */
const WALL_H = 3;

/** 挑层（jetty）：石墙顶上那一圈木板楼层的高度与外挑量 */
const JETTY_H = 0.9;
const JETTY_OUT = 0.35;

/** 一朵小蘑菇。主屋墙根就长着这个，是这套风格的标志物 */
function mushroom(x: number, z: number, capColor: string): Object3D {
  const node = group("mushroom", [
    cylinder(0.045, 0.05, 0.12, 6, {
      position: [0, 0.06, 0],
      color: PALETTE.wallTrim,
      castShadow: false,
    }),
    blob(0.11, 0, {
      position: [0, 0.14, 0],
      scale: [1, 0.62, 1],
      color: capColor,
      castShadow: false,
    }),
  ]);
  node.position.set(x, 0, z);
  return node;
}

/**
 * 挑层：石墙顶上向外挑出的一圈木板楼层 + 支着它的斜托架。
 *
 * 这是搜出来的那个商铺记号（jetty/overhang）：楼上比楼下宽一圈，
 * 底下一排木托架。低多边形里它同时解决两件事——给小店一个"两层楼"
 * 的体量（用户嫌小），以及把石墙和木山墙在材质上分开。
 */
function jettyBand(w: number, d: number): Object3D[] {
  const bw = w + JETTY_OUT * 2;
  const bd = d + JETTY_OUT * 2;
  const y0 = WALL_H;
  const parts: Object3D[] = [
    // 楼板边缘（挑出的底面轮廓线）
    box([bw + 0.08, 0.14, bd + 0.08], {
      position: [0, y0 + 0.07, 0],
      color: PALETTE.woodDark,
    }),
    // 木板墙一圈。**亚麻灰泥色不是橙木色**：主屋的墙系是灰米色 + 深木
    // 框，第一版用 woodLight（#a97c4c）整圈发橙，和石墙完全不搭
    box([bw, JETTY_H, 0.14], { position: [0, y0 + JETTY_H / 2 + 0.1, bd / 2 - 0.07], color: "#cfc3ab" }),
    box([bw, JETTY_H, 0.14], { position: [0, y0 + JETTY_H / 2 + 0.1, -bd / 2 + 0.07], color: "#cfc3ab" }),
    box([0.14, JETTY_H, bd], { position: [bw / 2 - 0.07, y0 + JETTY_H / 2 + 0.1, 0], color: "#cfc3ab" }),
    box([0.14, JETTY_H, bd], { position: [-bw / 2 + 0.07, y0 + JETTY_H / 2 + 0.1, 0], color: "#cfc3ab" }),
    // 压顶木线
    box([bw + 0.06, 0.1, bd + 0.06], {
      position: [0, y0 + JETTY_H + 0.12, 0],
      color: PALETTE.woodDark,
    }),
  ];
  // 木构架竖线（前后两面各四道，读出"半木构"的格子）
  for (const sz of [1, -1]) {
    for (const fx of [-0.38, -0.13, 0.13, 0.38]) {
      parts.push(
        box([0.1, JETTY_H, 0.06], {
          position: [fx * bw, y0 + JETTY_H / 2 + 0.1, sz * (bd / 2 + 0.01)],
          color: PALETTE.woodDark,
          castShadow: false,
        }),
      );
    }
  }
  // 托架：挑出量的斜撑，沿前后两条边各四只
  for (const sz of [1, -1]) {
    for (const fx of [-0.36, -0.12, 0.12, 0.36]) {
      parts.push(
        box([0.1, 0.5, 0.1], {
          position: [fx * w, y0 - 0.18, sz * (d / 2 + JETTY_OUT / 2)],
          rotation: [sz * 0.62, 0, 0],
          color: PALETTE.woodDark,
          castShadow: false,
        }),
      );
    }
  }
  return parts;
}

/**
 * 正山墙陡坡顶（**不是**女巫帽）。屋脊沿 z（前后）走，山墙朝街——
 * 招牌的家。瓦是逐块铺的小板，隔行错半格、色在 SHINGLE 两档间抖，
 * 和主屋的帽顶同一批"木瓦"，剪影完全不同。
 *
 * 檐口带一个**外翻的小踢脚**（最后一排瓦角度放缓）：不是抄弧线，
 * 是让两种屋顶在檐口那一米里有同一个"手劈木瓦往外翘"的习惯。
 */
function gableRoof(w: number, d: number): Object3D[] {
  const bw = w + JETTY_OUT * 2;
  const bd = d + JETTY_OUT * 2;
  const eaveY = WALL_H + JETTY_H + 0.16;
  const halfSpan = bw / 2 + 0.45;
  /*
   * 坡高 0.5×宽（约 45°）。0.62 那版屋脊到 9.6 米——**比主屋的 8 米峰
   * 还高**，村里的铺子压过了领主的宅子。0.5 收到 7.9，陡度还是商铺的
   * 陡山墙，等级回到该在的位置。
   */
  const rise = bw * 0.5;
  const ridgeY = eaveY + rise;
  const pitch = Math.atan2(rise, halfSpan);
  const slopeLen = Math.hypot(halfSpan, rise);
  const parts: Object3D[] = [];

  const ROWS = Math.max(5, Math.round(slopeLen / 0.75));
  const COLS = Math.max(6, Math.round((bd + 0.9) / 0.8));

  for (const dir of [1, -1]) {
    // 底板：一整块斜面兜底，瓦块之间的细缝不至于漏光
    parts.push(
      box([slopeLen, 0.09, bd + 0.9], {
        position: [(dir * halfSpan) / 2, (eaveY + ridgeY) / 2, 0],
        rotation: [0, 0, -dir * pitch],
        color: SHINGLE_DARK,
      }),
    );
    // 逐块瓦：行沿坡、列沿脊，隔行错半格
    for (let r = 0; r < ROWS; r += 1) {
      const t = (r + 0.5) / ROWS;
      const along = slopeLen * (0.5 - t);
      for (let c = 0; c < COLS; c += 1) {
        // 错缝 0.5/0.3 会把整行推出屋面一截，边缘漏背景色；0.32/0.18 够读出错缝
        const zc = -(bd + 0.9) / 2 + ((bd + 0.9) / COLS) * (c + (r % 2 === 0 ? 0.32 : 0.18));
        const dark = hash01(r * 12.9 + c * 7.7 + dir * 3.1) < 0.42;
        parts.push(
          box([slopeLen / ROWS + 0.06, 0.05, (bd + 0.9) / COLS - 0.05], {
            /*
             * 沿坡向屋脊走：x **向内收**（−cos）、y 向上（+sin）。
             * 第一版 x 写成 +cos——越靠近屋脊的瓦越被推出屋檐外，
             * 整片瓦飘在半空（渲出来像被风掀走的屋顶）。
             */
            position: [
              (dir * halfSpan) / 2 - dir * along * Math.cos(pitch),
              (eaveY + ridgeY) / 2 + along * Math.sin(pitch) + 0.055,
              zc,
            ],
            rotation: [0, 0, -dir * pitch],
            color: jitterShade(dark ? SHINGLE_DARK : SHINGLE, r, c, 0.05),
            castShadow: false,
          }),
        );
      }
    }
    // 檐口踢脚：最后一排放缓角度、往外翘
    parts.push(
      box([0.62, 0.07, bd + 0.9], {
        position: [dir * (halfSpan - 0.1), eaveY + 0.06, 0],
        rotation: [0, 0, -dir * pitch * 0.45],
        color: SHINGLE,
      }),
    );
    // 封檐板
    parts.push(
      box([0.5, 0.16, bd + 0.94], {
        position: [dir * halfSpan, eaveY - 0.02, 0],
        rotation: [0, 0, -dir * pitch],
        color: PALETTE.woodDark,
      }),
    );
  }

  // 屋脊木：加宽到 0.55——两坡的瓦和底板在脊线只是斜角相碰，
  // 窄脊木盖不住那道楔形缝，从上方看是一排白点（背景色漏出来）
  parts.push(
    box([0.7, 0.22, bd + 1.0], {
      position: [0, ridgeY + 0.02, 0],
      color: PALETTE.woodDark,
    }),
  );

  /*
   * 山墙三角（前后）：**竖木板**，不是石头——挑层以上换木料，正是
   * half-timbered 的分层。板高跟着坡线走。
   */
  for (const sz of [1, -1]) {
    const zFace = sz * (bd / 2 - 0.02);
    const PLANKS = 9;
    for (let i = 0; i < PLANKS; i += 1) {
      const x = -bw / 2 + (bw / PLANKS) * (i + 0.5);
      const hHere = Math.max(0.12, rise * (1 - Math.abs(x) / halfSpan) * 0.96);
      parts.push(
        box([bw / PLANKS - 0.03, hHere, 0.12], {
          position: [x, eaveY + hHere / 2, zFace],
          color: jitterShade("#cfc3ab", i, sz, 0.05),
        }),
      );
    }
  }

  // 烟囱：石砌，压在后坡东侧——一个村子的烟囱都是一个砌法
  parts.push(
    box([0.7, ridgeY - WALL_H + 0.7, 0.7], {
      position: [bw * 0.28, WALL_H + (ridgeY - WALL_H + 0.7) / 2, -bd * 0.28],
      color: PALETTE.baseStoneDark,
    }),
    box([0.82, 0.16, 0.82], {
      position: [bw * 0.28, ridgeY + 0.62, -bd * 0.28],
      color: PALETTE.baseStone,
    }),
  );

  return parts;
}

/** 一扇窗：木框 + 十字棂 + 真玻璃 + 两扇拉开的百叶板。装在石墙的窗洞上 */
function shopWindow(axis: "x" | "z", sign: number, face: number, cross: number, y: number): Object3D[] {
  const parts: Object3D[] = [];
  const W = 1.9;
  const H = 1.9;
  const at = (along: number, dy: number, sw: number, sh: number, depth: number, color: string, shadow = true) => {
    const pos: [number, number, number] =
      axis === "x" ? [sign * (face + depth), y + dy, cross + along] : [cross + along, y + dy, sign * (face + depth)];
    const size: [number, number, number] =
      axis === "x" ? [0.1, sh, sw] : [sw, sh, 0.1];
    parts.push(box(size, { position: pos, color, castShadow: shadow }));
  };

  // 玻璃（独享材质 + noOutline，diner 那次的规矩）
  const glassPos: [number, number, number] =
    axis === "x" ? [sign * (face + 0.1), y, cross] : [cross, y, sign * (face + 0.1)];
  const glassSize: [number, number, number] =
    axis === "x" ? [0.03, H - 0.3, W - 0.3] : [W - 0.3, H - 0.3, 0.03];
  const glass = box(glassSize, { position: glassPos, color: new Color("#cfe3ea"), castShadow: false });
  const gm = glass.material as MeshLambertMaterial;
  gm.transparent = true;
  gm.opacity = 0.32;
  gm.depthWrite = false;
  glass.userData.noOutline = true;
  glass.renderOrder = 1;
  parts.push(glass);

  // 四边框 + 十字棂
  at(0, H / 2 - 0.075, W, 0.15, 0.14, PALETTE.woodDark);
  at(0, -H / 2 + 0.075, W, 0.15, 0.14, PALETTE.woodDark);
  at(W / 2 - 0.075, 0, 0.15, H, 0.14, PALETTE.woodDark);
  at(-W / 2 + 0.075, 0, 0.15, H, 0.14, PALETTE.woodDark);
  at(0, 0, 0.09, H - 0.2, 0.12, PALETTE.woodDark, false);
  at(0, 0, W - 0.2, 0.09, 0.12, PALETTE.woodDark, false);
  // 窗台
  at(0, -H / 2 - 0.1, W + 0.3, 0.12, 0.2, PALETTE.woodDark, false);
  // 两扇拉开的百叶板（商铺记号之一）
  for (const s of [-1, 1]) {
    at(s * (W / 2 + 0.32), 0, 0.5, H - 0.2, 0.08, PALETTE.woodLight);
    at(s * (W / 2 + 0.32), H * 0.22, 0.42, 0.07, 0.12, PALETTE.woodDark, false);
    at(s * (W / 2 + 0.32), -H * 0.22, 0.42, 0.07, 0.12, PALETTE.woodDark, false);
  }
  return parts;
}

/**
 * **室内衬皮 + 木地板**。
 *
 * 实机走进店里才发现的：领地建筑的内景**从来只有数据没有视觉**——
 * 场景只为主屋构建房间视图（`room-living`），小店的"房间"管碰撞、
 * 家具归属和门，不管画墙。餐厅侥幸没露馅是因为它的墙是实心盒、
 * 两面同色；而 `buildStoneWalls` 只建朝外的面，**从屋里看直接穿到
 * 森林，地面还是草**。
 *
 * 所以外壳自己把内面画了：逐格铺内墙板（照 `openings` 跳门窗洞）+
 * 一块木地板。逐格是必须的——整块板会把窗户糊死。
 */
function innerSkin(room: RoomSave, wallHeight: number): Object3D[] {
  const parts: Object3D[] = [];
  const width = room.floorGrid.width;
  const depth = room.floorGrid.height;
  const halfW = width / 2;
  const halfD = depth / 2;

  // 木地板：两色交替的长条，读出板缝
  for (let i = 0; i < width; i += 1) {
    parts.push(
      box([0.98, 0.05, depth - 0.1], {
        position: [-halfW + i + 0.5, 0.025, 0],
        color: jitterShade(i % 2 === 0 ? "#b9945f" : "#ad8a57", i, 0, 0.03),
        castShadow: false,
        receiveShadow: true,
      }),
    );
  }

  // 四面内墙：逐格，跳过门窗洞
  const faces: Array<{ wallId: string; at: (wx: number, wy: number) => [number, number, number]; size: [number, number, number] }> = [
    { wallId: "north", at: (wx, wy) => [-halfW + wx + 0.5, wy + 0.5, -halfD + 0.1], size: [1, 1, 0.06] },
    { wallId: "south", at: (wx, wy) => [-halfW + wx + 0.5, wy + 0.5, halfD - 0.1], size: [1, 1, 0.06] },
    { wallId: "west", at: (wx, wy) => [-halfW + 0.1, wy + 0.5, -halfD + wx + 0.5], size: [0.06, 1, 1] },
    { wallId: "east", at: (wx, wy) => [halfW - 0.1, wy + 0.5, -halfD + wx + 0.5], size: [0.06, 1, 1] },
  ];
  for (const face of faces) {
    const wall = room.walls[face.wallId];
    if (!wall) continue;
    const blocked = new Set<string>();
    for (const opening of wall.openings) {
      for (let dy = 0; dy < opening.size.height; dy += 1) {
        for (let dx = 0; dx < opening.size.width; dx += 1) {
          blocked.add(`${opening.gridPosition.x + dx},${opening.gridPosition.y + dy}`);
        }
      }
    }
    for (let wy = 0; wy < wallHeight; wy += 1) {
      for (let wx = 0; wx < wall.grid.width; wx += 1) {
        if (blocked.has(`${wx},${wy}`)) continue;
        parts.push(
          box(face.size, {
            position: face.at(wx, wy),
            // 底下一行刷木裙色，和主屋室内同一个习惯
            color: jitterShade(wy === 0 ? PALETTE.woodLight : PALETTE.wall, wx, wy, 0.035),
            castShadow: false,
            receiveShadow: true,
          }),
        );
      }
    }
  }
  return parts;
}

/**
 * 铺面外壳。石墙来自主屋构件；挑层、正山墙顶、百叶窗、敞开的木板门
 * 是商铺自己的记号（来源见文件头）。
 */
function shopShell(cells: number, awning: number): Object3D {
  const w = cells * CELL;
  const d = cells * CELL;
  const half = w / 2;
  const halfD = d / 2;
  const wallH = WALL_H;

  /*
   * 外壳和内景**共用同一份户型**：`buildInterior` 把门和三面窗按格子
   * 开好，石墙皮照 `openings` 跳格，门窗洞天然对得上。style 传注册表
   * 第一条（构件只读格子不读材质）。
   */
  const room: RoomSave = {
    ...buildInterior(
      { width: cells, depth: cells, windows: true, wallHeight: wallH },
      roomStyleDefinitions[0],
    ),
    roomId: "shop-shell",
  };

  const { walls, plinth } = buildStoneWalls(room, 0);

  /*
   * 内景窗洞的世界位置（窗开在 `floor(depth/2)-1` 起的两格、y 1..3）：
   * 换算成本地中心，窗户构件照这个装，和石墙的洞对齐。
   */
  const windowCross = Math.floor(cells / 2) - 1 + 1 - halfD; // 两格窗的中心
  const windowY = 2.0;
  // 门：cells doorAt..doorAt+1 → 本地中心
  const doorAt = Math.max(0, Math.floor(cells / 2) - 1);
  const doorCenter = doorAt + 1 - half;

  return group("furniture-shop", [
    walls,
    plinth,
    ...innerSkin(room, wallH),
    ...jettyBand(w, d),
    ...gableRoof(w, d),

    // ---- 三面窗（北 / 东 / 西，位置对着内景的窗洞）----
    ...shopWindow("z", -1, halfD - 0.02, windowCross * 0 + (Math.floor(cells / 2) - 1 + 1 - half), windowY),
    ...shopWindow("x", 1, half - 0.02, windowCross, windowY),
    ...shopWindow("x", -1, half - 0.02, windowCross, windowY),

    // ---- 门：框 + **敞开的**木板门扇 ----
    // 门框
    box([0.16, 2.2, 0.2], { position: [doorCenter - 1.05, 1.1, halfD + 0.06], color: PALETTE.woodDark }),
    box([0.16, 2.2, 0.2], { position: [doorCenter + 1.05, 1.1, halfD + 0.06], color: PALETTE.woodDark }),
    box([2.26, 0.16, 0.2], { position: [doorCenter, 2.24, halfD + 0.06], color: PALETTE.woodDark }),
    /*
     * 门扇绕左合页开出 ~110°，贴在门洞左侧的外墙上。
     * **绝不能关着**：模型即碰撞，关着的门板 = 封店（上一版真封了）。
     */
    (() => {
      const leaf = group("shop-door-leaf", [
        box([1.9, 2.05, 0.07], { position: [0.95, 1.03, 0], color: PALETTE.woodDark }),
        ...[0.5, 1.6].map((y) =>
          box([1.7, 0.12, 0.05], {
            position: [0.95, y, -0.05],
            color: PALETTE.woodLight,
            castShadow: false,
          }),
        ),
        box([1.9, 0.11, 0.05], {
          position: [0.95, 1.05, -0.05],
          rotation: [0, 0, 0.55],
          color: PALETTE.woodLight,
          castShadow: false,
        }),
        blob(0.055, 0, {
          position: [1.7, 1.02, -0.08],
          color: PALETTE.wallTrim,
          castShadow: false,
        }),
      ]);
      leaf.position.set(doorCenter - 1.0, 0, halfD + 0.16);
      /*
       * 开到 ~163°（差一点就完全贴墙）。110° 那一版门板斜着悬在门口
       * 正前方——挡视线还挡走位。163° 让门板沿左侧外墙躺平，
       * 微微离墙那一点角度是"开着的门"和"钉在墙上的板"的区别。
       */
      leaf.rotation.y = -2.85;
      return leaf;
    })(),

    // ---- 门上的赤陶小雨棚（家的暖色记号，来自小店旧版，配色收敛过）----
    ...Array.from({ length: 5 }, (_, i) => {
      const awningW = 2.6;
      const stripeW = awningW / 5;
      return box([stripeW, 0.09, awning], {
        position: [
          doorCenter - awningW / 2 + stripeW * (i + 0.5),
          wallH - 0.5,
          halfD + awning / 2 - 0.02,
        ],
        rotation: [0.3, 0, 0],
        color: i % 2 === 0 ? PALETTE.shopAwningWitch : PALETTE.shopAwningWitchLight,
        castShadow: i % 2 === 0,
      });
    }),
    ...[-1.15, 1.15].map((x) =>
      cylinder(0.055, 0.055, 0.72, 6, {
        position: [doorCenter + x, wallH - 0.88, halfD + 0.28],
        rotation: [Math.PI / 4, 0, 0],
        color: PALETTE.woodDark,
      }),
    ),

    // ---- 招牌：挂在前山墙的竖木板上 ----
    box([1.7, 0.85, 0.14], {
      position: [0, wallH + JETTY_H + 1.05, halfD + JETTY_OUT + 0.1],
      color: PALETTE.woodDark,
    }),
    box([1.46, 0.64, 0.08], {
      position: [0, wallH + JETTY_H + 1.05, halfD + JETTY_OUT + 0.18],
      color: PALETTE.woodLight,
      castShadow: false,
    }),
    // 椅子剪影
    box([0.38, 0.32, 0.05], {
      position: [0, wallH + JETTY_H + 1.16, halfD + JETTY_OUT + 0.22],
      color: PALETTE.woodDark,
      castShadow: false,
    }),
    box([0.46, 0.1, 0.05], {
      position: [0, wallH + JETTY_H + 0.9, halfD + JETTY_OUT + 0.22],
      color: PALETTE.woodDark,
      castShadow: false,
    }),

    // ---- 门口：石阶 + 小黑板 ----
    box([2.4, 0.1, 0.62], { position: [doorCenter, 0.05, halfD + 0.38], color: PALETTE.baseStone }),
    box([2.0, 0.1, 0.45], { position: [doorCenter, 0.15, halfD + 0.27], color: PALETTE.baseStoneDark }),
    ...[-1, 1].map((s) =>
      box([0.05, 0.55, 0.05], {
        position: [half - 0.85 + s * 0.16, 0.32, halfD + 0.66],
        rotation: [s * 0.16, 0, 0],
        color: PALETTE.woodDark,
      }),
    ),
    box([0.42, 0.5, 0.05], {
      position: [half - 0.85, 0.48, halfD + 0.68],
      rotation: [0.16, 0, 0],
      color: PALETTE.wallTrim,
      castShadow: false,
    }),

    // ---- 木栅栏（两侧，正面留门口）----
    ...[-1, 1].flatMap((sx) =>
      [0, 1, 2, 3].map((i) =>
        box([0.08, 0.46, 0.08], {
          position: [sx * (half + 0.45), 0.23, -halfD + 0.4 + i * (d / 3.4)],
          color: PALETTE.woodDark,
        }),
      ),
    ),
    ...[-1, 1].map((sx) =>
      box([0.05, 0.05, d * 0.86], {
        position: [sx * (half + 0.45), 0.38, 0],
        color: PALETTE.woodDark,
        castShadow: false,
      }),
    ),

    // ---- 墙根的小蘑菇 ----
    mushroom(-half + 0.5, halfD + 0.5, "#b4674a"),
    mushroom(-half + 0.95, halfD + 0.68, "#c9a877"),
    mushroom(half - 0.4, halfD + 0.55, "#b4674a"),

    // ---- 室内陈设 ----
    ...furnitureShopInterior(half, halfD),
  ]);
}

export const furnitureShop: BuildingDefinition = {
  buildingId: "furniture_shop",
  localizationKey: "building.furniture_shop",
  descriptionKey: "building.furniture_shop.desc",
  doorOffset: 0,
  // 一间就够。第二间会让"我的货架在哪一间"变成一道没必要的选择题
  maxInstances: 1,
  levels: [
    {
      levelId: "l1",
      localizationKey: "building.furniture_shop.l1",
      descriptionKey: "building.furniture_shop.l1.desc",
      /*
       * 7×7（原 6×6）。用户 2026-08-26："size 小了，要大一些"——
       * 36 格² 站在 9×12 的主屋旁边像个岗亭；49 格² 加挑层和山墙，
       * 体量才对得上话。空院子实测 7×7 还有 39 个合法落点。
       */
      footprint: { width: 7, height: 7 },
      // 走进去才看得到货架——同图内景，和居民房、landCabin 同一条路
      interior: (style) =>
        buildInterior({ width: 7, depth: 7, windows: true, wallHeight: WALL_H }, style),
      buildCost: [{ itemId: "gold", quantity: shopkeepingTuning.buildGold }],
      nextLevelIds: ["l2"],
      upgradeCost: {
        l2: [{ itemId: "gold", quantity: shopkeepingTuning.upgradeGold }],
      },
      build: () => shopShell(7, 1.35),
    },
    {
      levelId: "l2",
      localizationKey: "building.furniture_shop.l2",
      descriptionKey: "building.furniture_shop.l2.desc",
      footprint: { width: 8, height: 8 },
      interior: (style) =>
        buildInterior({ width: 8, depth: 8, windows: true, wallHeight: WALL_H }, style),
      build: () => shopShell(8, 1.6),
    },
  ],
};
