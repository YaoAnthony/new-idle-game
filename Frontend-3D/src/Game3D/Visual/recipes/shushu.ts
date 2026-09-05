import {
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
 * 舒舒：两个人那么大的岩绒巨猫，一生大部分时间睡在地上。
 *
 * ## 为什么这只不走低多边形
 *
 * 全场的家具和小生物都是平面着色的低模——它们是"布景"。舒舒是屋子里
 * 唯一的大活物，宫崎骏那套的做法恰恰相反：环境可以概括，**毛绒绒的大家伙
 * 必须圆润**（龙猫本体永远是柔和的大弧面）。所以这只用高细分球体 +
 * 平滑着色，和布景形成质感对比——摸上去是软的，一眼就能读出来。
 * 整只约三万个三角面，对 GPU 是零头，但轮廓上再也找不到折线。
 *
 * ## 造型从哪来
 *
 * 照着蓝灰龙猫（绒鼠）的比例改大：巨大的圆耳、脸颊两团鼓肉、灰紫的背、
 * 奶油色的肚子。可爱的关键全在比例，不在细节量——
 * 头要占身体一半以上、眼睛低而分得开、四肢短到几乎是意思一下。
 *
 * ## 动画
 *
 * 三个状态由 `userData.animate` 每帧驱动（ResidentView 调，见那边的约定）：
 * - **睡**：四肢缩进毛里、整只沉下去摊成一团（猫吐司），尾巴收到身侧，
 *   眼睛换成"︶"，呼吸变深变慢
 * - **起来 / 睡下**：就是 sleepBlend 那条 0↔1 的缓动本身——腿长回来、
 *   头抬起来的过程即是起身动画，不需要单独的关键帧
 * - **走**：对角步（FL+BR / FR+BL 反相），身体跟着左右滚一点，尾巴摆大
 */

// ---- 材质：平滑着色，和 primitives 的平面着色是两套 ----

const softCache = new Map<string, MeshLambertMaterial>();

function soft(value: ColorRepresentation): MeshLambertMaterial {
  const key = String(value);
  const existing = softCache.get(key);
  if (existing) return existing;

  const material = new MeshLambertMaterial({ color: value, flatShading: false });
  softCache.set(key, material);
  return material;
}

type BallOptions = {
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  segments?: [number, number];
  castShadow?: boolean;
  /** 眼珠、胡须这类小件不描边：反相外壳在小尺寸上是一粒粒黑渣 */
  noOutline?: boolean;
};

function ball(
  radius: number,
  color: ColorRepresentation,
  options: BallOptions = {},
): Mesh {
  const [w, h] = options.segments ?? [32, 24];
  const mesh = new Mesh(new SphereGeometry(radius, w, h), soft(color));
  if (options.position) mesh.position.set(...options.position);
  if (options.scale) mesh.scale.set(...options.scale);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = false;
  if (options.noOutline) mesh.userData.noOutline = true;
  return mesh;
}

// ---- 体格参数。全部集中在这，"再胖一点"是改一个数 ----

/** 躯干中心离地。腿短，身子几乎贴着地摆 */
const TORSO_Y = 0.92;
/** 躯干三轴半径：宽 1.6 / 高 1.56 / 长 2.04 米 */
const TORSO = [0.8, 0.78, 1.02] as const;
/** 头中心（世界系）。故意顶在躯干前上方、埋掉脖子——没有脖子才是团子 */
const HEAD_CENTER = [0, 1.64, 0.72] as const;
const HEAD_R = 0.64;
/** 睡着时整只往下沉多少（腿同时缩起来，正好变成贴地的一团） */
const SLEEP_SINK = 0.32;

function buildHead(): { pivot: Object3D; earLeft: Object3D; earRight: Object3D; eyesOpen: Object3D; eyesClosed: Object3D } {
  // 枢轴放在"脖根"，头绕它点下去——睡觉埋头的旋转中心
  const pivot = new Object3D();
  pivot.name = "head-pivot";
  pivot.position.set(0, 1.34, 0.5);

  const head = new Object3D();
  head.position.set(
    HEAD_CENTER[0] - pivot.position.x,
    HEAD_CENTER[1] - pivot.position.y,
    HEAD_CENTER[2] - pivot.position.z,
  );
  pivot.add(head);

  head.add(
    ball(HEAD_R, PALETTE.shuFur, {
      scale: [1.04, 0.95, 0.97],
      segments: [52, 38],
    }),
  );

  // 脸颊两团鼓肉：绒鼠脸的全部秘密。比头浅一档，鼓出来的部分自带高光感
  for (const side of [-1, 1]) {
    head.add(
      ball(0.34, PALETTE.shuFace, {
        position: [side * 0.42, -0.2, 0.28],
        scale: [1, 0.82, 0.9],
        segments: [30, 22],
      }),
    );
  }

  // 口鼻部：奶油色，从两颊之间探出来一点
  head.add(
    ball(0.3, PALETTE.shuCream, {
      position: [0, -0.24, 0.44],
      scale: [1.18, 0.7, 0.78],
      segments: [30, 22],
    }),
  );

  // 鼻头。绒鼠的鼻子小而钝，不是猫的尖三角
  head.add(
    ball(0.075, PALETTE.shuNose, {
      position: [0, -0.07, 0.66],
      scale: [1.25, 0.78, 0.55],
      segments: [16, 12],
      noOutline: true,
    }),
  );

  // 抿着的小嘴："︶"一条就够。多画嘴唇立刻不可爱
  const mouth = new Mesh(
    new TorusGeometry(0.07, 0.013, 8, 20, Math.PI * 0.9),
    soft(PALETTE.shuClosedEye),
  );
  // z 要探出口鼻部前表面（≈0.674），埋在里面等于没画
  mouth.position.set(0, -0.28, 0.7);
  mouth.rotation.set(-0.18, 0, Math.PI + Math.PI * 0.05);
  mouth.castShadow = false;
  mouth.userData.noOutline = true;
  head.add(mouth);

  // ---- 眼睛：睁 / 闭两组，动画层按 sleepBlend 切换 ----

  const eyesOpen = new Object3D();
  eyesOpen.name = "eyes-open";
  const eyesClosed = new Object3D();
  eyesClosed.name = "eyes-closed";
  head.add(eyesOpen, eyesClosed);

  for (const side of [-1, 1]) {
    const eyeX = side * 0.315;

    // 眼珠贴着头球面往外顶（球心在面外一点，半埋会变成一条缝）
    eyesOpen.add(
      ball(0.105, PALETTE.petEye, {
        position: [eyeX, 0.12, 0.575],
        segments: [20, 14],
        castShadow: false,
        noOutline: true,
      }),
    );
    // 高光点：不受光的纯白小球。毛绒玩具的"活"一半在这颗点上
    const sparkle = new Mesh(
      new SphereGeometry(0.033, 10, 8),
      new MeshBasicMaterial({ color: "#ffffff" }),
    );
    sparkle.position.set(eyeX + side * -0.028, 0.16, 0.66);
    sparkle.castShadow = false;
    sparkle.userData.noOutline = true;
    eyesOpen.add(sparkle);

    // 慵懒半眼皮：毛色小球盖住眼珠上沿。"懒"写在脸上就是靠它
    eyesOpen.add(
      ball(0.118, PALETTE.shuFur, {
        position: [eyeX, 0.225, 0.565],
        scale: [1.06, 0.5, 0.6],
        segments: [20, 14],
        castShadow: false,
        noOutline: true,
      }),
    );

    // 睡着的"︶"。开口向上=睡得香；反过来开口向下立刻变愁眉苦脸
    const closed = new Mesh(
      new TorusGeometry(0.095, 0.017, 8, 22, Math.PI * 0.85),
      soft(PALETTE.shuClosedEye),
    );
    closed.position.set(eyeX, 0.13, 0.6);
    closed.rotation.set(0, side * 0.3, Math.PI + Math.PI * 0.075);
    closed.castShadow = false;
    closed.userData.noOutline = true;
    eyesClosed.add(closed);
  }

  // 胡须：每边三根，微微下垂——上翘是警觉，下垂是困
  for (const side of [-1, 1]) {
    for (const [index, droop] of [-0.06, 0.04, 0.15].entries()) {
      const whisker = new Mesh(
        new CylinderGeometry(0.008, 0.005, 0.52, 6),
        soft(PALETTE.shuCream),
      );
      whisker.position.set(side * 0.52, -0.16 - index * 0.045, 0.42);
      whisker.rotation.set(0, 0, side * (Math.PI / 2 + droop));
      whisker.rotation.y = side * -0.35;
      whisker.castShadow = false;
      whisker.userData.noOutline = true;
      head.add(whisker);
    }
  }

  // ---- 耳朵：绒鼠的招牌大圆耳，一对枢轴留给"抖耳朵" ----

  const ears: Object3D[] = [];
  for (const side of [-1, 1]) {
    const earPivot = new Object3D();
    earPivot.position.set(side * 0.38, 0.46, -0.04);
    earPivot.rotation.z = side * -0.3;

    earPivot.add(
      ball(0.29, PALETTE.shuFur, {
        position: [side * 0.05, 0.17, 0],
        scale: [1, 1.18, 0.32],
        segments: [26, 18],
      }),
      // 内耳的一片薄粉。比外圈小一号、往前顶出来
      ball(0.225, PALETTE.shuInnerEar, {
        position: [side * 0.045, 0.15, 0.055],
        scale: [1, 1.12, 0.16],
        segments: [22, 16],
        castShadow: false,
        noOutline: true,
      }),
    );
    head.add(earPivot);
    ears.push(earPivot);
  }

  return { pivot, earLeft: ears[0], earRight: ears[1], eyesOpen, eyesClosed };
}

export function buildShuShu(): Object3D {
  const root = new Object3D();
  root.name = "shushu";

  // body 是"除影子外的整只猫"：睡觉下沉、呼吸鼓动都作用在它身上
  const body = new Object3D();
  body.name = "body";
  root.add(body);

  // 躯干三层：本体 + 背上的深毛披 + 肚皮的奶油白。
  // 三个球差着色号互相错开一点，交界线画出"毛分层"的蓬松感
  body.add(
    ball(1, PALETTE.shuFur, {
      position: [0, TORSO_Y, 0],
      scale: [...TORSO],
      segments: [56, 40],
    }),
    ball(1, PALETTE.shuMantle, {
      position: [0, TORSO_Y + 0.1, -0.08],
      scale: [TORSO[0] * 0.94, TORSO[1] * 0.93, TORSO[2] * 0.94],
      segments: [48, 34],
      castShadow: false,
    }),
    ball(1, PALETTE.shuCream, {
      position: [0, TORSO_Y - 0.12, 0.08],
      scale: [TORSO[0] * 0.88, TORSO[1] * 0.88, TORSO[2] * 0.96],
      segments: [44, 30],
      castShadow: false,
    }),
  );

  // ---- 四条短腿。枢轴在髋部：走路绕它摆，睡觉沿它缩 ----

  const legs: Object3D[] = [];
  for (const [lx, lz] of [
    [-0.46, 0.58],
    [0.46, 0.58],
    [-0.46, -0.56],
    [0.46, -0.56],
  ]) {
    const hip = new Object3D();
    hip.position.set(lx, 0.5, lz);

    const shin = new Mesh(
      new CylinderGeometry(0.15, 0.17, 0.46, 24),
      soft(PALETTE.shuFur),
    );
    shin.position.set(0, -0.26, 0);
    shin.castShadow = true;

    const paw = ball(0.185, PALETTE.shuCream, {
      position: [0, -0.44, 0.05],
      scale: [1, 0.66, 1.12],
      segments: [20, 14],
    });

    hip.add(shin, paw);
    body.add(hip);
    legs.push(hip);
  }

  // ---- 大尾巴：一串球从粗到细卷上去，枢轴留给摆动和睡觉时收拢 ----

  const tail = new Object3D();
  tail.name = "tail";
  tail.position.set(0, 0.98, -0.92);
  tail.add(
    ball(0.3, PALETTE.shuFur, { position: [0, -0.08, -0.16], segments: [28, 20] }),
    ball(0.26, PALETTE.shuFur, { position: [0.03, 0.14, -0.4], segments: [28, 20] }),
    ball(0.23, PALETTE.shuMantle, { position: [0.07, 0.42, -0.52], segments: [26, 18] }),
    ball(0.18, PALETTE.shuCream, { position: [0.1, 0.66, -0.52], segments: [24, 16] }),
  );
  body.add(tail);

  const { pivot: headPivot, earLeft, earRight, eyesOpen, eyesClosed } = buildHead();
  body.add(headPivot);

  // ---- 动画闭包。所有可动件都在作用域里，不用每帧按名字找 ----

  let sleepBlend = 0;
  let walkAmp = 0;
  let busyBlend = 0;
  let phase = 0;
  let elapsed = 0;
  let initialized = false;

  const smooth = (t: number): number => t * t * (3 - 2 * t);

  /**
   * 一次性动作（对话驱动，见 ResidentView 的 `resident_gesture`）。**只有摇头**——
   * 没实现的手势名 `playGesture` 直接不理，调用方（对话数据）不需要
   * 关心某个物种到底支不支持某个手势。
   *
   * 时长表按名字查，而不是把 0.7 这个数字散在 animate 里到处比较：
   * 以后加第二个手势时，这里加一行，下面判断逻辑一行都不用碰。
   */
  const GESTURE_DURATION: Record<string, number> = { shake_head: 0.7 };
  let gestureName: string | null = null;
  let gestureElapsed = 0;

  root.userData.playGesture = (name: string): void => {
    if (!(name in GESTURE_DURATION)) return;
    gestureName = name;
    gestureElapsed = 0;
  };

  root.userData.animate = (
    deltaSeconds: number,
    resident: { state: string; moving: boolean },
  ): void => {
    elapsed += deltaSeconds;

    const asleep = resident.state === "sleeping";
    // 第一帧直接对齐状态：读档时它本来就睡着，不该表演一遍"进门躺下"
    if (!initialized) {
      sleepBlend = asleep ? 1 : 0;
      initialized = true;
    }

    // 睡下去慢（0.5/s，缓缓瘫成一摊），起来快一倍（被吵醒是利索的）
    const blendSpeed = asleep ? 0.5 : 1.0;
    const target = asleep ? 1 : 0;
    sleepBlend +=
      Math.sign(target - sleepBlend) *
      Math.min(Math.abs(target - sleepBlend), blendSpeed * deltaSeconds);
    const eased = smooth(sleepBlend);

    // 走路摆幅渐入渐出，急停不会让四条腿瞬间定格
    walkAmp += ((resident.moving ? 1 : 0) - walkAmp) * Math.min(1, deltaSeconds * 6);
    if (resident.moving) phase += deltaSeconds * 3.6;

    // 吃/喝：头埋下去的量。渐入渐出，抬头不会一帧弹回来
    const busy = resident.state === "eat" || resident.state === "drink";
    busyBlend += ((busy ? 1 : 0) - busyBlend) * Math.min(1, deltaSeconds * 5);

    // 呼吸：睡着深而慢（这是"睡得香"的主要信号），醒着浅而快
    const breathRate = 1.7 + (1 - eased) * 1.6;
    const breath = Math.sin(elapsed * breathRate) * (0.006 + eased * 0.02);

    // 整只沉下去 + 摊开一点（猫吐司）。呼吸叠在睡姿的鼓/瘪上
    body.position.y = -SLEEP_SINK * eased;
    body.scale.set(
      1 + 0.07 * eased - breath * 0.5,
      1 - 0.11 * eased + breath,
      1 + 0.05 * eased,
    );
    // 走路的左右滚：大家伙的分量全在这一点摇晃里
    body.rotation.z = Math.sin(phase * Math.PI * 2) * 0.045 * walkAmp * (1 - eased);

    // 四条腿：对角步。睡着时缩进毛里（缩到 6% 而不是 0，零尺寸会闪面）
    const legScale = 1 - 0.94 * eased;
    legs.forEach((leg, index) => {
      leg.scale.y = legScale;
      const diagonal = index === 0 || index === 3 ? 0 : Math.PI;
      leg.rotation.x =
        Math.sin(phase * Math.PI * 2 + diagonal) * 0.55 * walkAmp * (1 - eased);
    });

    // 头：睡着埋进身体；走路轻点头；待机极慢地左右晃（发呆）
    headPivot.position.y = 1.34 - 0.42 * eased;
    headPivot.position.z = 0.5 - 0.12 * eased;
    headPivot.rotation.x =
      0.38 * eased +
      // 埋头啃/舔：低下去再加一点小幅点头的节律，一看就是在吃东西
      (0.55 + Math.sin(elapsed * 8) * 0.1) * busyBlend +
      Math.sin(phase * Math.PI * 4) * 0.02 * walkAmp;
    headPivot.rotation.z = Math.sin(elapsed * 0.6) * 0.025 * (1 - eased);

    // 摇头：叠在头部旋转上的一次性插播，播完自动清零（不清的话
    // 播完那一帧的角度会被"焊死"在 rotation.y 上，因为没有别处会写它）
    let gestureYaw = 0;
    if (gestureName) {
      gestureElapsed += deltaSeconds;
      const duration = GESTURE_DURATION[gestureName];
      const t = gestureElapsed / duration;
      if (t >= 1) {
        gestureName = null;
      } else if (gestureName === "shake_head") {
        // 两个来回，sin(πt) 当包络掐头去尾，起止都回到正对着你
        const envelope = Math.sin(Math.PI * t);
        gestureYaw = Math.sin(t * Math.PI * 4) * 0.32 * envelope;
      }
    }
    headPivot.rotation.y = gestureYaw;

    // 耳朵：偶尔抖一下（左右不同周期，免得像机械钟）。睡着大幅收敛
    const flickL = elapsed % 6.4;
    const flickR = elapsed % 8.9;
    earLeft.rotation.x =
      (flickL < 0.32 ? Math.sin((flickL / 0.32) * Math.PI * 3) * 0.22 : 0) *
      (1 - eased * 0.8);
    earRight.rotation.x =
      (flickR < 0.32 ? Math.sin((flickR / 0.32) * Math.PI * 3) * 0.22 : 0) *
      (1 - eased * 0.8);

    // 尾巴：醒着慢扫，走路大摆；睡着收到身侧卷起来
    // 吃着东西尾巴高兴地扫快一点
    tail.rotation.x = -0.12 * (1 - eased) - 1.05 * eased;
    tail.rotation.z = Math.sin(elapsed * 5) * 0.14 * busyBlend;
    tail.rotation.y =
      1.25 * eased +
      (Math.sin(elapsed * 0.9) * 0.22 + Math.sin(phase * Math.PI * 2) * 0.28 * walkAmp) *
        (1 - eased);

    // 眼睛两组硬切，切换点藏在起身/睡下动作最大的时刻，看不出跳变
    const closed = eased > 0.55;
    eyesOpen.visible = !closed;
    eyesClosed.visible = closed;

    // 醒着每隔几秒眨一下（高速缩眼皮方向的 y）——发呆的猫也是活的
    if (!closed) {
      const blinkCycle = elapsed % 5.3;
      const blink = blinkCycle < 0.13 ? Math.sin((blinkCycle / 0.13) * Math.PI) : 0;
      eyesOpen.scale.y = 1 - blink * 0.75;
    }
  };

  // 描边收细：2.4 米的身板配默认描边宽会变成粗黑边猫
  root.userData.outlineScale = 1.012;

  return root;
}
