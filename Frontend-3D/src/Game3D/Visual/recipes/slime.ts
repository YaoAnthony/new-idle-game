import {
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
  Vector2,
  type ColorRepresentation,
} from "three";
import { PALETTE } from "../palette.js";
import { buildJelly } from "../jelly.js";

/**
 * 史莱姆「咕噜」——期 4 的第一位居民。**造型全部照用户 2026-08-24 的设计稿。**
 *
 * ## 稿子上定死的几条
 *
 * - **半球体为主、底部微压扁、简单圆润无复杂凹凸**（"建模友好"那一栏原话）
 * - **一体成型无分件**：手臂是身上鼓出来的一坨，不是接上去的零件
 * - **大眼睛居中**，表情靠眼睛高光和嘴形变化
 * - 材质：**半透明果冻质感、内部有气泡、边缘透亮、颜色从顶部浅到底部稍深**
 * - 三角面约 1000~1500
 *
 * 前一版我推的是"低模切面"（像宝石那样把反射切碎，参照 pmndrs 那只果冻
 * 方块）。**设计稿把它否掉了**："简单圆润无复杂凹凸"和"边缘柔和"两条
 * 直接对着来。切面读出来是矿物，和"软萌治愈"是反的，所以这版全是光滑的。
 *
 * ## 为什么身体用 LatheGeometry 而不是球
 *
 * 这个形不是球——是**底宽顶收的穹顶**，最粗的地方在靠下三分之一处，
 * 底面几乎平贴地。球再怎么缩放也做不出"底下微微摊开"那一下，而那正是
 * "一坨软的坐在地上"的全部来源。旋转成型给的是一条**侧影曲线**，
 * 而稿子的三视图本来就是照侧影画的，一一对得上。
 *
 * 顺带：旋转成型的顶点沿轮廓分布，同样的面数花在轮廓上而不是浪费在球的
 * 两极——1000~1500 面的预算里这很划算。
 *
 * ## 脸为什么是"埋在果冻里"的
 *
 * 眼睛、嘴、腮红都是**不透明**的小件，摆在身体表面稍靠里。它们走不透明
 * 队列先画，半透的前壳再混上去——于是就是"隔着一层果冻看见里面的脸"，
 * 正是稿子上那个观感。不用额外做什么，是 `buildJelly` 三层排序的自然结果。
 *
 * `userData.animate` 三态（PetView 每帧调）：
 * - **idle**：整坨缓慢呼吸（横竖反相的挤压拉伸），头顶那滴延迟半拍跟着晃
 * - **走**：一跳一跳（史莱姆不迈步），落地那下压扁再弹回
 * - **睡**：整个塌下去、眼睛压成一条缝
 */

/** 身高（米）。稿子没标绝对尺寸，按"坐在地上到膝盖"取——邻居不是宠物大小 */
const HEIGHT = 0.40;
/**
 * 最宽处的半径。**宽必须明显大于高**——三视图上是个矮墩墩的穹顶。
 * 第一版 0.46 高 / 0.28 宽（高宽比 0.82）立起来读成了圆锥，
 * 现在 0.40 / 0.26 → 高宽比 0.77，和稿子对得上。
 */
const RADIUS = 0.26;

/**
 * 侧影曲线。**这十二个点就是稿子上那条轮廓线。**
 *
 * 从底心往外走到最宽（在 12% 高度处——"底部微压扁"就是这个），再一路
 * 收到顶心。数值是照三视图量的**比例**，乘上 HEIGHT / RADIUS 才是米。
 */
const PROFILE: Array<[number, number]> = [
  [0.0, 0.0],
  [0.5, 0.0],
  [0.82, 0.01],
  [0.96, 0.06],
  [1.0, 0.16],
  // 到三成高之前一直保持最宽——"肩膀"要厚，这是穹顶和圆锥的分水岭
  [1.0, 0.3],
  // 上面七成走 r = sqrt(1 - t²) 的半圆，t 是这一段内的归一化高度
  [0.98, 0.44],
  [0.917, 0.58],
  [0.8, 0.72],
  [0.714, 0.79],
  [0.6, 0.86],
  [0.436, 0.93],
  [0.312, 0.965],
  [0.0, 1.0],
];

