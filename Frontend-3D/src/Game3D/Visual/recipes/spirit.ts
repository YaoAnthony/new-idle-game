import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder } from "../primitives.js";

/**
 * 精灵「薇尔」——期 4 的第三位居民。**造型照用户 2026-08-24 的设计稿。**
 *
 * ## 先把世界观那条落下来
 *
 * 用户 2026-08-24 定过：**尖耳朵人形，像个小人，不是 wisp 那一支**
 * （wisp 是"环境自己长出来的元素凝聚体"）。稿子把这条坐实了——她是个
 * **游侠**：兜帽斗篷、单边护肩、皮带挂包、长靴。世界观里因此多了一支
 * "有文明、会做装备的小人"，这不是美术细节，是设定。
 *
 * ## 稿子上定死的
 *
 * - **头身比约 1:4，风格偏可爱**（三头身出头，不是写实八头身）
 * - 三角面约 600~800 —— 三位里最省的一只，因为她全是硬边方块
 * - 整体造型简洁、轮廓清晰、**装备结构简化**
 * - **布料与盔甲分块清晰，适合模块化制作**
 *
 * 最后那条落到我们这儿就是：**每一块装备是一个独立几何**，不做贴图分色
 * （全场都没有 UV 贴图管线）。好处是以后换装备只换那一块。
 *
 * ## 剪影：兜帽 + 单边护肩 + 下摆
 *
 * 三位邻居里她是唯一的人形，最容易和石傀儡、和玩家自己糊在一起。
 * 拉开距离靠三样：**尖耳朵戳出兜帽**、**只有一边有护肩**（不对称是最
 * 廉价的辨识度）、**斗篷下摆开叉**。石傀儡那期的教训是"人形的辨识度
 * 几乎全在剪影上"，这三样就是她的剪影。
 *
 * `userData.animate` 三态：
 * - **idle**：呼吸、斗篷下摆轻晃、偶尔看看左右
 * - **走**：迈步、手臂前后摆、斗篷滞后飘
 * - **睡**：坐下、头垂、兜帽盖住脸
 */

/** 身高（米）。头身比 1:4，这里是全身高 */
const HEIGHT = 0.62;
const HEAD_R = HEIGHT / 4 / 2; // 1:4 → 头占四分之一，半径是它的一半
const HEAD_Y = HEIGHT - HEAD_R * 1.05;
const HIP_Y = HEIGHT * 0.42;
const SHOULDER_Y = HEIGHT * 0.68;

