import {
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
  ConeGeometry,
  TorusGeometry,
  DoubleSide,
  type ColorRepresentation,
} from "three";
import { PALETTE } from "../palette.js";

/**
 * 小龙「青涟」：偷金币的贼，被水獭拎回来那一幕的主角。
 *
 * ## 照用户 2026-08-24 给的设定稿（幼年期灵渊小龙）
 *
 * 稿上的要点逐条对应：**体长 1.2~1.6m 但大半是尾巴**（比例参考栏里它
 * 站着只到人的膝上下）、细长柔软的蛇身、尚未发育完全的小翅膀、幼年短角
 * 半透明、鳞片细小光滑有水波光泽、大而清澈的深潭色眼睛。
 *
 * 色号住 `PALETTE.dragon*`——那一组是**另一个会话先采好的**（这张稿
 * 没标 hex），本文件沿用那组键名，只补了一个 `dragonDark`（爪尖鼻头）。
 *
 * ## 蛇身的做法：一串沿曲线摆的球
 *
 * 低模做长蛇身不用管子——**十来颗半径渐变的球沿一条 S 曲线排开**，
 * 球和球错叠七成，剪影上就是连续的身体，还自带"节节鼓起"的鳞感。
 * 曲线的形状写在 `SPINE`（每节的 [x, y, z, 半径]），改姿势就是改这张表。
 *
 * ## 两个姿态
 *
 * - **idle（被拎回来站着 / 日常）**：头微垂、尾巴尖不安地卷——它在
 *   挨训。呼吸轻，翅膀偶尔扑一下。垂头丧气写在**默认姿势**里而不是
 *   动画里：这只生物在游戏里的全部戏份就是这一两天。
 * - **walk**：身体左右摆出行波，头抬起来。
 * - **sleeping**：整条盘下去缩成一团。
 */

const softCache = new Map<string, MeshLambertMaterial>();
function soft(value: ColorRepresentation): MeshLambertMaterial {
  const key = String(value);
  const cached = softCache.get(key);
  if (cached) return cached;
  const material = new MeshLambertMaterial({ color: value, flatShading: false });
  softCache.set(key, material);
  return material;
}

/** 半透材质（角、翼膜）。每次新建——透明度各不相同，缓存会串 */
function glassy(value: ColorRepresentation, opacity: number): MeshLambertMaterial {
  const material = new MeshLambertMaterial({
    color: value,
    transparent: true,
    opacity,
    side: DoubleSide,
    flatShading: false,
  });
  return material;
}

type Opts = {
  position?: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  segments?: [number, number];
  castShadow?: boolean;
  noOutline?: boolean;
};

function ball(radius: number, color: ColorRepresentation, o: Opts = {}): Mesh {
  const [w, h] = o.segments ?? [20, 16];
  const mesh = new Mesh(new SphereGeometry(radius, w, h), soft(color));
  if (o.position) mesh.position.set(...o.position);
  if (o.scale) mesh.scale.set(...o.scale);
  if (o.rotation) mesh.rotation.set(...o.rotation);
  mesh.castShadow = o.castShadow ?? true;
  if (o.noOutline) mesh.userData.noOutline = true;
  return mesh;
}

/**
 * 脊柱：每节 [x, y, z, 半径]。头端在正 z，尾巴往后甩出一个 S。
 * 站姿：前三分之一立起来（胸口离地），后三分之二贴地拖行——
 * 设定稿"动作姿态"栏里落地的那两张就是这个形。
 */
const SPINE: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0.34, 0.1, 0.095],   // 颈根
  [0, 0.27, 0.16, 0.105],  // 胸（最粗）
  [0, 0.19, 0.16, 0.1],
  [0, 0.12, 0.1, 0.095],   // 落地
  [0, 0.09, 0.0, 0.09],
  [0, 0.08, -0.11, 0.082],
  [0.03, 0.075, -0.22, 0.072],
  [0.09, 0.07, -0.31, 0.062],  // 尾巴开始甩向侧面
  [0.17, 0.065, -0.38, 0.052],
  [0.24, 0.06, -0.42, 0.042],
  [0.29, 0.055, -0.43, 0.032],
];