function bodyGeometry(): LatheGeometry {
  return new LatheGeometry(
    PROFILE.map(([r, h]) => new Vector2(r * RADIUS, h * HEIGHT)),
    // 24 段：1000~1500 面的预算下，圆得看不出棱又不浪费
    24,
  );
}

/**
 * 侧影曲线在某个高度上的半径（米）。
 *
 * 脸上那几件的 z 坐标**不能凭手感填**：埋深了会被 0.72 不透明度的前壳
 * 洗成一团灰（第一版眼睛和嘴就是这么没的），凸太多又会飘在身体外面。
 * 照曲线算出表面在哪，再统一往外让一点点，才两头都不犯。
 */
function radiusAt(heightFraction: number): number {
  const f = Math.min(1, Math.max(0, heightFraction));
  for (let i = 1; i < PROFILE.length; i += 1) {
    const [r0, h0] = PROFILE[i - 1];
    const [r1, h1] = PROFILE[i];
    if (f <= h1) {
      const t = h1 === h0 ? 0 : (f - h0) / (h1 - h0);
      return (r0 + (r1 - r0) * t) * RADIUS;
    }
  }
  return 0;
}

/** 高度 `hf`（比例）、横向 `x` 处，身体表面在 z 的哪儿 */
function surfaceZ(x: number, heightFraction: number): number {
  const r = radiusAt(heightFraction);
  return Math.sqrt(Math.max(0, r * r - x * x));
}

function opaque(color: ColorRepresentation): MeshLambertMaterial {
  return new MeshLambertMaterial({ color, flatShading: false });
}

/** 脸上的小件：不投影、不描边（反相外壳在这个尺寸上是一粒粒黑渣） */
function facePart(mesh: Mesh): Mesh {
  mesh.castShadow = false;
  mesh.userData.noOutline = true;
  return mesh;
}

