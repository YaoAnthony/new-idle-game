import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  type ColorRepresentation,
} from "three";
import { PALETTE } from "../palette.js";

/**
 * 水獭商人：背着一个比自己还高的大背包，三天来一趟收家具。
 *
 * ## 造型全部照用户 2026-08-24 给的两张参考图
 *
 * 三视图、比例标注（角色身高约 65cm、背包主体约身高的 1.6 倍）、背包
 * 六个部件的拆解、以及九个十六进制色号都在图上。**颜色一个没改**，
 * 原样进了 `PALETTE.otter*`——这只是全新一支，配色本身就是辨识度，
 * 借最接近的现成色号会把它变成"又一只棕色小动物"。
 *
 * ## 两种质感是刻意的，不是没统一
 *
 * **毛用平滑着色，装备用平面着色。** 参考图上就是这个对比：毛是软的
 * 团块，帆布和皮带是有折的硬货。舒舒那份注释立过判据——布景可以概括、
 * 活物要圆润；这只两样都有，所以两套都用：身体走 `soft()`（同舒舒），
 * 背包和皮件走全场通用的平面着色小面。
 *
 * ## 剪影：背包才是主角
 *
 * 石傀儡那次的教训是"人形的辨识度几乎全在剪影上"。这只的剪影题眼不在
 * 身体而在**背包**——一个比人还高、上面捆着毯子卷、侧面吊着油灯和鱼牌
 * 的大包。所以背包做足高度和外挂件，身体反而收得圆而小：远远看过去
 * 先认出"一个驮着家当的旅人"，走近才看清是只水獭。
 *
 * ## 尺寸
 *
 * 参考图标的是 65cm 身高、背包 1.6 倍。**背包按 1.0 倍身高做**，
 * 不照搬 1.6——图上那个比例是立绘的夸张，放进 32° 俯角的实机里会挡住
 * 半个身子，而且 `collisionRadius` 得跟着涨到挤不过院子的窄道。
 * 图末那句"以上尺寸与比例仅供参考，具体以实际项目需求调整"就是这个意思。
 * 简化模型参考那一栏画的也是这个量级。
 *
 * ## 动画
 *
 * `userData.animate` 三态（PetView 每帧调）：
 * - **idle**：呼吸起伏 + 背包跟着轻轻压一下（重物的分量）
 * - **走**：两条短腿交替、身体左右晃、**尾巴摆**、油灯吊着晃（惯性滞后）
 * - **睡**：整只沉下去、耳朵垂、眼睛换成"︶"
 */

// ---- 材质 ----

const softCache = new Map<string, MeshLambertMaterial>();
/** 毛用的平滑材质。和 primitives 的平面着色是两套，见文件头 */
function soft(value: ColorRepresentation): MeshLambertMaterial {
  const key = String(value);
  const cached = softCache.get(key);
  if (cached) return cached;
  const material = new MeshLambertMaterial({ color: value, flatShading: false });
  softCache.set(key, material);
  return material;
}

const hardCache = new Map<string, MeshLambertMaterial>();
/** 装备用的平面着色。帆布的折、皮带的棱靠它才读得出来 */
function hard(value: ColorRepresentation): MeshLambertMaterial {
  const key = String(value);
  const cached = hardCache.get(key);
  if (cached) return cached;
  const material = new MeshLambertMaterial({ color: value, flatShading: true });
  hardCache.set(key, material);
  return material;
}

type Opts = {
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  segments?: [number, number];
  castShadow?: boolean;
  /** 眼珠、胡须这类小件不描边：反相外壳在小尺寸上是一粒粒黑渣 */
  noOutline?: boolean;
};

function ball(radius: number, color: ColorRepresentation, o: Opts = {}): Mesh {
  const [w, h] = o.segments ?? [24, 18];
  const mesh = new Mesh(new SphereGeometry(radius, w, h), soft(color));
  if (o.position) mesh.position.set(...o.position);
  if (o.scale) mesh.scale.set(...o.scale);
  if (o.rotation) mesh.rotation.set(...o.rotation);
  mesh.castShadow = o.castShadow ?? true;
  if (o.noOutline) mesh.userData.noOutline = true;
  return mesh;
}

