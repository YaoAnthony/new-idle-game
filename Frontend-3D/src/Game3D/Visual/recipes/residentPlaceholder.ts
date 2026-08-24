import {
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
 * 三位居民的**占位造型**（期 4）。
 *
 * ⚠️ 这不是正式模型——用户还没给史莱姆/小狐狸/精灵的参考图，而搬入
 * 机制要能在实机跑通，就得有个看得见、撞得到的东西站在那儿。占位是
 * 一颗软乎乎的团子 + 大眼睛，各染各的色，头顶飘一个问号圈：**问号就是
 * "我还在等参考图"的自我声明**，谁在游戏里看到它都知道这不是成品。
 *
 * 图到了之后：各写各的 `recipes/<名>.ts`，VisualRegistry 里换一行，
 * 本文件删除。宠物定义、剧情、搬入逻辑**都不用动**。
 */

function soft(value: ColorRepresentation): MeshLambertMaterial {
  return new MeshLambertMaterial({ color: value, flatShading: false });
}

function buildPlaceholder(tint: ColorRepresentation): Object3D {
  const root = new Object3D();
  const rig = new Object3D();
  rig.name = "rig";
  root.add(rig);
  const body = new Object3D();
  body.name = "body";
  rig.add(body);

  // 团子身体
  const blob = new Mesh(new SphereGeometry(0.22, 24, 18), soft(tint));
  blob.position.y = 0.22;
  blob.scale.set(1, 0.9, 1);
  blob.castShadow = true;
  body.add(blob);

  // 一对大眼睛（有眼睛就有"活物"的错觉，占位也不该像一块石头）
  for (const side of [-1, 1]) {
    const eye = new Mesh(
      new SphereGeometry(0.032, 14, 10),
      soft(PALETTE.petEye),
    );
    eye.position.set(side * 0.075, 0.26, 0.185);
    eye.castShadow = false;
    eye.userData.noOutline = true;
    body.add(eye);
    const sparkle = new Mesh(
      new SphereGeometry(0.011, 8, 6),
      new MeshBasicMaterial({ color: "#ffffff" }),
    );
    sparkle.position.set(side * 0.065, 0.272, 0.208);
    sparkle.castShadow = false;
    sparkle.userData.noOutline = true;
    body.add(sparkle);
  }

  // 头顶的问号圈："等参考图"写在脸上
  const halo = new Mesh(
    new TorusGeometry(0.07, 0.014, 8, 20, Math.PI * 1.4),
    soft("#d9c98f"),
  );
  halo.position.set(0, 0.56, 0);
  halo.rotation.z = Math.PI * 0.8;
  halo.castShadow = false;
  halo.userData.noOutline = true;
  body.add(halo);
  const dot = new Mesh(new SphereGeometry(0.016, 8, 6), soft("#d9c98f"));
  dot.position.set(0, 0.47, 0);
  dot.castShadow = false;
  dot.userData.noOutline = true;
  body.add(dot);

  // 最小动画：呼吸 + 走路颠一颠 + 睡下去。占位也不能是死的
  let phase = 0;
  let elapsed = 0;
  let sleepBlend = 0;
  root.userData.animate = (
    dt: number,
    pet: { state: string; moving: boolean },
  ): void => {
    elapsed += dt;
    const asleep = pet.state === "sleeping";
    sleepBlend +=
      Math.sign((asleep ? 1 : 0) - sleepBlend) *
      Math.min(Math.abs((asleep ? 1 : 0) - sleepBlend), dt);
    if (pet.moving) phase += dt * 8;
    const breath = Math.sin(elapsed * 2.4) * 0.012;
    body.position.y = Math.abs(Math.sin(phase)) * 0.05 * (pet.moving ? 1 : 0) - 0.1 * sleepBlend;
    body.scale.set(1 + breath, 1 - breath - 0.15 * sleepBlend, 1 + breath);
  };
  root.userData.outlineScale = 1.02;
  return root;
}

export function buildSlimePlaceholder(): Object3D {
  return buildPlaceholder("#8fd0a0"); // 史莱姆：果冻绿
}
export function buildFoxPlaceholder(): Object3D {
  return buildPlaceholder("#d99a5b"); // 小狐狸：橘
}
export function buildSpiritPlaceholder(): Object3D {
  return buildPlaceholder("#c6b8e0"); // 精灵：淡紫
}
