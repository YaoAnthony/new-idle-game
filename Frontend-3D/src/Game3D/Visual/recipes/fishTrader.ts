import { Object3D } from "three";
import { PALETTE } from "../palette.js";
import { blob, box, cylinder, sphere } from "../primitives.js";

/**
 * 旅行商人「小鱼人」——期 6 的稀客。**造型照用户 2026-08-24 的设计稿。**
 *
 * ## 稿子上定死的
 *
 * - 种族鱼人，性格乐观 / 友善 / 好奇
 * - **拖着一辆浮筏车在水边卖各种实用好物**
 * - 头两侧一对**橙色的鳍**（长在耳朵的位置）、身后一条橙尾鳍
 * - 一顶**土黄圆帽**、一条围巾、斜挎的皮带 + 腰包
 * - 全身低模切面，八个色（配色栏没标 hex，对着图取的）
 *
 * ## 和水獭的分工，配色和剪影都要拉开
 *
 * 两个都是"来来去去的商人"，玩家最容易把他们看糊。分工是硬的：
 *
 * | | 水獭 | 小鱼人 |
 * |---|---|---|
 * | 周期 | 三天（熟人） | 八天（稀客） |
 * | 主业 | **收**家具 | **卖**稀罕东西 |
 * | 配色 | 暖棕 + 奶白，陆生毛皮 | **青蓝 + 橙鳍**，水生鳞皮 |
 * | 剪影 | 比人还高的**大背包** | 身后拖着的**浮筏车** |
 *
 * 一暖一冷、一背一拖。这不是装饰，是"今天来的是谁"必须一眼分得出来。
 *
 * ## 车是独立配方
 *
 * 浮筏车不在这个文件里（见 `raftCart.ts`）。稿子把它单列成「车体参考」
 * 而且配件是模块化的一排——它更像一件**会跟着他走的家当**，不是身体的
 * 一部分。分开之后，"他今天没出摊只是路过"这种演出也做得出来。
 *
 * `userData.animate` 三态：
 * - **idle**：呼吸、鳍轻轻扇、偶尔歪头（好奇是他的性格）
 * - **走**：两条短腿倒腾、身体左右晃、尾鳍摆
 * - **睡**：蹲下去、帽子压到眼睛、鳍垂下来
 */

/*
 * 身高约 0.55 米：比水獭（0.68）矮一点、圆一点——稿子上是个矮胖子。
 * 没有单独的 HEIGHT 常量，下面几个位置量各自定死；这只身上没有任何
 * 尺寸是按总高的比例推的，多一个常量只会让人以为改它能整体缩放。
 */
const LEG_H = 0.06;
const TORSO_Y = 0.21;
const TORSO_R = 0.135;
const HEAD_Y = 0.4;
const HEAD_R = TORSO_R * 0.98;