function slab(
  size: [number, number, number],
  color: ColorRepresentation,
  o: Opts = {},
): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), hard(color));
  if (o.position) mesh.position.set(...o.position);
  if (o.scale) mesh.scale.set(...o.scale);
  if (o.rotation) mesh.rotation.set(...o.rotation);
  mesh.castShadow = o.castShadow ?? true;
  if (o.noOutline) mesh.userData.noOutline = true;
  return mesh;
}

function tube(
  rTop: number,
  rBottom: number,
  height: number,
  color: ColorRepresentation,
  o: Opts = {},
): Mesh {
  const mesh = new Mesh(
    new CylinderGeometry(rTop, rBottom, height, o.segments?.[0] ?? 12),
    hard(color),
  );
  if (o.position) mesh.position.set(...o.position);
  if (o.scale) mesh.scale.set(...o.scale);
  if (o.rotation) mesh.rotation.set(...o.rotation);
  mesh.castShadow = o.castShadow ?? true;
  if (o.noOutline) mesh.userData.noOutline = true;
  return mesh;
}

// ---- 体格。全集中在这，"再矮一点"是改一个数 ----

/**
 * 身高（米）。参考图标 65cm。分层：
 * 脚 0~0.10 / 躯干 0.10~0.42 / 头 0.38~0.66。头占全高约 43%——
 * 参考图侧栏标的「1 头身 + 1.5 头身」就是这个量级，可爱全在这条比例上。
 */
const BODY_H = 0.68;
/**
 * 躯干中心离地。
 *
 * **纵向层次是这只最容易做砸的一件事**：躯干顶（TORSO_Y + 半高）必须
 * 低于头球底，中间那条缝留给围巾。第一版躯干顶 0.435、头底 0.36，
 * 躯干反过来盖住头下半截——脸只剩一条，围巾整圈埋在肉里。
 * 现在：躯干顶 0.415 / 围巾 0.40 / 头底 0.41，三层刚好叠住不打架。
 */
const TORSO_Y = 0.26;
/** 躯干三轴半径：圆而略扁，肚子鼓 */
const TORSO = [0.165, 0.155, 0.14] as const;
/** 头中心。脖子极短但**不是没有**——留出围巾那一圈的高度 */
const HEAD_Y = 0.545;
const HEAD_R = 0.145;
/**
 * 背包主体高度。
 *
 * 图上标 1.6 倍身高，实机收到 **0.78 倍**：第一版按 1.0 倍做出来在侧视图里
 * 读成一块**立在身后的板**（高 0.65、深只有 0.19，比例是块门板不是个包）。
 * 包要读成"塞满了的帆布袋"，关键不是高而是**深**——深度提到 0.28、
 * 宽度提到 0.36，高度反而降下来，剪影立刻从"衣柜"变成"行囊"。
 */
const PACK_H = BODY_H * 0.66;
/** 包底离地。够低才像背在背上，不像插在地里 */
const PACK_BOTTOM = 0.155;

