import {
  outdoorDeckRect,
  type DeckRect,
  type OutdoorDeck,
  type RoomSave,
} from "core";
import { Object3D } from "three";
import { PALETTE, jitterShade } from "../../Visual/palette.js";
import { box } from "../../Visual/primitives.js";
import { createQuadMesh, faced, type Quad } from "../quadMesh.js";
import { slopeRafters } from "./eaveRafters.js";

/**
 * 缘侧（縁側）+ 下檐（庇）（V0.13）。
 *
 * ## 为什么这两样在同一个文件里
 *
 * 因为它们**是同一件事**。查证（2026-08-08）：濡れ縁的进深 60~90cm，
 * 而木造住宅的檐最多挑 90~120cm——这个巧合不是巧合，**缘侧的进深
 * 就是被屋檐的挑出卡死的**：缘侧必须待在檐影里，否则一下雨就废了。
 *
 * 所以不是"先盖屋顶，再往外贴一条走廊"，是**檐挑出来，挑出来那片
 * 阴影底下就是缘侧**。分成两个模块写，迟早会改了一边忘了另一边，
 * 变成一条淋雨的板子或者一片罩着空地的檐。
 *
 * 它同时也是主屋顶的解药：24×20 的房子扣一整片单脊顶就是仓库，
 * 拆成"主屋顶只管本体 + 下檐罩缘侧"两层，中间露一段墙，横向分层
 * 出来，体量就碎了（见 Roof.ts 文件头的账）。
 *
 * ## 尺寸的来历
 *
 * - **台面 = 室内地板 = 世界 y 0**。缘侧不是"比地板高的台子"，它就是
 *   室内那块架空楼板伸到屋外的一截，和地板永远齐平（一度做成高 0.4 的
 *   台子，关系正好反了：站屋里得仰视廊子）。离地多高见 map 的 floorLevel。
 *   查到的 30~40cm 说的正是那个床高，而不是缘侧相对地板的高度。
 * - 进深 2 格：按房子的尺度（24×20，比民居大得多）从 60~90cm 放大。
 * - 下檐比缘侧再多挑 0.5：雨要落在台子外面，不能顺着檐口滴在板沿上。
 * - 檐底露化妆椽子——见 eaveRafters 的注释。
 *
 * ## 走不上去
 *
 * 缘侧在通行判定里是**实体**（Game/State/world/walkable）：角色控制器
 * 没有地形高度，踩上去人会陷进木板里。现实里缘侧也是从屋里踏出来的，
 * 而北墙是窗不是门——本来就走不上去。真正的用法是站在院子里坐到边上。
 */

/** 下檐贴在墙上的高度。北墙那扇落地窗顶在 3，正好从窗顶起 */
const HISASHI_ATTACH = 3.2;
/** 下檐比缘侧多挑出多少（雨滴在台子外面） */
const HISASHI_OVERHANG = 0.5;
/** 下檐从贴墙处到檐口降多少。约 12°，庇该有的缓坡 */
const HISASHI_DROP = 0.55;
/** 檐柱间距 */
const POST_SPACING = 4.3;

type DeckGeometry = {
  deck: OutdoorDeck;
  rect: DeckRect;
  /** 往外的方向（单位向量的两个分量之一为 ±1） */
  outward: { x: number; z: number };
  /** 坡沿哪个轴下降（和 outward 同轴） */
  axis: "x" | "z";
  /** 墙面线在坡轴上的绝对值 */
  innerAlong: number;
  /** 下檐檐口在坡轴上的绝对值 */
  outerAlong: number;
  /** 坡轴的正负侧 */
  side: -1 | 1;
};

