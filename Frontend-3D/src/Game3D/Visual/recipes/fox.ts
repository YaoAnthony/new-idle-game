import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder, sphere } from "../primitives.js";

/**
 * 狐狸「阿茜」——期 4 的第二位居民。**造型照用户 2026-08-24 的设计稿。**
 *
 * ## 以右下角那张「低多边形参考」为准，不是上面的精修插画
 *
 * 用户 2026-08-24 明确过这一条。两张图差别很大：插画是圆润的黏土质感、
 * 舌头吐出来、毛发一撮一撮；低模示意是**带切面的基础形体**，耳朵是两片
 * 三角、尾巴是一根有棱的锥。后者才是要做的东西，所以全身走
 * `primitives` 的平面着色（`flatMaterial`），不是史莱姆那种平滑。
 *
 * 顺带解释一下为什么两位邻居的着色不一样：**是稿子分开要求的**。
 * 史莱姆那张写「简单圆润无复杂凹凸」，这张写「造型由球体、胶囊体、
 * 圆锥体等基础形体构成」+ 低模示意带切面。不是没统一。
 *
 * ## 剪影三要素：大耳朵 + 大尾巴 + 圆肚子
 *
 * 稿子「轮廓清晰」那条原话。石傀儡那次的教训是"辨识度几乎全在剪影上"，
 * 这只的剪影题眼很明确，所以**这三样都要做过头一点**：耳朵占到身高的
 * 三成、尾巴比躯干还粗、肚子鼓出来。四肢反而要收——稿子说"四肢短小圆润"。
 *
 * ## 头大身小
 *
 * 稿子「整体体型：圆润Q版，头大身小，喜感十足」。头做到躯干的 1.15 倍，
 * 这个比例是"喜感"的来源，不是失误。
 *
 * `userData.animate` 三态（PetView 每帧调）：
 * - **idle**：呼吸起伏、尾巴慢摆、耳朵偶尔抖一下
 * - **走**：两条短腿交替、身体左右晃、**尾巴摆得更大**（惯性滞后）
 * - **睡**：整只蹲下去、耳朵垂、尾巴卷过来盖住
 */

/** 身高（米）。史莱姆 0.40、水獭 0.68，邻居这一档取中间偏小 */
const HEIGHT = 0.52;

const LEG_H = 0.058;
const TORSO_Y = 0.165;
const TORSO_R = 0.102;
const HEAD_Y = 0.345;
/**
 * 头比躯干大**一半**——"头大身小"就是这个数。
 *
 * 第一版给的 1.15 倍，实机立起来读成了一只小鹿：头和躯干差不多大的时候
 * 观众看到的是"正常比例的四足动物站起来了"，Q 版的喜感全在头**明显**
 * 过大那一下。1.55 是照低模示意量的。
 */
const HEAD_R = TORSO_R * 1.55;