function buildHead(): {
  pivot: Object3D;
  ears: Object3D[];
  eyesOpen: Object3D;
  eyesClosed: Object3D;
} {
  const pivot = new Object3D();
  pivot.name = "head-pivot";
  pivot.position.set(0, HEAD_Y - 0.06, 0);

  const head = new Object3D();
  head.position.set(0, 0.06, 0);
  pivot.add(head);

  // 头骨：略扁略宽的球。水獭的头是横着圆的，不是竖着圆的
  head.add(
    ball(HEAD_R, PALETTE.otterFur, { scale: [1.08, 0.94, 1.0], segments: [32, 24] }),
  );

  /*
   * 奶白的口鼻区。**只包嘴不包眼**——第一版这块又大又高，把两只眼睛
   * 整个吞进浅色里，正面看是一对贴在白底上的黑豆子（"googly eyes"）。
   * 参考图上的分界很清楚：眼睛长在**棕毛**上，奶白从鼻梁往下才开始。
   * 这条交界线的高度是这张脸最要紧的一个数。
   */
  head.add(
    ball(0.092, PALETTE.otterCream, {
      position: [0, -0.07, 0.075],
      scale: [1.1, 0.66, 0.88],
      segments: [24, 18],
    }),
  );

  // 两颊鼓肉：撑在口鼻两侧，水獭的宽脸全靠它
  for (const side of [-1, 1]) {
    head.add(
      ball(0.055, PALETTE.otterCream, {
        position: [side * 0.058, -0.07, 0.078],
        scale: [1, 0.86, 0.95],
        segments: [16, 12],
      }),
    );
  }

  // 鼻头：小而钝的深棕三角块（参考图上是圆钝的，不是猫的尖鼻）
  head.add(
    ball(0.028, PALETTE.otterFurDeep, {
      position: [0, -0.052, 0.148],
      scale: [1.3, 0.8, 0.7],
      segments: [14, 10],
      noOutline: true,
    }),
  );

  // 抿嘴："︶"一条。参考图的表情组里，闭嘴那几张全靠这一笔
  const mouth = new Mesh(
    new TorusGeometry(0.026, 0.005, 6, 16, Math.PI * 0.9),
    soft(PALETTE.otterFurDeep),
  );
  mouth.position.set(0, -0.088, 0.142);
  mouth.rotation.set(-0.15, 0, Math.PI);
  mouth.castShadow = false;
  mouth.userData.noOutline = true;
  head.add(mouth);

  // ---- 耳朵：小而圆，贴在头两侧偏后（水獭的耳朵几乎埋在毛里）----
  const ears: Object3D[] = [];
  for (const side of [-1, 1]) {
    const ear = new Object3D();
    ear.name = side < 0 ? "ear-left" : "ear-right";
    /*
     * 耳朵要**探进剪影**。第一版贴在头侧偏后、半径 0.036，
     * 从任何角度看都被头球和背包带吞掉——等于没有。水獭的耳朵确实小，
     * 但"小"和"看不见"是两回事：轮廓上留两个凸起，读的人才知道那是头。
     */
    ear.position.set(side * 0.108, 0.105, -0.01);
    ear.add(
      ball(0.045, PALETTE.otterFur, {
        scale: [1, 1, 0.6],
        segments: [14, 10],
      }),
    );
    ear.add(
      ball(0.026, PALETTE.otterCream, {
        position: [side * 0.008, -0.002, 0.024],
        scale: [1, 1, 0.45],
        segments: [12, 10],
        noOutline: true,
      }),
    );
    head.add(ear);
    ears.push(ear);
  }

  // ---- 眼睛：睁 / 闭两组 ----
  const eyesOpen = new Object3D();
  eyesOpen.name = "eyes-open";
  const eyesClosed = new Object3D();
  eyesClosed.name = "eyes-closed";
  head.add(eyesOpen, eyesClosed);

  for (const side of [-1, 1]) {
    const x = side * 0.058;
    // 大而圆的黑眼珠，位置**低而分得开**——可爱的比例全在这两条上
    eyesOpen.add(
      ball(0.032, PALETTE.petEye, {
        position: [x, 0.035, 0.118],
        segments: [16, 12],
        castShadow: false,
        noOutline: true,
      }),
    );
    // 高光点：不受光的纯白小球。毛绒玩具的"活"一半在这颗点上
    const sparkle = new Mesh(
      new SphereGeometry(0.011, 8, 6),
      new MeshBasicMaterial({ color: "#ffffff" }),
    );
    sparkle.position.set(x - side * 0.009, 0.047, 0.142);
    sparkle.castShadow = false;
    sparkle.userData.noOutline = true;
    eyesOpen.add(sparkle);

    // 睡着的"︶"。开口向上 = 睡得香；反过来立刻变愁眉苦脸
    const closed = new Mesh(
      new TorusGeometry(0.03, 0.006, 6, 16, Math.PI * 0.85),
      soft(PALETTE.otterFurDeep),
    );
    closed.position.set(x, 0.035, 0.126);
    closed.rotation.set(0, 0, Math.PI * 1.075);
    closed.castShadow = false;
    closed.userData.noOutline = true;
    eyesClosed.add(closed);
  }
  eyesClosed.visible = false;

  // 胡须：每边三根细杆。小尺寸下不描边，否则是三粒黑渣
  for (const side of [-1, 1]) {
    for (const [i, tilt] of [0.22, 0, -0.2].entries()) {
      const whisker = tube(0.0016, 0.0016, 0.085, PALETTE.otterCream, {
        position: [side * 0.088, -0.03 + i * 0.012, 0.095],
        rotation: [0, 0, side * (Math.PI / 2 - 0.25) + tilt * side],
        segments: [4, 4],
        castShadow: false,
        noOutline: true,
      });
      head.add(whisker);
    }
  }

  return { pivot, ears, eyesOpen, eyesClosed };
}

