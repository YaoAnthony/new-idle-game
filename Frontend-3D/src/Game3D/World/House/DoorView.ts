import {
  FrontSide,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Object3D,
} from "three";
import { PALETTE } from "../../Visual/palette.js";
import { box, group } from "../../Visual/primitives.js";
import { shojiTexture } from "../../Visual/textures/shoji.js";
import type { WindowAnchor } from "./HouseBuilder.js";

/**
 * 玄关引き戸（V0.13 重做）。
 *
 * ## 之前是什么
 *
 * 一块 `box([w, h, 0.09])` 的实心木板，加两条横档和一个圆把手，
 * 合页在左、往外开 112°。问题不在做工在**语言**：屋里是玄关土间 +
 * 长押 + 榻榻米，外面是切妻顶 + 缘侧，唯独大门是块西式的平开板。
 *
 * ## 现在是什么
 *
 * 两扇引き违い戸（左右各一扇，错开前后两条轨道）。每扇 =
 * 外框（框）+ 组子格（细木条编的格）+ 毛玻璃。这是日式住宅玄关的
 * 标准做法，也顺手解决了一个几何问题：**平开门会撞上门廊的柱子**
 * （门廊挑出 2.4，门开 112° 时门板正好扫到柱子）。推拉门没有这个问题。
 *
 * ## 开门 = 滑进墙里
 *
 * 两扇各自朝两侧滑开。滑出门洞之后它们落在内外两层墙皮之间
 * （内皮在 x=-halfW，外皮在 -halfW-0.12，门板厚 0.06），
 * 两边都看不见——正好演出"戸袋"（门套）的效果，不用另建。
 */

/** 门板厚。要比内外墙皮的间距（0.12）薄，滑进去才藏得住 */
const LEAF_THICKNESS = 0.06;
/** 门面离板芯多远。3 厘米足够拉开深度差，不会再打架 */
const FACE_OFFSET = LEAF_THICKNESS / 2 + 0.004;

/**
 * 一扇引き戸 = 一块木芯 + 两面贴图。
 *
 * **门面上的一切（外框、腰板、毛玻璃、组子、引手）都画在贴图里**，
 * 不再堆盒子——上一版十几个 box 摞在 6 厘米厚度里，组子和玻璃的背面
 * 正好共面，屏幕上是一片爬动的斜纹（z-fighting），而且一扇门就吃掉
 * 12 个 draw call。理由和画法见 Visual/textures/shoji。
 *
 * 木芯保留，不是多余的：它给门一个**厚度**（滑开时能看到侧边那道
 * 深木色），也负责投影——两片纸一样的平面投不出门的影子。
 */
function buildLeaf(
  width: number,
  height: number,
  name: string,
  /** 引手朝哪边。两扇镜像，拉手就都落在中缝旁边——手真正会去抓的位置 */
  pullSide: "left" | "right",
): Object3D {
  const texture = shojiTexture({
    aspect: width / height,
    columns: 2,
    rows: 3,
    pullSide,
  });

  const parts: Object3D[] = [
    box([width, height, LEAF_THICKNESS], {
      color: PALETTE.woodDark,
      position: [0, 0, 0],
    }),
  ];

  // 正反两面各一张。用两个单面平面而不是一个双面的：双面平面只能待在
  // 木芯里面（又是共面），放在外面则背面看不到门，只看到木芯的板
  for (const side of [1, -1] as const) {
    const face = new Mesh(
      new PlaneGeometry(width, height),
      new MeshLambertMaterial({ map: texture, side: FrontSide }),
    );
    face.position.z = side * FACE_OFFSET;
    if (side === -1) face.rotation.y = Math.PI;
    // 投影交给木芯：平面投影会在门缝里投出一条穿帮的黑线
    face.castShadow = false;
    face.receiveShadow = true;
    parts.push(face);
  }

  return group(name, parts);
}

export class DoorView {
  readonly root: Object3D;

  private readonly leaves: Object3D[] = [];
  private readonly travel: number;
  private open = false;
  private slide = 0;

  constructor(anchor: WindowAnchor) {
    this.root = new Object3D();
    this.root.name = `door-${anchor.openingId}`;
    this.root.position.set(...anchor.center);

    const [nx, , nz] = anchor.inward;
    this.root.lookAt(
      anchor.center[0] + nx,
      anchor.center[1],
      anchor.center[2] + nz,
    );

    const w = anchor.width;
    const h = anchor.height * 0.98;
    // 两扇各占一半再多一点：关上时中间压一道缝，不会露出一条透光的线
    const leafWidth = w / 2 + 0.06;
    this.travel = leafWidth;

    // 上下轨（鴨居 / 敷居）：引き戸靠它才站得住，也压住了门洞的上下沿
    this.root.add(
      box([w + 0.1, 0.09, LEAF_THICKNESS * 2.6], {
        color: PALETTE.woodDark,
        position: [0, h / 2 + 0.04, 0],
      }),
      box([w + 0.1, 0.07, LEAF_THICKNESS * 2.6], {
        color: PALETTE.woodDark,
        position: [0, -h / 2 - 0.03, 0],
      }),
    );

    // 左右两扇，前后错开半个门厚——引き违い就是这么错开的
    for (const [i, side] of [-1, 1].entries()) {
      const leaf = buildLeaf(
        leafWidth,
        h - 0.1,
        `door-leaf-${i}`,
        side < 0 ? "right" : "left",
      );
      leaf.position.set(
        (side * leafWidth) / 2,
        0,
        side * LEAF_THICKNESS * 0.62,
      );
      this.leaves.push(leaf);
      this.root.add(leaf);
    }
  }

  setOpen(open: boolean): void {
    this.open = open;
  }

  update(deltaSeconds: number): void {
    const target = this.open ? 1 : 0;
    const smoothing = 1 - Math.exp(-6 * deltaSeconds);
    this.slide += (target - this.slide) * smoothing;

    for (const [i, leaf] of this.leaves.entries()) {
      const side = i === 0 ? -1 : 1;
      leaf.position.x =
        (side * this.travel) / 2 + side * this.travel * this.slide;
    }
  }
}