export function buildSlime(): Object3D {
  const root = new Object3D();
  const rig = new Object3D();
  rig.name = "rig";
  root.add(rig);
  /*
   * `body` 是**挤压拉伸**那一层，和 `rig` 分开：果冻的呼吸要缩放，而缩放
   * 会连着影响挂在上面的一切。分层之后头顶那滴才能自己延迟摆动。
   *
   * `root.position` 归 PetView 管（石傀儡那期定的），这里一律不碰。
   */
  const body = new Object3D();
  body.name = "body";
  rig.add(body);

  // ---- 身体：一坨果冻 ----
  const jelly = buildJelly(bodyGeometry(), "fresnel", {
    color: PALETTE.slimeBody,
    // 稿子："颜色从顶部浅到底部稍深"
    gradient: { top: PALETTE.slimeTop, bottom: PALETTE.slimeDeep },
    opacity: 0.72,
    // 稿子："边缘透亮"——就是这圈菲涅尔
    rimColor: PALETTE.slimeMist,
    rimPower: 2.2,
    rimStrength: 0.45,
    // 肚子里是气泡不是实心球，内核关掉，否则把气泡全挡了
    core: false,
  });
  body.add(jelly);

  // ---- 内部气泡（稿子明写的"内部有气泡"）----
  /*
   * 位置手写，不用随机：随机会让某几只的气泡正好糊在眼睛后面。全都往
   * **偏后**放——气泡在前面会和脸抢视线，在后面才是"透过身体看见里面"。
   *
   * 尺寸第一版给大了（0.02~0.03），侧视图里中间那两颗直接读成了鼻子。
   * 气泡是**细节不是器官**，得小到"注意到了才看见"。
   */
  const BUBBLES: Array<[number, number, number, number]> = [
    [-0.11, 0.12, -0.08, 0.014],
    [0.1, 0.2, -0.1, 0.011],
    [-0.05, 0.29, -0.09, 0.009],
    [0.13, 0.09, -0.04, 0.010],
    [-0.15, 0.22, -0.02, 0.008],
    [0.04, 0.33, -0.06, 0.007],
  ];
  for (const [x, y, z, r] of BUBBLES) {
    const bubble = facePart(
      new Mesh(new SphereGeometry(r, 10, 8), opaque(PALETTE.slimePale)),
    );
    bubble.position.set(x, y, z);
    body.add(bubble);
  }

  // ---- 头顶那一滴（呆毛）----
  /*
   * 三视图上从头顶斜向后翘起的那个尖。挂在 **rig** 上而不是 body 上：
   * 它要延迟半拍跟着晃，跟着 body 一起缩放的话就没有"软东西甩在后面"那下了。
   */
  const tip = new Object3D();
  tip.name = "tip";
  // 起点埋进身体里一点（0.92 而不是 0.97）：露出接缝就不是"一体成型"了
  tip.position.set(0, HEIGHT * 0.92, -0.015);
  rig.add(tip);
  const drop = new Mesh(
    new LatheGeometry(
      [
        /*
         * 一颗**水滴**：底下鼓、往上长长地收成尖。
         *
         * 调了三版。第一版又瘦又直，侧视图读成鲨鱼鳍；第二版加粗缩短，
         * 矫枉过正成了洋葱头/毛线球顶。差别全在**高宽比**：
         * 1.9 倍是个球，2.9 倍才是水滴。
         */
        new Vector2(0.0, 0.0),
        new Vector2(0.048, 0.006),
        new Vector2(0.058, 0.03),
        new Vector2(0.056, 0.06),
        new Vector2(0.046, 0.095),
        new Vector2(0.03, 0.13),
        new Vector2(0.014, 0.158),
        new Vector2(0.0, 0.17),
      ],
      14,
    ),
    opaque(PALETTE.slimeTop),
  );
  drop.userData.noOutline = true;
  drop.rotation.x = -0.3; // 往后仰。-0.42 仰过头会成一片翘起的鳍
  tip.add(drop);

  // ---- 手臂：身上鼓出来的两坨（稿子："一体凸起，圆润短小"）----
  /*
   * **也是果冻，不是实心球。** 第一版用不透明的主色做，侧视图里那一坨
   * 比身体饱和得多，直接读成了内脏——半透明的身体里嵌着一颗实心蓝球。
   * 用同一套 `buildJelly` 之后它和身体是同一种东西，重叠处自然加深，
   * 正好是"一体凸起"该有的样子。
   *
   * 位置也从 0.92 挪到 1.0 倍半径：**要戳出轮廓才叫凸起**，埋在里面
   * 只是个内含物。
   */
  const ARM_H = 0.32;
  const arms: Object3D[] = [];
  for (const side of [-1, 1]) {
    const arm = new Object3D();
    arm.position.set(side * radiusAt(ARM_H) * 0.98, HEIGHT * ARM_H, -0.012);
    const nub = buildJelly(new SphereGeometry(0.052, 12, 10), "fresnel", {
      color: PALETTE.slimeBody,
      opacity: 0.72,
      rimColor: PALETTE.slimeMist,
      rimPower: 2.2,
      rimStrength: 0.45,
      core: false,
    });
    nub.scale.set(1.3, 0.82, 0.88);
    arm.add(nub);
    arm.rotation.z = side * 0.32;
    body.add(arm);
    arms.push(arm);
  }

  // ---- 脸 ----
  /*
   * 眼睛**大而居中**（稿子第二条）。贴在身体表面靠外，不埋深：埋深了会被
   * 0.72 不透明度的前壳洗淡，而稿子上的眼睛是很扎实的深色。
   */
  const EYE_HF = 0.5;
  const EYE_X = 0.085;
  const EYE_Y = HEIGHT * EYE_HF;
  /*
   * 眼球中心摆在**表面往里 0.018** 处。眼球半径 0.052、z 向压到 0.62，
   * 所以前极正好探出表面一点点——深色因此不被前壳洗，而侧面仍陷在
   * 果冻里，看着是"长在里面的"而不是"贴上去的两颗扣子"。
   */
  const EYE_Z = surfaceZ(EYE_X, EYE_HF) - 0.018;
  const eyes: Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = facePart(
      new Mesh(new SphereGeometry(0.052, 16, 12), opaque(PALETTE.slimeEye)),
    );
    eye.position.set(side * EYE_X, EYE_Y, EYE_Z);
    eye.scale.set(0.84, 1, 0.62);
    body.add(eye);
    eyes.push(eye);

    // 两点高光：大的左上、小的右下。稿子说表情靠高光变化，先把位置留对
    const big = facePart(
      new Mesh(
        new SphereGeometry(0.0125, 10, 8),
        new MeshBasicMaterial({ color: PALETTE.slimeGlow }),
      ),
    );
    // 高光第一版给大了，眼睛整颗读成白的。稿子上高光占瞳孔约三成
    big.position.set(side * EYE_X - 0.015, EYE_Y + 0.016, EYE_Z + 0.026);
    body.add(big);
    const small = facePart(
      new Mesh(
        new SphereGeometry(0.0062, 8, 6),
        new MeshBasicMaterial({ color: PALETTE.slimeGlow }),
      ),
    );
    small.position.set(side * EYE_X + 0.016, EYE_Y - 0.017, EYE_Z + 0.024);
    body.add(small);
  }

  // 嘴：一个小小的圆开口
  const MOUTH_HF = 0.36;
  const mouth = facePart(
    new Mesh(new SphereGeometry(0.028, 12, 10), opaque(PALETTE.slimeMouth)),
  );
  // 第一版埋在身体里，正视图根本看不见。改成照 surfaceZ 贴着表面放
  mouth.position.set(0, HEIGHT * MOUTH_HF, surfaceZ(0, MOUTH_HF) - 0.008);
  mouth.scale.set(1.2, 0.8, 0.3);
  body.add(mouth);

  // 腮红：眼睛外侧下方两块淡粉
  // 抬到眼睛下沿：0.4 太低，和嘴挤在一块儿了
  const BLUSH_HF = 0.45;
  const BLUSH_X = 0.155;
  for (const side of [-1, 1]) {
    const blush = facePart(
      new Mesh(new SphereGeometry(0.03, 12, 10), opaque(PALETTE.slimeBlush)),
    );
    blush.position.set(
      side * BLUSH_X,
      HEIGHT * BLUSH_HF,
      surfaceZ(BLUSH_X, BLUSH_HF) - 0.004,
    );
    blush.scale.set(1.05, 0.55, 0.18);
    body.add(blush);
  }

  // ---- 动起来 ----
  let elapsed = 0;
  let tipLag = 0;

  root.userData.animate = (
    dt: number,
    pet: { state: string; moving: boolean },
  ): void => {
    elapsed += dt;
    const asleep = pet.state === "sleeping";

    /*
     * 果冻的"弹"落到动画上就一件事：**横竖反相**。压扁时变宽、拉长时变窄，
     * 体积看起来才守恒；只上下缩放的话像被拉长的橡皮，不像一坨有分量的胶。
     */
    let squash: number;
    if (asleep) {
      squash = -0.22; // 睡着了整个塌下去
    } else if (pet.moving) {
      // 走 = 一跳一跳。史莱姆不迈步，弹跳本身就是他的步态
      const hop = Math.abs(Math.sin(elapsed * 5.2));
      squash = 0.14 - hop * 0.3;
      rig.position.y = hop * 0.075;
    } else {
      squash = Math.sin(elapsed * 1.7) * 0.05;
      rig.position.y = 0;
    }

    const target = 1 + squash;
    body.scale.set(1 / Math.sqrt(target), target, 1 / Math.sqrt(target));

    /*
     * 头顶那滴**延迟半拍**跟上。这一下是"软"最便宜也最有效的表达——
     * 身体停了它还在晃，观众就认定这东西是软的。
     */
    const wanted = squash * 1.6;
    tipLag += (wanted - tipLag) * Math.min(1, dt * 7);
    tip.rotation.x = -0.0 - tipLag * 0.55;
    tip.rotation.z = Math.sin(elapsed * 1.3) * 0.06;
    tip.position.y = HEIGHT * 0.92 * target;

    // 手臂跟着轻轻摆
    const swing = asleep ? 0 : Math.sin(elapsed * (pet.moving ? 5.2 : 1.7)) * 0.18;
    arms[0].rotation.z = -0.35 - swing;
    arms[1].rotation.z = 0.35 + swing;

    // 睡着了眼睛压成一条缝
    for (const eye of eyes) eye.scale.y = asleep ? 0.16 : 1;
  };

  return root;
}