function geometryOf(deck: OutdoorDeck, room: RoomSave): DeckGeometry {
  const rect = outdoorDeckRect(deck, room.floorGrid);
  const halfW = room.floorGrid.width / 2;
  const halfD = room.floorGrid.height / 2;

  const northSouth = deck.side === "north" || deck.side === "south";
  const axis = northSouth ? "z" : "x";
  const side =
    deck.side === "north" || deck.side === "west" ? (-1 as const) : (1 as const);
  const innerAlong = northSouth ? halfD : halfW;

  return {
    deck,
    rect,
    outward: northSouth ? { x: 0, z: side } : { x: side, z: 0 },
    axis,
    innerAlong,
    outerAlong: innerAlong + deck.depth + HISASHI_OVERHANG,
    side,
  };
}

/** 沿墙方向的跨度（和坡轴垂直的那个方向） */
function spanOf(geometry: DeckGeometry): { from: number; to: number } {
  return geometry.axis === "z"
    ? { from: geometry.rect.minX, to: geometry.rect.maxX }
    : { from: geometry.rect.minZ, to: geometry.rect.maxZ };
}

/** 木台的顶面 + 四周的侧板 */
function deckQuads(geometry: DeckGeometry, floorLevel: number): Quad[] {
  const { rect } = geometry;
  const quads: Quad[] = [];
  // 台面就是室内地板的标高。侧板从这儿一直垂到院子地面（-floorLevel），
  // 那道深色的边就是"这块楼板是架空的"的全部说明
  const top = 0;
  const bottom = -floorLevel;

  // 顶面按板条分色：板缝**平行于墙**（传统濡れ縁的铺法），
  // 所以沿"往外"的方向一条条排
  const acrossZ = geometry.axis === "z";
  const bandFrom = acrossZ ? rect.minZ : rect.minX;
  const bandTo = acrossZ ? rect.maxZ : rect.maxX;
  const spanFrom = acrossZ ? rect.minX : rect.minZ;
  const spanTo = acrossZ ? rect.maxX : rect.maxZ;

  const PLANK = 0.34;
  const bands = Math.max(1, Math.round((bandTo - bandFrom) / PLANK));
  const bandWidth = (bandTo - bandFrom) / bands;

  const at = (span: number, band: number, y: number): [number, number, number] =>
    acrossZ ? [span, y, band] : [band, y, span];

  for (let i = 0; i < bands; i += 1) {
    const b0 = bandFrom + i * bandWidth;
    const b1 = b0 + bandWidth;
    const base = i % 2 === 0 ? PALETTE.deckPlank : PALETTE.deckPlankAlt;
    quads.push({
      corners: faced(
        [
          at(spanFrom, b0, top),
          at(spanTo, b0, top),
          at(spanTo, b1, top),
          at(spanFrom, b1, top),
        ],
        [0, 1, 0],
      ),
      normal: [0, 1, 0],
      color: jitterShade(base, i, 3, 0.03),
    });
  }

  // 四周的侧板（台沿）。贴墙那一侧不建——看不见
  const wallBand = geometry.side === -1 ? bandTo : bandFrom;
  const sides: Array<{ normal: [number, number, number]; corners: [number, number, number][] }> = [];

  // 外沿（人坐的那条边）
  const outerBand = geometry.side === -1 ? bandFrom : bandTo;
  const outerNormal: [number, number, number] = acrossZ
    ? [0, 0, geometry.side]
    : [geometry.side, 0, 0];
  sides.push({
    normal: outerNormal,
    corners: [
      at(spanFrom, outerBand, top),
      at(spanTo, outerBand, top),
      at(spanTo, outerBand, bottom),
      at(spanFrom, outerBand, bottom),
    ],
  });

  // 两个端头
  for (const [span, dir] of [
    [spanFrom, -1],
    [spanTo, 1],
  ] as const) {
    const normal: [number, number, number] = acrossZ ? [dir, 0, 0] : [0, 0, dir];
    sides.push({
      normal,
      corners: [
        at(span, outerBand, top),
        at(span, wallBand, top),
        at(span, wallBand, bottom),
        at(span, outerBand, bottom),
      ],
    });
  }

  for (const [i, face] of sides.entries()) {
    quads.push({
      corners: faced(face.corners, face.normal),
      normal: face.normal,
      color: jitterShade(PALETTE.deckEdge, i, 5, 0.02),
    });
  }

  return quads;
}