export function buildFishTrader(): Object3D {
  const root = new Object3D();
  const rig = new Object3D();
  rig.name = "rig";
  root.add(rig);
  const body = new Object3D();
  body.name = "body";
  rig.add(body);

  // ---- 蹼脚 ----
  const legs: Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new Object3D();
    leg.position.set(side * 0.062, LEG_H, 0);
    leg.add(
      cylinder(0.038, 0.034, LEG_H * 1.4, 6, {
        position: [0, -LEG_H * 0.2, 0],
        color: PALETTE.fishBody,
      }),
    );
    // 蹼：扁而往前伸，站得住也看得出是水里的
    leg.add(
      blob(0.05, 0, {
        position: [0, -LEG_H * 0.85, 0.026],
        scale: [1.05, 0.42, 1.45],
        color: PALETTE.fishFin,
      }),
    );
    body.add(leg);
    legs.push(leg);
  }

  // ---- 躯干：矮胖的水滴 ----
  body.add(
    blob(TORSO_R, 1, {
      position: [0, TORSO_Y, 0],
      scale: [1, 1.05, 0.92],
      color: PALETTE.fishBody,
    }),
  );
  // 肚皮：浅色的一片贴上去（同全场——没有 UV 贴图管线，分色靠多摆一块）
  body.add(
    blob(TORSO_R * 0.82, 1, {
      position: [0, TORSO_Y - 0.012, TORSO_R * 0.46],
      scale: [0.88, 1.05, 0.5],
      color: PALETTE.fishBelly,
    }),
  );

  // 围巾 / 领子
  body.add(
    cylinder(TORSO_R * 0.72, TORSO_R * 0.86, 0.06, 8, {
      position: [0, TORSO_Y + TORSO_R * 0.86, 0],
      color: PALETTE.fishScarf,
    }),
  );

  // 斜挎的皮带 + 腰包（稿子上是他"商人"身份的唯一道具）
  body.add(
    box([0.035, TORSO_R * 1.9, 0.02], {
      position: [-0.03, TORSO_Y + 0.01, TORSO_R * 0.88],
      rotation: [0, 0, 0.42],
      color: PALETTE.raftWoodDeep,
    }),
  );
  body.add(
    box([0.09, 0.075, 0.05], {
      position: [0.105, TORSO_Y - 0.055, 0.055],
      color: PALETTE.raftWood,
    }),
  );
  body.add(
    box([0.095, 0.024, 0.055], {
      position: [0.105, TORSO_Y - 0.022, 0.055],
      color: PALETTE.raftWoodDeep,
      castShadow: false,
    }),
  );

  // ---- 手臂：短，蹼手 ----
  const arms: Object3D[] = [];
  for (const side of [-1, 1]) {
    const arm = new Object3D();
    arm.position.set(side * TORSO_R * 0.94, TORSO_Y + 0.035, 0);
    arm.add(
      cylinder(0.03, 0.026, 0.075, 6, {
        position: [0, -0.036, 0],
        color: PALETTE.fishBody,
      }),
    );
    arm.add(
      blob(0.034, 0, {
        position: [0, -0.078, 0.008],
        scale: [1, 0.8, 1.15],
        color: PALETTE.fishFin,
      }),
    );
    arm.rotation.z = side * 0.26;
    body.add(arm);
    arms.push(arm);
  }

  // ---- 尾鳍：橙色，身后一片 ----
  const tail = new Object3D();
  tail.name = "tail";
  tail.position.set(0, TORSO_Y - 0.02, -TORSO_R * 0.92);
  body.add(tail);
  tail.add(
    cylinder(0.0, 0.075, 0.13, 3, {
      position: [0, 0.01, -0.05],
      rotation: [1.35, 0, 0],
      scale: [1, 1, 0.45],
      color: PALETTE.fishFin,
    }),
  );

  // ---- 头 ----
  const head = new Object3D();
  head.name = "head";
  head.position.set(0, HEAD_Y, 0);
  body.add(head);
  head.add(blob(HEAD_R, 1, { scale: [1, 0.94, 1], color: PALETTE.fishBody }));

  /*
   * **头两侧那对橙鳍**。它长在耳朵的位置，是这只最强的识别点——
   * 远看一团青蓝里支出两片橙，比脸上任何细节都管用。所以做大、做薄、
   * 往外斜上，宁可过头。
   */
  const fins: Object3D[] = [];
  for (const side of [-1, 1]) {
    const fin = new Object3D();
    fin.position.set(side * HEAD_R * 0.88, -0.005, -0.01);
    fin.rotation.z = side * -0.5;
    fin.add(
      cylinder(0.0, 0.062, 0.13, 3, {
        position: [0, 0.05, 0],
        rotation: [0, side * 0.35, 0],
        scale: [1, 1, 0.35],
        color: PALETTE.fishFin,
      }),
    );
    head.add(fin);
    fins.push(fin);
  }

  // 土黄圆帽：稿子上是个盖住半个头的圆顶
  head.add(
    blob(HEAD_R * 1.02, 1, {
      position: [0, HEAD_R * 0.42, -0.004],
      scale: [1.04, 0.62, 1.04],
      color: PALETTE.fishCap,
    }),
  );

  // 大眼睛：鱼人的眼睛该突出来一点
  const eyes: Object3D[] = [];
  for (const side of [-1, 1]) {
    const eye = new Object3D();
    eye.position.set(side * HEAD_R * 0.42, HEAD_R * 0.08, HEAD_R * 0.8);
    eye.add(sphere(0.038, 12, 10, { scale: [1, 1, 0.75], color: "#ffffff", castShadow: false }));
    eye.add(
      sphere(0.023, 10, 8, {
        position: [side * 0.003, 0.001, 0.02],
        scale: [1, 1, 0.7],
        color: "#20262b",
        castShadow: false,
      }),
    );
    eye.add(
      sphere(0.008, 8, 6, {
        position: [side * 0.006 - 0.008, 0.011, 0.035],
        color: "#ffffff",
        castShadow: false,
      }),
    );
    head.add(eye);
    eyes.push(eye);
  }

  // 宽扁的鱼嘴：一条横过去的浅色开口
  head.add(
    blob(0.042, 0, {
      position: [0, -HEAD_R * 0.42, HEAD_R * 0.78],
      scale: [1.25, 0.6, 0.62],
      color: PALETTE.fishBelly,
    }),
  );
  head.add(
    box([0.05, 0.014, 0.012], {
      position: [0, -HEAD_R * 0.46, HEAD_R * 1.05],
      color: "#5b3b34",
      castShadow: false,
    }),
  );

  // 腮红
  for (const side of [-1, 1]) {
    head.add(
      blob(0.026, 0, {
        position: [side * HEAD_R * 0.68, -HEAD_R * 0.24, HEAD_R * 0.68],
        scale: [1.1, 0.6, 0.3],
        color: PALETTE.fishCheek,
        castShadow: false,
      }),
    );
  }

  // ---- 动起来 ----
  let elapsed = 0;
  let tailLag = 0;

  root.userData.animate = (
    dt: number,
    resident: { state: string; moving: boolean },
  ): void => {
    elapsed += dt;
    const asleep = resident.state === "sleeping";
    const speed = resident.moving ? 7.0 : 1.5;
    const wave = Math.sin(elapsed * speed);

    if (asleep) {
      body.position.y = -0.055;
      body.rotation.x = 0.14;
      for (const [i, fin] of fins.entries()) fin.rotation.z = (i === 0 ? 1 : -1) * 0.95;
      for (const eye of eyes) eye.scale.y = 0.12;
      legs[0].rotation.x = 0;
      legs[1].rotation.x = 0;
      head.rotation.z = 0;
      return;
    }

    body.position.y = 0;
    body.rotation.x = 0;
    for (const eye of eyes) eye.scale.y = 1;

    if (resident.moving) {
      legs[0].rotation.x = wave * 0.7;
      legs[1].rotation.x = -wave * 0.7;
      arms[0].rotation.x = -wave * 0.45;
      arms[1].rotation.x = wave * 0.45;
      body.rotation.z = wave * 0.05;
      body.position.y = Math.abs(wave) * 0.01;
      head.rotation.z = 0;
    } else {
      const breath = 1 + Math.sin(elapsed * 1.5) * 0.02;
      body.scale.set(1, breath, 1);
      legs[0].rotation.x = 0;
      legs[1].rotation.x = 0;
      arms[0].rotation.x = 0;
      arms[1].rotation.x = 0;
      body.rotation.z = 0;
      /*
       * 站着的时候**偶尔歪一下头**。稿子给的性格是"好奇"，而好奇落到
       * 一个不会说话的低模身上，最省事也最准的表达就是歪头。
       */
      head.rotation.z = Math.sin(elapsed * 0.55) * 0.16;
    }

    // 头两侧的鳍轻轻扇——水里的东西不会完全静止
    const flap = Math.sin(elapsed * (resident.moving ? 8 : 2.4)) * (resident.moving ? 0.22 : 0.1);
    for (const [i, fin] of fins.entries()) {
      fin.rotation.z = (i === 0 ? 1 : -1) * (0.5 + flap);
    }

    // 尾鳍滞后摆
    const wanted = wave * (resident.moving ? 0.5 : 0.18);
    tailLag += (wanted - tailLag) * Math.min(1, dt * 6);
    tail.rotation.y = tailLag;
  };

  return root;
}