export function buildSpirit(): Object3D {
  const root = new Object3D();
  const rig = new Object3D();
  rig.name = "rig";
  root.add(rig);
  const body = new Object3D();
  body.name = "body";
  rig.add(body);

  // ---- 腿 + 靴子 ----
  const legs: Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new Object3D();
    leg.position.set(side * 0.035, HIP_Y, 0);
    leg.add(
      box([0.052, HIP_Y * 0.62, 0.062], {
        position: [0, -HIP_Y * 0.31, 0],
        color: PALETTE.elfTrouser,
      }),
    );
    // 长靴：稿子里靴筒明显比脚粗一圈，那一圈是它的辨识度
    leg.add(
      box([0.062, HIP_Y * 0.34, 0.07], {
        position: [0, -HIP_Y * 0.79, 0],
        color: PALETTE.elfLeather,
      }),
    );
    leg.add(
      box([0.062, 0.03, 0.085], {
        position: [0, -HIP_Y * 0.96, 0.014],
        color: PALETTE.elfLeatherDeep,
      }),
    );
    body.add(leg);
    legs.push(leg);
  }

  // ---- 躯干 ----
  body.add(
    box([0.115, HEIGHT * 0.26, 0.098], {
      position: [0, HIP_Y + HEIGHT * 0.13, 0],
      color: PALETTE.elfCloakDeep,
    }),
  );
  // 腰带 + 挂包（稿子：皮带挂包）
  body.add(
    box([0.125, 0.026, 0.085], {
      position: [0, HIP_Y + 0.012, 0],
      color: PALETTE.elfLeather,
    }),
  );
  body.add(
    box([0.04, 0.045, 0.03], {
      position: [0.062, HIP_Y - 0.012, 0.03],
      color: PALETTE.elfLeatherDeep,
    }),
  );

  // ---- 斗篷：兜帽 + 下摆（剪影的大头）----
  /*
   * 下摆挂在**独立节点**上，不跟躯干一起转：走路时它要滞后飘一下。
   * 和狐狸的尾巴、史莱姆头顶那滴是同一招——身体停了它还在动，
   * 观众就认定这是块布而不是一块板。
   */
  const cloak = new Object3D();
  cloak.name = "cloak";
  cloak.position.set(0, SHOULDER_Y, 0);
  body.add(cloak);
  /*
   * **一整圈，不是背后一片。** 第一版只做了背面，正视图里她是个穿黑背心
   * 的小人，斗篷完全没读出来。稿子正视图上斗篷是从肩膀垂到膝盖、
   * 前面敞开的——所以做成一整圈锥筒，再在正面开一条缝。
   */
  /*
   * **披在背后，不是套住全身。**
   *
   * 改了两版。第一版只做背面一片，正视图里斗篷完全没读出来；第二版做成
   * 一整圈锥筒，结果把躯干、腰带、手臂全吞了，整个人是个绿色交通锥。
   *
   * 稿子正视图上能同时看见：敞开的斗篷、里面的深色上衣、棕皮带挂包、
   * 深色裤子、棕靴——**分层是这只的全部信息量**（"布料与盔甲分块清晰"
   * 那条讲的就是它）。所以斗篷整体往后挪，只在两肩留下垂到大腿的衣襟。
   */
  cloak.add(
    cylinder(0.082, 0.125, HEIGHT * 0.4, 7, {
      position: [0, -HEIGHT * 0.2, -0.052],
      scale: [1, 1, 0.5],
      color: PALETTE.elfCloak,
    }),
  );
  // 两肩垂下来的衣襟：斗篷从正面看得见的**只有这两条**
  for (const side of [-1, 1]) {
    cloak.add(
      box([0.042, HEIGHT * 0.3, 0.018], {
        // 挪到手臂外侧：盖住手臂的话，棕护腕和手全看不见了
        position: [side * 0.098, -HEIGHT * 0.16, 0.016],
        rotation: [0, side * -0.3, side * 0.06],
        color: PALETTE.elfCloak,
      }),
    );
  }
  // 肩上那圈短披肩：把头和躯干接起来，不然头像浮在盒子上
  cloak.add(
    cylinder(0.062, 0.098, 0.055, 7, {
      position: [0, 0.012, -0.008],
      color: PALETTE.elfCloakDeep,
    }),
  );
  // 下摆的尖角（稿子后视图上斗篷底是个 V）
  cloak.add(
    cylinder(0.0, 0.075, HEIGHT * 0.12, 4, {
      position: [0, -HEIGHT * 0.45, -0.052],
      rotation: [Math.PI, 0, Math.PI / 4],
      scale: [1, 1, 0.62],
      color: PALETTE.elfCloak,
    }),
  );
  // 背后的米色叶徽（稿子后视图那个图案，低模里就是一小块颜色）
  cloak.add(
    box([0.035, 0.07, 0.008], {
      position: [0, -HEIGHT * 0.22, -0.086],
      color: PALETTE.elfTrim,
      castShadow: false,
    }),
  );

  // ---- 手臂 ----
  const arms: Object3D[] = [];
  for (const side of [-1, 1]) {
    const arm = new Object3D();
    arm.position.set(side * 0.072, SHOULDER_Y - 0.01, 0);
    arm.add(
      box([0.04, HEIGHT * 0.2, 0.052], {
        position: [0, -HEIGHT * 0.1, 0],
        color: PALETTE.elfCloak,
      }),
    );
    // 护腕
    arm.add(
      box([0.042, 0.04, 0.044], {
        position: [0, -HEIGHT * 0.19, 0],
        color: PALETTE.elfLeather,
      }),
    );
    arm.add(
      blob(0.024, 0, {
        position: [0, -HEIGHT * 0.235, 0],
        color: PALETTE.elfSkin,
      }),
    );
    arm.rotation.z = side * 0.06;
    body.add(arm);
    arms.push(arm);
  }

  /*
   * **只有一边有护肩。** 稿子上就是单边，而这恰好是最省事的辨识度：
   * 不对称的剪影在任何角度都认得出来，对称的怎么看都像个普通小人。
   */
  const pauldron = new Object3D();
  /*
   * 位置调了三次。判据是它得**压在手臂顶端上**：手臂挂在
   * `SHOULDER_Y - 0.01`、x = ±0.072，护肩就该盖在那儿，往上挪一点点是
   * 甲片的厚度，多一分就飘在肩膀上空了（第二版 +0.038 就是这个下场）。
   */
  pauldron.position.set(0.074, SHOULDER_Y + 0.004, 0);
  /*
   * 护肩是**扣在肩膀上的一顶碗**，不是横插一根柱子。第一版用竖着的圆柱
   * 加个倾角，正视图里像肩膀上戳出来一把扳手。压扁的团子才是"甲片"。
   */
  pauldron.add(
    blob(0.058, 1, {
      scale: [1.1, 0.62, 1.0],
      rotation: [0, 0, -0.22],
      color: PALETTE.elfArmor,
    }),
  );
  pauldron.add(
    blob(0.042, 1, {
      position: [0.004, 0.024, 0],
      scale: [1.05, 0.5, 0.95],
      rotation: [0, 0, -0.22],
      color: PALETTE.elfArmorLight,
    }),
  );
  body.add(pauldron);

  // ---- 头 ----
  const head = new Object3D();
  head.name = "head";
  head.position.set(0, HEAD_Y, 0);
  body.add(head);
  head.add(blob(HEAD_R, 1, { scale: [0.92, 1, 0.92], color: PALETTE.elfSkin }));

  // 头发：银灰，盖住上半个头 + 前面一撮刘海
  head.add(
    blob(HEAD_R * 1.04, 1, {
      position: [0, HEAD_R * 0.2, -0.004],
      scale: [1, 0.82, 1],
      color: PALETTE.elfHair,
    }),
  );
  head.add(
    box([HEAD_R * 1.15, HEAD_R * 0.34, 0.02], {
      position: [0, HEAD_R * 0.42, HEAD_R * 0.86],
      color: PALETTE.elfHair,
    }),
  );

  /*
   * **尖耳朵**：这只最要紧的一件事。做长、往外斜上——稿子上耳朵明显
   * 戳出发际线，那是"她是精灵不是小孩"的唯一凭据。
   */
  for (const side of [-1, 1]) {
    head.add(
      cylinder(0.0, 0.024, HEAD_R * 1.15, 4, {
        position: [side * HEAD_R * 0.82, HEAD_R * 0.2, -0.012],
        // 往外斜上再往后压：横着长会读成翅膀，斜着才是精灵耳
        rotation: [0.5, 0, side * -0.85],
        color: PALETTE.elfSkin,
      }),
    );
  }

  /*
   * 兜帽。第一版用一根罩住整个头的圆柱，渲出来像扣了个桶，脸和耳朵全
   * 埋在里面。改成两块：**后脑一坨**（帽子堆在后面的量感）+ **头顶一道
   * 帽檐**（从额头往后压）。前面完全敞开，脸和尖耳朵都露得出来。
   */
  head.add(
    blob(HEAD_R * 0.95, 1, {
      position: [0, -HEAD_R * 0.1, -HEAD_R * 0.95],
      scale: [1.05, 0.95, 0.8],
      color: PALETTE.elfCloak,
    }),
  );
  head.add(
    cylinder(HEAD_R * 0.5, HEAD_R * 1.12, HEAD_R * 0.5, 7, {
      position: [0, HEAD_R * 0.72, -HEAD_R * 0.2],
      scale: [1, 1, 0.92],
      color: PALETTE.elfCloak,
    }),
  );

  // 眼睛：稿子是蓝的，低模里两块小方就够
  const eyes: Object3D[] = [];
  for (const side of [-1, 1]) {
    const eye = new Object3D();
    eye.position.set(side * HEAD_R * 0.38, HEAD_R * 0.02, HEAD_R * 0.88);
    eye.add(
      box([0.022, 0.024, 0.008], { color: "#ffffff", castShadow: false }),
    );
    eye.add(
      box([0.013, 0.018, 0.008], {
        position: [side * 0.002, -0.001, 0.004],
        color: PALETTE.elfEye,
        castShadow: false,
      }),
    );
    head.add(eye);
    eyes.push(eye);
  }

  // ---- 动起来 ----
  let elapsed = 0;
  let cloakLag = 0;

  root.userData.animate = (
    dt: number,
    resident: { state: string; moving: boolean },
  ): void => {
    elapsed += dt;
    const asleep = resident.state === "sleeping";
    const speed = resident.moving ? 6.2 : 1.5;
    const wave = Math.sin(elapsed * speed);

    if (asleep) {
      // 坐下、头垂、兜帽盖住脸
      body.position.y = -HEIGHT * 0.2;
      body.rotation.x = 0.12;
      head.rotation.x = 0.5;
      for (const eye of eyes) eye.scale.y = 0.12;
      legs[0].rotation.x = -1.2;
      legs[1].rotation.x = -1.2;
      arms[0].rotation.x = 0.2;
      arms[1].rotation.x = 0.2;
      cloak.rotation.x = 0.1;
      return;
    }

    body.position.y = 0;
    body.rotation.x = 0;
    for (const eye of eyes) eye.scale.y = 1;

    if (resident.moving) {
      legs[0].rotation.x = wave * 0.6;
      legs[1].rotation.x = -wave * 0.6;
      arms[0].rotation.x = -wave * 0.5;
      arms[1].rotation.x = wave * 0.5;
      body.position.y = Math.abs(wave) * 0.008;
      head.rotation.y = 0;
    } else {
      const breath = 1 + Math.sin(elapsed * 1.5) * 0.015;
      body.scale.set(1, breath, 1);
      legs[0].rotation.x = 0;
      legs[1].rotation.x = 0;
      arms[0].rotation.x = 0;
      arms[1].rotation.x = 0;
      // 站着的时候偶尔左右看一眼——静止的人形最容易读成雕像
      head.rotation.y = Math.sin(elapsed * 0.42) * 0.3;
    }
    head.rotation.x = 0;

    // 斗篷滞后：身体停了它还飘一下，那一下才让人相信它是布
    const wanted = wave * (resident.moving ? 0.22 : 0.05);
    cloakLag += (wanted - cloakLag) * Math.min(1, dt * 5);
    cloak.rotation.x = -cloakLag * 0.6;
    cloak.rotation.z = cloakLag * 0.35;
  };

  return root;
}