/**
 * 大背包。**六个部件按参考图的拆解编号来**：
 * ① 鱼牌（木板）② 油灯 ③ 小袋（储物）④ 小包（布袋）
 * ⑤ 帐篷/毯子（卷）⑥ 贴布（装饰）
 *
 * 返回油灯的枢轴——走路时它要吊着晃，那是这只角色最活的一个细节。
 */
function buildPack(): { pack: Object3D; lantern: Object3D; straps: Object3D } {
  const pack = new Object3D();
  pack.name = "pack";
  /*
   * 包**贴着背**（z = −0.13，躯干后表面在 −0.15），底在 PACK_BOTTOM。
   * 第一版 z = −0.2、底在 0.22，从侧面看是一块**立在他身后**的板子，
   * 和人之间还有一条缝——那不是背着，是并排站着。
   */
  pack.position.set(0, PACK_BOTTOM, -0.145);

  const W = 0.3;
  const D = 0.26;

  // 主体帆布。宽 × 深都大过躯干，所以从正面看它是"露出两肩"的
  pack.add(
    slab([W, PACK_H, D], PALETTE.otterCanvas, {
      position: [0, PACK_H / 2, 0],
    }),
  );
  /*
   * 侧面的软肉：包是**塞满的**不是空箱，两侧要略鼓。
   *
   * **一定要小**。第一版给了半径 0.11、纵向再拉 1.5 倍，侧视图上那颗球
   * 比包的侧面还大，读成"绑了个大鸭蛋在腰上"。软肉的作用只是把方盒的
   * 竖棱啃圆一点点——它该是察觉不到的，一旦看得出是个球就说明过头了。
   */
  for (const side of [-1, 1]) {
    pack.add(
      ball(0.055, PALETTE.otterCanvas, {
        position: [side * (W / 2 - 0.012), PACK_H * 0.45, 0],
        scale: [0.45, PACK_H * 6.2, D * 3.1],
        segments: [12, 10],
      }),
    );
  }
  // 翻盖：顶上一块略大的板，微微前倾，压住袋口
  pack.add(
    slab([W * 1.06, 0.07, D * 1.06], PALETTE.otterCanvas, {
      position: [0, PACK_H - 0.02, 0.006],
      rotation: [0.06, 0, 0],
    }),
  );

  // 两条竖皮带 + 铜扣
  for (const side of [-1, 1]) {
    pack.add(
      slab([0.038, PACK_H * 0.95, D * 1.04], PALETTE.otterLeather, {
        position: [side * 0.095, PACK_H * 0.5, 0],
      }),
    );
    pack.add(
      slab([0.05, 0.032, 0.016], PALETTE.otterBrass, {
        position: [side * 0.095, PACK_H * 0.3, D / 2 + 0.01],
        noOutline: true,
      }),
    );
  }
  // 一条横皮带
  pack.add(
    slab([W * 1.05, 0.032, D * 1.05], PALETTE.otterLeather, {
      position: [0, PACK_H * 0.66, 0],
    }),
  );

  // ⑤ 顶上捆着的毯子卷：绿色，横躺。**剪影最上面那一笔**
  pack.add(
    tube(0.068, 0.068, W * 0.96, PALETTE.otterScarf, {
      position: [0, PACK_H + 0.06, 0.005],
      rotation: [0, 0, Math.PI / 2],
      segments: [14, 14],
    }),
  );
  for (const side of [-1, 1]) {
    pack.add(
      tube(0.032, 0.032, 0.012, PALETTE.otterFurDeep, {
        position: [side * (W * 0.48 + 0.006), PACK_H + 0.06, 0.005],
        rotation: [0, 0, Math.PI / 2],
        segments: [12, 12],
        noOutline: true,
      }),
    );
  }

  // ① 鱼牌：左侧吊一块小木板，上面一条蓝鱼。**他的招牌**
  const sign = new Object3D();
  sign.position.set(-(W / 2 + 0.06), PACK_H * 0.74, 0.04);
  sign.rotation.z = 0.12;
  sign.add(slab([0.09, 0.058, 0.012], PALETTE.otterCanvas, {}));
  sign.add(
    slab([0.044, 0.018, 0.004], PALETTE.otterVest, {
      position: [0, 0, 0.009],
      noOutline: true,
    }),
  );
  sign.add(
    tube(0.003, 0.003, 0.055, PALETTE.otterLeather, {
      position: [0, 0.055, 0],
      segments: [6, 6],
      noOutline: true,
    }),
  );
  pack.add(sign);

  // ② 油灯：右侧吊着。**全身唯一的高饱和**，走路时唯一会摆的挂件
  const lantern = new Object3D();
  lantern.name = "lantern-pivot";
  lantern.position.set(W / 2 + 0.055, PACK_H * 0.8, 0.04);
  lantern.add(
    tube(0.0025, 0.0025, 0.055, PALETTE.otterLeather, {
      position: [0, -0.028, 0],
      segments: [6, 6],
      noOutline: true,
    }),
  );
  lantern.add(
    tube(0.024, 0.026, 0.055, PALETTE.otterBrass, {
      position: [0, -0.085, 0],
      segments: [10, 10],
    }),
  );
  lantern.add(
    slab([0.054, 0.013, 0.054], PALETTE.otterLeather, {
      position: [0, -0.055, 0],
    }),
  );
  lantern.add(
    slab([0.054, 0.013, 0.054], PALETTE.otterLeather, {
      position: [0, -0.116, 0],
    }),
  );
  const flame = new Mesh(
    new SphereGeometry(0.014, 10, 8),
    new MeshBasicMaterial({ color: "#ffd98a" }),
  );
  flame.position.set(0, -0.085, 0);
  flame.castShadow = false;
  flame.userData.noOutline = true;
  lantern.add(flame);
  pack.add(lantern);

  // ③④ 两个小布袋吊在下沿
  for (const [i, side] of [-1, 1].entries()) {
    pack.add(
      ball(0.036, PALETTE.otterCanvas, {
        position: [side * 0.13, 0.055 - i * 0.014, D / 2 - 0.01],
        scale: [1, 1.15, 0.85],
        segments: [12, 10],
      }),
    );
    pack.add(
      tube(0.013, 0.018, 0.014, PALETTE.otterLeather, {
        position: [side * 0.13, 0.092 - i * 0.014, D / 2 - 0.01],
        segments: [8, 8],
        noOutline: true,
      }),
    );
  }

  // ⑥ 背面的贴布装饰
  pack.add(
    slab([0.085, 0.06, 0.006], PALETTE.otterCream, {
      position: [0, PACK_H * 0.4, -(D / 2 + 0.003)],
      rotation: [0, 0, 0.1],
      noOutline: true,
    }),
  );

  /*
   * **肩带**：从包顶前沿翻过肩膀、斜下来扣在胸前。
   *
   * 这是第一版最要命的漏项。没有肩带，包和人之间没有任何连接，
   * 无论把包挪多近，眼睛都读成"两个挨着的东西"而不是"他背着它"。
   * 一条从肩到胸的斜带就够——它把两个体积**缝**在一起。
   *
   * 挂在 body 下面（不在 pack 下面）：肩带跟着身体走，包跟着肩带走，
   * 顺序反了的话身体前倾时肩带会浮在胸口外面。
   */
  const straps = new Object3D();
  straps.name = "pack-straps";
  for (const side of [-1, 1]) {
    straps.add(
      slab([0.042, 0.26, 0.03], PALETTE.otterLeather, {
        position: [side * 0.098, TORSO_Y + 0.06, 0.135],
        rotation: [0.16, 0, side * 0.18],
      }),
    );
    // 肩头那一段：翻过肩膀连到包上
    straps.add(
      slab([0.042, 0.03, 0.2], PALETTE.otterLeather, {
        position: [side * 0.098, TORSO_Y + 0.155, 0.0],
        rotation: [0.1, 0, 0],
      }),
    );
  }

  return { pack, lantern, straps };
}