/** 下檐：一片缓坡 + 檐里 + 化妆椽子 + 檐口板 */
function hisashiOf(geometry: DeckGeometry, floorLevel: number): Object3D {
  const { axis, side, innerAlong, outerAlong } = geometry;
  const span = spanOf(geometry);
  const run = outerAlong - innerAlong;
  const pitch = HISASHI_DROP / run;
  const outerY = HISASHI_ATTACH - HISASHI_DROP;

  const group = new Object3D();
  group.name = `hisashi-${geometry.deck.deckId}`;

  const at = (s: number, along: number, y: number): [number, number, number] =>
    axis === "z" ? [s, y, along] : [along, y, s];

  const aOuter = side * outerAlong;

  // 坡面（上）+ 檐里（下）。分段只为了色差，不需要很多段
  const quads: Quad[] = [];
  const ROWS = 4;
  const COLS = Math.max(1, Math.round((span.to - span.from) / 2));
  const colWidth = (span.to - span.from) / COLS;
  const tangent = Math.hypot(HISASHI_DROP, run);
  const upNormal: [number, number, number] =
    axis === "z"
      ? [0, run / tangent, (side * HISASHI_DROP) / tangent]
      : [(side * HISASHI_DROP) / tangent, run / tangent, 0];
  const downNormal: [number, number, number] = [
    -upNormal[0],
    -upNormal[1],
    -upNormal[2],
  ];

  for (let row = 0; row < ROWS; row += 1) {
    const t0 = row / ROWS;
    const t1 = (row + 1) / ROWS;
    // t=0 在檐口，t=1 贴墙
    const a0 = side * (outerAlong - t0 * run);
    const a1 = side * (outerAlong - t1 * run);
    const y0 = outerY + t0 * HISASHI_DROP;
    const y1 = outerY + t1 * HISASHI_DROP;

    for (let col = 0; col < COLS; col += 1) {
      const s0 = span.from + col * colWidth;
      const s1 = s0 + colWidth;
      const corners: [number, number, number][] = [
        at(s0, a0, y0),
        at(s1, a0, y0),
        at(s1, a1, y1),
        at(s0, a1, y1),
      ];
      quads.push({
        corners: faced(corners, upNormal),
        normal: upNormal,
        color: jitterShade(
          row % 2 === 0 ? PALETTE.roofTile : PALETTE.roofTileAlt,
          col,
          row,
          0.03,
        ),
      });
      quads.push({
        corners: faced(
          corners.map(([x, y, z]) => [x, y - 0.03, z] as [number, number, number]),
          downNormal,
        ),
        normal: downNormal,
        color: jitterShade(
          row % 2 === 0 ? PALETTE.eaveSoffit : PALETTE.eaveSoffitAlt,
          col,
          row,
          0.025,
        ),
      });
    }
  }
  group.add(createQuadMesh(quads, `hisashi-slope-${geometry.deck.deckId}`, { castShadow: true }));

  // 化妆椽子：整段都铺（下檐底下全程抬头可见，不像主屋顶只有挑出那截）
  group.add(
    createQuadMesh(
      slopeRafters({
        axis,
        side,
        innerAlong,
        outerAlong,
        outerY: outerY - 0.04,
        pitch,
        spanFrom: span.from,
        spanTo: span.to,
        spacing: 1.1,
      }),
      `hisashi-rafters-${geometry.deck.deckId}`,
    ),
  );

  // 檐口板：收住檐的断面
  const fasciaLength = span.to - span.from;
  const fascia = box(
    axis === "z" ? [fasciaLength, 0.2, 0.1] : [0.1, 0.2, fasciaLength],
    {
      color: PALETTE.woodDark,
      position:
        axis === "z"
          ? [(span.from + span.to) / 2, outerY - 0.03, aOuter]
          : [aOuter, outerY - 0.03, (span.from + span.to) / 2],
    },
  );
  group.add(fascia);

  // 檐柱：从缘侧台面撑到檐口。**廊子读成廊子全靠这排柱子**——
  // 没有柱的檐是一片悬空的板，有了柱才是"外面那条走廊"。
  //
  // 柱子踩在台面**最外那道边**上（不是往里缩）：人现在能走上缘侧了，
  // 往里缩的柱子正好立在走道中间，会被人直接穿过去；贴着外沿则是
  // "走到头就是柱子和栏杆"，人自然停在里侧。
  const postAlong = side * (outerAlong - HISASHI_OVERHANG - 0.09);
  const posts = Math.max(2, Math.round(fasciaLength / POST_SPACING));
  for (let i = 0; i <= posts; i += 1) {
    const s = span.from + 0.25 + ((fasciaLength - 0.5) * i) / posts;
    // 台面就是 y=0，柱子从这儿起
    const height = outerY + 0.1;
    group.add(
      box([0.16, height, 0.16], {
        color: PALETTE.wallTrim,
        position: at(s, postAlong, height / 2),
      }),
    );
  }

  // 缘束：从台面垂到院子地面的矮墩子。**它才是"这块楼板是架空的"
  // 那句话的说明**——没有它，台沿那道深色只像一条粗踢脚
  for (let i = 0; i <= posts; i += 1) {
    const s = span.from + 0.6 + ((fasciaLength - 1.2) * i) / posts;
    group.add(
      box([0.14, floorLevel, 0.14], {
        color: PALETTE.woodDark,
        position: at(s, postAlong, -floorLevel / 2),
      }),
    );
  }

  return group;
}