export function buildFox(): Object3D {
  const root = new Object3D();
  const rig = new Object3D();
  rig.name = "rig";
  root.add(rig);
  const body = new Object3D();
  body.name = "body";
  rig.add(body);

  // ---- 腿脚：短小，深棕的脚好认（稿子："手脚深色，易于区分"）----
  const legs: Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new Object3D();
    leg.position.set(side * 0.062, LEG_H, 0);
    leg.add(
      cylinder(0.036, 0.032, LEG_H * 1.5, 7, {
        position: [0, -LEG_H * 0.25, 0],
        color: PALETTE.foxOrange,
      }),
    );
    // 脚掌：压扁的团子，往前伸一点才站得稳
    leg.add(
      blob(0.045, 0, {
        position: [0, -LEG_H * 0.92, 0.018],
        scale: [1, 0.55, 1.25],
        color: PALETTE.foxBrown,
      }),
    );
    body.add(leg);
    legs.push(leg);
  }

  // ---- 躯干：圆肚子 ----
  body.add(
    blob(TORSO_R, 1, {
      position: [0, TORSO_Y, 0],
      scale: [1, 1.12, 0.94],
      color: PALETTE.foxOrange,
    }),
  );
  /*
   * 肚子那块奶油色**是一片贴上去的小团子**，不是给躯干做双色贴图。
   * 理由和全场一致：这套没有 UV 贴图管线，颜色分区靠"多摆一块几何"。
   * 稿子那条"UV友好：颜色分区明确"在我们这儿的等价物就是它。
   */
  body.add(
    blob(TORSO_R * 0.92, 1, {
      position: [0, TORSO_Y - 0.008, TORSO_R * 0.5],
      scale: [0.9, 1.12, 0.55],
      color: PALETTE.foxCream,
    }),
  );

  // ---- 手臂：短小圆润，深棕手掌 ----
  const arms: Object3D[] = [];
  for (const side of [-1, 1]) {
    const arm = new Object3D();
    arm.position.set(side * (TORSO_R * 0.92), TORSO_Y + 0.03, 0);
    arm.add(
      cylinder(0.028, 0.024, 0.085, 6, {
        position: [0, -0.04, 0],
        color: PALETTE.foxOrange,
      }),
    );
    arm.add(
      blob(0.032, 0, {
        position: [0, -0.088, 0.006],
        color: PALETTE.foxBrown,
      }),
    );
    arm.rotation.z = side * 0.22;
    body.add(arm);
    arms.push(arm);
  }

  // ---- 尾巴：大而蓬松，末端奶油色（剪影三要素之一）----
  /*
   * 挂在**独立节点**上，不跟躯干一起缩放：它要有惯性滞后，身体停了尾巴
   * 还在摆。这一下是"活的"最便宜的表达（史莱姆头顶那滴同理）。
   *
   * 形状是三节递增的团子——稿子低模示意里尾巴是一根有棱的粗锥，
   * 分节做才有"蓬松"，一整根锥子是根萝卜。
   */
  const tail = new Object3D();
  tail.name = "tail";
  tail.position.set(0, TORSO_Y - 0.02, -TORSO_R * 0.85);
  body.add(tail);
  /*
   * 尺寸第一版给小了，3/4 视角里只是屁股后面一个疙瘩。**尾巴要比躯干还粗**
   * ——它是剪影三要素之一，收着做等于把三分之一的辨识度扔了。
   * 现在最粗那节 0.105 对躯干 0.102，正好压过一点点。
   */
  tail.add(
    blob(0.085, 1, { position: [0, 0.015, -0.062], scale: [1, 1, 1.15], color: PALETTE.foxOrange }),
  );
  tail.add(
    blob(0.105, 1, { position: [0, 0.075, -0.145], scale: [1, 1, 1.2], color: PALETTE.foxOrange }),
  );
  tail.add(
    blob(0.092, 1, {
      position: [0, 0.15, -0.212],
      scale: [1, 1, 1.1],
      color: PALETTE.foxOrangeLight,
    }),
  );
  // 尾尖奶油色（稿子："末端奶油色锯齿状过渡"——低模里就是最后一节换色）
  tail.add(
    blob(0.068, 1, { position: [0, 0.218, -0.252], color: PALETTE.foxCream }),
  );

  // ---- 头 ----
  const head = new Object3D();
  head.name = "head";
  head.position.set(0, HEAD_Y, 0);
  body.add(head);
  head.add(blob(HEAD_R, 1, { scale: [1, 0.95, 1], color: PALETTE.foxOrange }));

  /*
   * 脸下半的**奶油色脸罩**。第一版只做了一根小锥当吻部，正视图里整张脸
   * 是一片橙的，认不出是狐狸——参考图上奶油色占了脸的下半张，那块颜色
   * 分区本身就是辨识度（稿子"UV友好：颜色分区明确"讲的就是这个）。
   */
  head.add(
    blob(HEAD_R * 0.72, 1, {
      position: [0, -HEAD_R * 0.3, HEAD_R * 0.42],
      scale: [0.95, 0.72, 0.72],
      color: PALETTE.foxCream,
    }),
  );
  // 往前伸出去的吻尖
  head.add(
    blob(0.042, 1, {
      position: [0, -HEAD_R * 0.34, HEAD_R * 0.92],
      scale: [0.9, 0.78, 1.1],
      color: PALETTE.foxCream,
    }),
  );
  head.add(
    blob(0.026, 0, {
      position: [0, -HEAD_R * 0.3, HEAD_R * 1.13],
      scale: [1.2, 0.85, 0.9],
      color: PALETTE.foxNose,
    }),
  );

  // 脸颊两侧翘起的毛（稿子："脸颊两侧毛翘起"）——低模里是两片小楔子
  for (const side of [-1, 1]) {
    head.add(
      cylinder(0.0, 0.042, 0.085, 4, {
        position: [side * HEAD_R * 0.88, -HEAD_R * 0.18, 0.012],
        rotation: [0, 0, side * -1.4],
        color: PALETTE.foxCream,
      }),
    );
  }

  // 头顶小撮毛
  head.add(
    cylinder(0.0, 0.03, 0.062, 4, {
      position: [0, HEAD_R * 0.92, 0.02],
      rotation: [-0.35, 0, 0],
      color: PALETTE.foxOrange,
    }),
  );

  // ---- 超大耳朵（剪影三要素之一）----
  /*
   * 稿子："超大耳朵，内耳简化为奶油色"。做到身高的三成——**宁可过头**：
   * 剪影靠它，收着做就变成一只普通的橙色小动物。
   *
   * 三层：橙色外耳 + 奶油内耳（往前偏一点点）+ 深棕耳尖。低模示意里
   * 耳尖是明确的一块深色，不是渐变。
   */
  const ears: Object3D[] = [];
  const EAR_H = HEIGHT * 0.34;
  for (const side of [-1, 1]) {
    const ear = new Object3D();
    ear.position.set(side * HEAD_R * 0.56, HEAD_R * 0.66, -0.008);
    // 0.26 张得太开，正视图里像两片翅膀。收到 0.15，立起来才有大耳朵的读感
    ear.rotation.z = side * 0.15;
    ear.rotation.x = -0.1;
    /*
     * **底宽 + 压扁成片**。第一版是根细锥，正视图里两根牙签——大耳朵是
     * 这只的剪影题眼，宁可做过头。压到 0.4 厚是照低模示意来的：那上面
     * 耳朵是两片三角面板，不是圆锥。
     */
    ear.add(
      cylinder(0.0, 0.092, EAR_H, 5, {
        position: [0, EAR_H / 2, 0],
        scale: [1, 1, 0.4],
        color: PALETTE.foxOrange,
      }),
    );
    ear.add(
      cylinder(0.0, 0.06, EAR_H * 0.7, 5, {
        position: [0, EAR_H * 0.34, 0.014],
        scale: [1, 1, 0.4],
        color: PALETTE.foxOrangeLight,
      }),
    );
    // 耳尖深棕：低模示意里是明确的一块，不是渐变
    ear.add(
      cylinder(0.0, 0.042, EAR_H * 0.32, 5, {
        position: [0, EAR_H * 0.83, 0],
        scale: [1, 1, 0.4],
        color: PALETTE.foxBrown,
      }),
    );
    head.add(ear);
    ears.push(ear);
  }

  // ---- 脸：大眼 + 眉毛（稿子："表情通过眼球、眉毛、嘴型实现"）----
  const EYE_X = 0.062;
  const EYE_Y = HEAD_R * 0.16;
  const EYE_Z = HEAD_R * 0.8;
  const eyes: Object3D[] = [];
  for (const side of [-1, 1]) {
    const eye = new Object3D();
    eye.position.set(side * EYE_X, EYE_Y, EYE_Z);
    // 眼白：大而圆，这是"沙雕"的题眼
    eye.add(sphere(0.043, 12, 10, { scale: [1, 1.05, 0.5], color: "#ffffff", castShadow: false }));
    // 瞳孔：小而偏上，越小越蠢萌
    eye.add(
      sphere(0.017, 10, 8, {
        position: [side * 0.005, 0.005, 0.019],
        scale: [1, 1, 0.6],
        color: PALETTE.foxNose,
        castShadow: false,
      }),
    );
    head.add(eye);
    eyes.push(eye);
  }

  // 眉毛：两道深棕的斜杠，压在眼睛上方。表情全靠它俩的角度
  const brows: Object3D[] = [];
  for (const side of [-1, 1]) {
    const brow = new Object3D();
    brow.position.set(side * EYE_X, EYE_Y + 0.052, EYE_Z * 0.98);
    brow.add(
      box([0.052, 0.013, 0.012], { color: PALETTE.foxBrown, castShadow: false }),
    );
    brow.rotation.z = side * -0.18;
    head.add(brow);
    brows.push(brow);
  }

  // 张开的嘴 + 舌头（稿子的默认表情就是吐舌头）
  const mouth = blob(0.032, 0, {
    position: [0, -HEAD_R * 0.52, HEAD_R * 0.8],
    scale: [1.2, 0.75, 0.35],
    color: PALETTE.foxNose,
    castShadow: false,
  });
  head.add(mouth);
  const tongue = blob(0.021, 0, {
    position: [0, -HEAD_R * 0.62, HEAD_R * 0.86],
    scale: [1.1, 0.6, 0.8],
    color: PALETTE.foxTongue,
    castShadow: false,
  });
  head.add(tongue);

  // ---- 动起来 ----
  let elapsed = 0;
  let tailLag = 0;

  root.userData.animate = (
    dt: number,
    pet: { state: string; moving: boolean },
  ): void => {
    elapsed += dt;
    const asleep = pet.state === "sleeping";
    const speed = pet.moving ? 7.5 : 1.6;
    const wave = Math.sin(elapsed * speed);

    if (asleep) {
      // 蹲下去、耳朵垂、尾巴卷过来
      body.position.y = -0.05;
      body.rotation.x = 0.16;
      for (const [i, ear] of ears.entries()) {
        ear.rotation.z = (i === 0 ? -1 : 1) * 0.95;
      }
      tail.rotation.x = 0.5;
      tail.rotation.y = 0.7;
      for (const eye of eyes) eye.scale.y = 0.14;
      for (const leg of legs) leg.rotation.x = 0;
      return;
    }

    body.position.y = 0;
    for (const eye of eyes) eye.scale.y = 1;

    if (pet.moving) {
      // 两条短腿交替。稿子："四肢短小，活动范围大"——摆幅给足才有喜感
      legs[0].rotation.x = wave * 0.85;
      legs[1].rotation.x = -wave * 0.85;
      arms[0].rotation.x = -wave * 0.6;
      arms[1].rotation.x = wave * 0.6;
      body.rotation.z = wave * 0.05;
      body.position.y = Math.abs(wave) * 0.012;
      body.rotation.x = 0;
    } else {
      // 呼吸
      const breath = 1 + Math.sin(elapsed * 1.6) * 0.022;
      body.scale.set(1, breath, 1);
      legs[0].rotation.x = 0;
      legs[1].rotation.x = 0;
      arms[0].rotation.x = 0;
      arms[1].rotation.x = 0;
      body.rotation.z = 0;
      body.rotation.x = 0;
    }

    /*
     * 尾巴**滞后**跟上。走的时候摆幅大，站着的时候慢悠悠——身体停了它
     * 还在晃那一下，是"这东西是活的"最便宜的表达。
     */
    const wanted = wave * (pet.moving ? 0.55 : 0.22);
    tailLag += (wanted - tailLag) * Math.min(1, dt * 6);
    tail.rotation.y = tailLag;
    tail.rotation.x = -0.25 + Math.sin(elapsed * speed * 0.5) * 0.08;

    // 耳朵偶尔抖一下：每几秒一次，不是持续摆动（持续摆会像在扇风）
    const twitch = Math.max(0, Math.sin(elapsed * 0.7) - 0.97) * 18;
    for (const [i, ear] of ears.entries()) {
      ear.rotation.z = (i === 0 ? -1 : 1) * (0.3 + twitch * 0.35);
    }
  };

  return root;
}