export function buildCoinDragon(): Object3D {
  const root = new Object3D();
  root.name = "coin-dragon";

  // rig 管颠簸，root 归 ResidentView 贴地——石傀儡浮空那条老坑
  const rig = new Object3D();
  rig.name = "rig";
  root.add(rig);

  const body = new Object3D();
  body.name = "body";
  rig.add(body);

  // ---- 蛇身：一串球 + 腹甲 ----
  const segments: Mesh[] = [];
  for (const [i, [x, y, z, r]] of SPINE.entries()) {
    /*
     * 每节沿脊柱方向拉长 1.35：球和球要**叠到看不出接缝**。
     * 第一版等比球一节节分明，前段读成米其林轮胎人——蛇身的连续感
     * 全靠相邻球的重叠率，宁可过叠不可欠叠。
     */
    const seg = ball(r, PALETTE.dragonBody, {
      position: [x, y, z],
      scale: [1, 0.92, 1.35],
      segments: [18, 14],
    });
    body.add(seg);
    segments.push(seg);

    // 腹甲：胸到尾中段，每节肚皮下贴一片奶白
    if (i >= 1 && i <= 7) {
      body.add(
        ball(r * 0.72, PALETTE.dragonBelly, {
          position: [x, y - r * 0.28, z + (i < 4 ? 0.02 : 0)],
          scale: [0.92, 0.66, 0.96],
          segments: [14, 10],
          castShadow: false,
        }),
      );
    }
    // 背脊的鳞影：颈到尾每节背上压一小片深一档
    if (i >= 0 && i <= 8) {
      body.add(
        ball(r * 0.66, PALETTE.dragonShade, {
          position: [x, y + r * 0.52, z - 0.01],
          scale: [0.8, 0.5, 0.9],
          segments: [12, 10],
          castShadow: false,
          noOutline: true,
        }),
      );
    }
  }

  // 尾鳍：尾尖一片薄荷色的叶状鳍（设定稿"尾巴细节"那栏）
  const tailFin = ball(0.07, PALETTE.dragonMane, {
    position: [0.33, 0.055, -0.44],
    scale: [1.6, 0.25, 0.8],
    rotation: [0, -0.5, 0],
    segments: [12, 8],
  });
  body.add(tailFin);

  // ---- 头 ----
  const headPivot = new Object3D();
  headPivot.name = "head-pivot";
  headPivot.position.set(0, 0.38, 0.12);
  body.add(headPivot);

  const head = new Object3D();
  /*
   * 垂头写在**默认姿势**里：它在挨训。抬头是 walk 时动画给的，
   * 不是默认——这只生物的全部戏份就是被拎回来那一两天。
   */
  head.position.set(0, 0.045, 0.05);
  headPivot.add(head);

  // 头骨：横圆，吻部往前探
  head.add(ball(0.1, PALETTE.dragonBody, { scale: [1.0, 0.88, 1.05], segments: [24, 18] }));
  // 吻部
  head.add(
    ball(0.062, PALETTE.dragonBody, {
      position: [0, -0.028, 0.085],
      scale: [1.05, 0.72, 1.1],
      segments: [16, 12],
    }),
  );
  // 下颌到喉的奶白
  head.add(
    ball(0.055, PALETTE.dragonBelly, {
      position: [0, -0.052, 0.07],
      scale: [1.05, 0.6, 1.0],
      segments: [14, 10],
      castShadow: false,
    }),
  );
  // 鼻头
  head.add(
    ball(0.018, PALETTE.dragonDark, {
      position: [0, -0.012, 0.155],
      scale: [1.4, 0.7, 0.7],
      segments: [10, 8],
      noOutline: true,
    }),
  );

  // 眼睛：大而圆的深潭色，带高光。稿上"眼睛"那格是这只的灵魂
  const eyesOpen = new Object3D();
  const eyesClosed = new Object3D();
  head.add(eyesOpen, eyesClosed);
  for (const side of [-1, 1]) {
    const x = side * 0.052;
    eyesOpen.add(
      ball(0.03, PALETTE.dragonEye, {
        position: [x, 0.022, 0.078],
        segments: [16, 12],
        castShadow: false,
        noOutline: true,
      }),
    );
    eyesOpen.add(
      ball(0.017, PALETTE.petEye, {
        position: [x, 0.022, 0.095],
        segments: [12, 8],
        castShadow: false,
        noOutline: true,
      }),
    );
    const sparkle = new Mesh(
      new SphereGeometry(0.008, 8, 6),
      new MeshBasicMaterial({ color: "#ffffff" }),
    );
    sparkle.position.set(x - side * 0.006, 0.032, 0.104);
    sparkle.castShadow = false;
    sparkle.userData.noOutline = true;
    eyesOpen.add(sparkle);

    const closed = new Mesh(
      new TorusGeometry(0.026, 0.005, 6, 14, Math.PI * 0.85),
      soft(PALETTE.dragonDark),
    );
    closed.position.set(x, 0.024, 0.086);
    closed.rotation.set(0, 0, Math.PI * 1.07);
    closed.castShadow = false;
    closed.userData.noOutline = true;
    eyesClosed.add(closed);
  }
  eyesClosed.visible = false;

  // 幼年角：短、后掠、半透（稿：柔韧有光泽、尚短）
  for (const side of [-1, 1]) {
    const horn = new Mesh(
      new ConeGeometry(0.02, 0.11, 8),
      glassy(PALETTE.dragonHorn, 0.85),
    );
    horn.position.set(side * 0.045, 0.085, -0.02);
    horn.rotation.set(-0.9, 0, side * 0.25);
    horn.castShadow = false;
    head.add(horn);
  }

  // 鬃毛：头顶到颈背几撮薄荷色的软刺
  for (const [i, [y, z, r]] of ([
    [0.09, -0.055, 0.045],
    [0.06, -0.095, 0.05],
    [0.02, -0.12, 0.045],
  ] as const).entries()) {
    head.add(
      ball(r, PALETTE.dragonMane, {
        position: [0, y, z],
        scale: [0.7, 1.2 + i * 0.1, 0.8],
        rotation: [-0.5, 0, 0],
        segments: [10, 8],
        castShadow: false,
      }),
    );
  }
  // 颊边两撮小胡须鳍
  for (const side of [-1, 1]) {
    head.add(
      ball(0.03, PALETTE.dragonMane, {
        position: [side * 0.09, -0.01, 0.02],
        scale: [0.5, 0.8, 1.3],
        rotation: [0, side * 0.5, side * 0.4],
        segments: [10, 8],
        castShadow: false,
      }),
    );
  }

  // ---- 前爪：搭在胸前（被拎回来的那副样子，爪子背在身前绞着） ----
  for (const side of [-1, 1]) {
    const arm = new Object3D();
    arm.position.set(side * 0.095, 0.24, 0.16);
    arm.add(
      ball(0.032, PALETTE.dragonBody, {
        position: [0, -0.045, 0.02],
        scale: [0.8, 1.3, 0.8],
        segments: [12, 10],
      }),
    );
    arm.add(
      ball(0.026, PALETTE.dragonDark, {
        position: [side * -0.01, -0.09, 0.045],
        segments: [10, 8],
      }),
    );
    body.add(arm);
  }

  // ---- 小翅膀：尚未发育完全，半透膜。会偶尔扑一下 ----
  const wings: Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = new Object3D();
    wing.name = side < 0 ? "wing-left" : "wing-right";
    wing.position.set(side * 0.08, 0.3, 0.06);

    const membrane = new Mesh(
      new SphereGeometry(0.11, 12, 8),
      glassy(PALETTE.dragonWing, 0.55),
    );
    membrane.scale.set(1.5, 0.85, 0.3);
    membrane.position.set(side * 0.1, 0.03, -0.02);
    membrane.rotation.z = side * -0.35;
    membrane.castShadow = false;
    membrane.userData.noOutline = true;
    wing.add(membrane);
    // 翼骨前缘
    wing.add(
      ball(0.02, PALETTE.dragonShade, {
        position: [side * 0.09, 0.075, 0.0],
        scale: [5.5, 0.5, 0.5],
        rotation: [0, 0, side * -0.35],
        segments: [8, 6],
        castShadow: false,
        noOutline: true,
      }),
    );
    body.add(wing);
    wings.push(wing);
  }

  // ---- 动画 ----
  let sleepBlend = 0;
  let walkAmp = 0;
  let phase = 0;
  let elapsed = 0;
  let initialized = false;
  const smooth = (t: number): number => t * t * (3 - 2 * t);

  const GESTURE_DURATION: Record<string, number> = { shake_head: 0.7 };
  let gestureName: string | null = null;
  let gestureElapsed = 0;
  root.userData.playGesture = (name: string): void => {
    if (!(name in GESTURE_DURATION)) return;
    gestureName = name;
    gestureElapsed = 0;
  };

  root.userData.animate = (
    dt: number,
    resident: { state: string; moving: boolean },
  ): void => {
    elapsed += dt;
    const asleep = resident.state === "sleeping";
    if (!initialized) {
      sleepBlend = asleep ? 1 : 0;
      initialized = true;
    }
    sleepBlend +=
      Math.sign((asleep ? 1 : 0) - sleepBlend) *
      Math.min(Math.abs((asleep ? 1 : 0) - sleepBlend), (asleep ? 0.6 : 1.2) * dt);
    const eased = smooth(sleepBlend);

    walkAmp += ((resident.moving ? 1 : 0) - walkAmp) * Math.min(1, dt * 6);
    if (resident.moving) phase += dt * 7;

    // 呼吸：细长的身体起伏在"胸"那几节最明显
    const breath = Math.sin(elapsed * 2.6) * 0.008;
    body.position.y = -0.16 * eased + breath;
    body.scale.set(1 + 0.03 * eased, 1 - 0.1 * eased, 1);

    /*
     * 走路：**行波**沿脊柱往后传。每节按位置错相位左右摆，
     * 蛇身"游"起来的全部秘密就是这一行——整条一起摆是扭秧歌，
     * 错开相位才是波。
     */
    for (const [i, seg] of segments.entries()) {
      const wave = Math.sin(phase - i * 0.55) * 0.035 * walkAmp * (i / 4 + 0.4);
      seg.position.x = SPINE[i][0] + wave;
    }
    tailFin.position.x = 0.33 + Math.sin(phase - 9 * 0.55) * 0.05 * walkAmp;

    /*
     * 尾巴尖不安地卷（idle 专属，稿上"温和"那格的神态）：
     * 慢速的小圆圈，和呼吸不同频——同频会读成"整只在晃"。
     */
    const fidget = (1 - walkAmp) * (1 - eased);
    tailFin.rotation.y = -0.5 + Math.sin(elapsed * 1.3) * 0.35 * fidget;
    tailFin.rotation.z = Math.cos(elapsed * 1.3) * 0.2 * fidget;

    // 翅膀：偶尔扑一下（周期 ~4.7s 里抽 0.6s），walk 时持续小幅扇
    const flapCycle = elapsed % 4.7;
    const idleFlap = flapCycle < 0.6 ? Math.sin((flapCycle / 0.6) * Math.PI * 2) : 0;
    const flap = idleFlap * 0.5 * (1 - walkAmp) + Math.sin(phase * 1.6) * 0.3 * walkAmp;
    wings[0].rotation.z = flap * 0.5;
    wings[1].rotation.z = -flap * 0.5;

    // 头：默认微垂（挨训）；走路抬起来；睡觉埋进身体
    const hang = 0.35 * (1 - walkAmp) * (1 - eased);
    headPivot.rotation.x = hang + 0.7 * eased - 0.15 * walkAmp;
    eyesOpen.visible = eased < 0.5;
    eyesClosed.visible = eased >= 0.5;

    if (gestureName) {
      gestureElapsed += dt;
      const t = Math.min(1, gestureElapsed / GESTURE_DURATION[gestureName]);
      headPivot.rotation.y = Math.sin(t * Math.PI * 4) * 0.4 * Math.sin(t * Math.PI);
      if (t >= 1) {
        gestureName = null;
        headPivot.rotation.y = 0;
      }
    }
  };

  root.userData.outlineScale = 1.02;
  return root;
}