export function buildEngawa(
  room: RoomSave,
  decks: readonly OutdoorDeck[],
  /** 室内地板比院子高多少。台面在 0，侧板和缘束垂到 -floorLevel */
  floorLevel: number,
): {
  /** 木台 + 沓脱石。不参与遮挡淡出：它在地板高度，挡不到镜头 */
  deck: Object3D;
  /** 下檐。参与遮挡淡出：镜头俯角一大就会盖住坐在缘侧的人 */
  hisashi: Object3D;
} {
  const deckRoot = new Object3D();
  deckRoot.name = "engawa-decks";
  const hisashiRoot = new Object3D();
  hisashiRoot.name = "engawa-hisashi";

  for (const deck of decks) {
    const geometry = geometryOf(deck, room);
    deckRoot.add(
      createQuadMesh(deckQuads(geometry, floorLevel), `engawa-${deck.deckId}`),
    );
    hisashiRoot.add(hisashiOf(geometry, floorLevel));
  }

  // ---- 沓脱石：踩着上下缘侧的那块石头 ----
  //
  // 摆在北面落地窗正前方（墙格 x17~21 → 世界 x 5~10）。地板架空之后
  // 它**真的是一级台阶**了：院子在 -floorLevel、台面在 0，石头顶面卡在
  // 中间，一步拆成两步——沓脱石本来就是干这个的，不是装饰。
  const north = decks.find((deck) => deck.side === "north");
  if (north) {
    const rect = outdoorDeckRect(north, room.floorGrid);
    // 顶面落在院子和台面的正中间，两级各 ~0.22——都在一步之内
    const top = -floorLevel / 2;
    const stone = box([1.2, floorLevel, 0.85], {
      color: PALETTE.steppingStone,
      position: [7.5, top - floorLevel / 2, rect.minZ - 0.6],
    });
    stone.name = "kutsunugi-ishi";
    deckRoot.add(stone);
  }

  return { deck: deckRoot, hisashi: hisashiRoot };
}