export function buildOtterTrader(): Object3D {
  const root = new Object3D();
  root.name = "otter-trader";

  /*
   * `rig` 是整个人：走路的上下颠簸动它，**不动 root**。
   * root.position 是 PetView 每帧用来贴地面高度的，动它等于把地形
   * 覆盖掉——石傀儡浮空 0.45 米那次就是这么来的。
   */
  const rig = new Object3D();
  rig.name = "rig";
  root.add(rig);

  const body = new Object3D();
  body.name = "body";
  rig.add(body);

  // ---- 躯干：圆滚滚，肚子是奶白的 ----
  body.add(
    ball(TORSO[1], PALETTE.otterFur, {
      position: [0, TORSO_Y, 0],
      scale: [TORSO[0] / TORSO[1], 1, TORSO[2] / TORSO[1]],
      segments: [28, 20],
    }),
  );
  // 肚皮：浅色的一大片，从胸口一直到裆
  body.add(
    ball(0.15, PALETTE.otterCream, {
      position: [0, TORSO_Y - 0.025, 0.062],
      scale: [0.92, 1.02, 0.72],
      segments: [24, 18],
    }),
  );

  // ---- 背心：靛蓝，敞怀（两片前襟 + 一圈背） ----
  for (const side of [-1, 1]) {
    body.add(
      ball(0.155, PALETTE.otterVest, {
        position: [side * 0.075, TORSO_Y + 0.01, 0.02],
        scale: [0.62, 1.0, 0.92],
        segments: [20, 16],
      }),
    );
  }
  body.add(
    ball(0.16, PALETTE.otterVestShade, {
      position: [0, TORSO_Y + 0.01, -0.045],
      scale: [1.02, 0.98, 0.62],
      segments: [22, 16],
    }),
  );

  // ---- 皮带 + 铜扣 ----
  body.add(
    tube(0.172, 0.172, 0.035, PALETTE.otterLeather, {
      position: [0, TORSO_Y - 0.085, 0],
      scale: [1, 1, 0.86],
      segments: [20, 20],
    }),
  );
  body.add(
    slab([0.045, 0.038, 0.014], PALETTE.otterBrass, {
      position: [0, TORSO_Y - 0.085, 0.145],
      noOutline: true,
    }),
  );

  // 腰包：右胯一个小绿包（参考图的"腰包"那件）
  body.add(
    slab([0.07, 0.06, 0.035], PALETTE.otterScarf, {
      position: [0.13, TORSO_Y - 0.11, 0.055],
      rotation: [0, -0.3, 0],
    }),
  );

  /*
   * ---- 围巾 ----
   *
   * 高度要卡在**头球下沿和肩之间**。第一版放在 TORSO_Y+0.14 = 0.41，
   * 而头球下沿在 0.5−0.145×0.94 ≈ 0.36——整圈围巾埋在头里面，一点没露。
   * 现在压到 0.355 并且把半径放大到超过头球在那个高度的截面，
   * 它才能从头下面探出一圈来。
   */
  body.add(
    tube(0.112, 0.128, 0.06, PALETTE.otterScarf, {
      position: [0, 0.4, 0],
      segments: [20, 20],
    }),
  );
  // 前面垂下来一角
  body.add(
    slab([0.08, 0.11, 0.022], PALETTE.otterScarf, {
      position: [0.035, 0.335, 0.115],
      rotation: [0.28, 0, Math.PI / 5.5],
    }),
  );

  // ---- 头 ----
  const head = buildHead();
  body.add(head.pivot);

  // ---- 手臂：短，挂在轮廓外面（石傀儡那条剪影教训） ----
  const arms: Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new Object3D();
    pivot.name = side < 0 ? "arm-left" : "arm-right";
    // 肩心挂在躯干**外面**（躯干半宽 0.175，肩心 0.185）：手臂整条
    // 要在轮廓外，缩进去就成了躯干上的两块色斑（石傀儡那条教训）
    pivot.position.set(side * 0.185, TORSO_Y + 0.03, 0.03);
    pivot.add(
      ball(0.05, PALETTE.otterFur, {
        position: [side * 0.012, -0.06, 0],
        scale: [0.9, 1.4, 0.9],
        segments: [14, 12],
      }),
    );
    // 爪子：深一档，搭在肚子前面（参考图里两只手是扶着肩带的）
    pivot.add(
      ball(0.042, PALETTE.otterFurDeep, {
        position: [side * -0.01, -0.125, 0.035],
        segments: [12, 10],
      }),
    );
    body.add(pivot);
    arms.push(pivot);
  }

  // ---- 腿：很短，几乎是意思一下。挂在 rig 不挂 body（body 会沉） ----
  const legs: Object3D[] = [];
  for (const side of [-1, 1]) {
    const pivot = new Object3D();
    pivot.name = side < 0 ? "leg-left" : "leg-right";
    pivot.position.set(side * 0.082, 0.1, 0.015);
    pivot.add(
      ball(0.055, PALETTE.otterFurDeep, {
        position: [0, -0.045, 0.01],
        scale: [0.95, 0.85, 1.25],
        segments: [14, 12],
      }),
    );
    rig.add(pivot);
    legs.push(pivot);
  }

  /*
   * ---- 尾巴：宽而扁，拖在身后 ----
   *
   * 水獭的尾巴是**扁的**不是圆的，而且很宽——参考图侧视图上它几乎
   * 和身体一样长。这是这只在剪影上区别于"熊/獾"的关键一笔。
   */
  const tail = new Object3D();
  tail.name = "tail";
  /*
   * 尾根压到很低（0.085）并且**伸到包的后面去**：包的后表面在
   * −0.13−0.14 = −0.27，尾巴要长过它才看得见。第一版尾根 0.115、
   * 长度 0.3，整条藏在包的投影里，侧视图上完全找不到。
   */
  tail.position.set(0, 0.085, -0.1);
  tail.add(
    ball(0.13, PALETTE.otterFurDeep, {
      position: [0, -0.012, -0.16],
      scale: [0.52, 0.3, 1.9],
      segments: [16, 12],
    }),
  );
  // 尾尖：再往后一截，收细
  tail.add(
    ball(0.075, PALETTE.otterFurDeep, {
      position: [0, -0.018, -0.33],
      scale: [0.55, 0.32, 1.4],
      segments: [12, 10],
    }),
  );
  rig.add(tail);

  // ---- 背包 + 肩带 ----
  const { pack, lantern, straps } = buildPack();
  body.add(pack);
  body.add(straps);

  // ---- 动画 ----
  let sleepBlend = 0;
  let walkAmp = 0;
  let phase = 0;
  let elapsed = 0;
  let initialized = false;
  let lanternSwing = 0;
  const smooth = (t: number): number => t * t * (3 - 2 * t);

  const GESTURE_DURATION: Record<string, number> = { shake_head: 0.7, nod: 0.6 };
  let gestureName: string | null = null;
  let gestureElapsed = 0;
  root.userData.playGesture = (name: string): void => {
    if (!(name in GESTURE_DURATION)) return;
    gestureName = name;
    gestureElapsed = 0;
  };

  root.userData.animate = (
    dt: number,
    pet: { state: string; moving: boolean },
  ): void => {
    elapsed += dt;

    const asleep = pet.state === "sleeping";
    // 第一帧直接对齐：读档时他本来就在，不该表演一遍"刚躺下"
    if (!initialized) {
      sleepBlend = asleep ? 1 : 0;
      initialized = true;
    }
    sleepBlend +=
      Math.sign((asleep ? 1 : 0) - sleepBlend) *
      Math.min(Math.abs((asleep ? 1 : 0) - sleepBlend), (asleep ? 0.6 : 1.2) * dt);
    const eased = smooth(sleepBlend);

    walkAmp += ((pet.moving ? 1 : 0) - walkAmp) * Math.min(1, dt * 6);
    if (pet.moving) phase += dt * 6.5;

    // 呼吸：驮着重物，起伏比空手的生物小
    const breath = Math.sin(elapsed * 2.2) * 0.008;

    // 整只沉下去（睡）+ 呼吸
    body.position.y = -0.09 * eased + breath;
    body.scale.set(1 + 0.05 * eased, 1 - 0.08 * eased, 1 + 0.04 * eased);

    // 走路：左右晃 + 上下颠。颠簸动 rig 不动 root（见上面那段注释）
    rig.rotation.z = Math.sin(phase) * 0.07 * walkAmp;
    rig.position.y = Math.abs(Math.sin(phase)) * 0.018 * walkAmp;

    // 两条短腿交替
    legs[0].rotation.x = Math.sin(phase) * 0.55 * walkAmp;
    legs[1].rotation.x = -Math.sin(phase) * 0.55 * walkAmp;
    // 睡着时腿缩进去
    for (const leg of legs) leg.scale.setScalar(1 - 0.35 * eased);

    // 手臂反相摆
    arms[0].rotation.x = -Math.sin(phase) * 0.4 * walkAmp;
    arms[1].rotation.x = Math.sin(phase) * 0.4 * walkAmp;

    // 尾巴：走路时左右摆，睡着时贴地收起来
    tail.rotation.y = Math.sin(phase * 0.5) * 0.3 * walkAmp;
    tail.rotation.x = -0.15 + 0.25 * eased;

    // 耳朵：睡着垂下来
    head.ears[0].rotation.z = 0.35 * eased;
    head.ears[1].rotation.z = -0.35 * eased;

    /*
     * 油灯吊着晃。**滞后于身体**——用一个跟随而不是直接取 sin：
     * 挂件和挂它的人同相摆动会读成"焊死的"，慢半拍才有"吊着"的重量。
     */
    const target = -rig.rotation.z * 1.6 + Math.sin(phase * 0.9) * 0.12 * walkAmp;
    lanternSwing += (target - lanternSwing) * Math.min(1, dt * 5);
    lantern.rotation.z = lanternSwing;

    // 头：睡着埋下去
    head.pivot.rotation.x = 0.45 * eased;
    head.eyesOpen.visible = eased < 0.5;
    head.eyesClosed.visible = eased >= 0.5;

    // 一次性手势
    if (gestureName) {
      gestureElapsed += dt;
      const total = GESTURE_DURATION[gestureName];
      const t = Math.min(1, gestureElapsed / total);
      const envelope = Math.sin(t * Math.PI);
      if (gestureName === "shake_head") {
        head.pivot.rotation.y = Math.sin(t * Math.PI * 4) * 0.4 * envelope;
      } else {
        head.pivot.rotation.x += Math.sin(t * Math.PI * 3) * 0.3 * envelope;
      }
      if (t >= 1) {
        gestureName = null;
        head.pivot.rotation.y = 0;
      }
    } else {
      head.pivot.rotation.y = 0;
    }
  };

  // 描边略放大：这只小，1.012 在他身上几乎看不见
  root.userData.outlineScale = 1.02;
  return root;
}
