import { Object3D } from "three";
import { box, cylinder, group } from "../primitives.js";

/**
 * 魔女留在门上的信封（2026-09-09）。**照快捷栏图标 witch_letter.png 做的**：
 * 奶油色信封、V 形封盖、紫色蜡封上一弯金月牙和一颗小星、蜡封底下垂两条
 * 紫缎带、缎带之间吊一颗金坠子。颜色是从图上采的，不借色板里最接近的。
 *
 * 朝向：立着，宽沿 X、高沿 Y，**正面（有蜡封那面）朝 +Z**，中心在原点。
 * 挂在门上时由门自己转到朝屋外；拿在手上照 HeldItemView 的规矩缩放。
 */

const CREAM = "#f3e1b6";
const CREAM_SHADE = "#e4cb97";
const PURPLE = "#5e3a7c";
const PURPLE_DARK = "#472b60";
const GOLD = "#e8b93f";

const W = 0.4;
const H = 0.28;
const T = 0.02;

export function buildWitchLetter(): Object3D {
  const parts: Object3D[] = [];

  // 信封本体
  parts.push(box([W, H, T], { color: CREAM, position: [0, 0, 0] }));

  // V 形封盖：两条从上角斜到中心的暗边，压在正面上
  const flapLen = Math.hypot(W / 2, H * 0.55);
  const flapAngle = Math.atan2(H * 0.55, W / 2);
  for (const side of [-1, 1]) {
    parts.push(
      box([flapLen, 0.014, 0.006], {
        color: CREAM_SHADE,
        position: [(side * W) / 4, H / 2 - H * 0.275, T / 2 + 0.003],
        rotation: [0, 0, -side * flapAngle],
        castShadow: false,
      }),
    );
  }
  // 封盖那一片本身比信封身略深一点，才读得出"盖上去"
  parts.push(
    box([W, H * 0.12, 0.004], {
      color: CREAM_SHADE,
      position: [0, H / 2 - H * 0.06, T / 2 + 0.001],
      castShadow: false,
    }),
  );

  // 蜡封：紫色圆片（十边形，边缘自带一点"蜡溢出来"的不规则感）
  const sealR = 0.06;
  const sealZ = T / 2 + 0.012;
  const sealY = -H * 0.05;
  parts.push(
    cylinder(sealR, sealR * 0.92, 0.016, 10, {
      color: PURPLE,
      position: [0, sealY, sealZ],
      rotation: [Math.PI / 2, 0, 0],
    }),
    cylinder(sealR * 0.78, sealR * 0.78, 0.006, 10, {
      color: PURPLE_DARK,
      position: [0, sealY, sealZ + 0.009],
      rotation: [Math.PI / 2, 0, 0],
      castShadow: false,
    }),
  );
  // 金月牙：一枚金圆片被一枚偏右的紫圆片"咬"掉一块
  const moonZ = sealZ + 0.014;
  parts.push(
    cylinder(0.03, 0.03, 0.006, 12, {
      color: GOLD,
      position: [-0.006, sealY, moonZ],
      rotation: [Math.PI / 2, 0, 0],
      castShadow: false,
    }),
    cylinder(0.026, 0.026, 0.008, 12, {
      color: PURPLE_DARK,
      position: [0.008, sealY + 0.004, moonZ + 0.002],
      rotation: [Math.PI / 2, 0, 0],
      castShadow: false,
    }),
  );
  // 小星：一枚立起来的金菱形
  parts.push(
    box([0.014, 0.014, 0.006], {
      color: GOLD,
      position: [0.026, sealY + 0.02, moonZ + 0.004],
      rotation: [0, 0, Math.PI / 4],
      castShadow: false,
    }),
  );

  // 两条紫缎带从蜡封底下垂下来，微微外撇
  const ribbonLen = H * 0.5;
  for (const side of [-1, 1]) {
    parts.push(
      box([0.05, ribbonLen, 0.006], {
        color: PURPLE,
        position: [
          side * 0.032,
          sealY - sealR - ribbonLen / 2 + 0.03,
          T / 2 + 0.004,
        ],
        rotation: [0, 0, side * 0.22],
        castShadow: false,
      }),
    );
  }
  // 金坠子：一根短线 + 一枚菱形，吊在两条缎带之间
  parts.push(
    box([0.006, 0.03, 0.004], {
      color: GOLD,
      position: [0, sealY - sealR - 0.012, T / 2 + 0.008],
      castShadow: false,
    }),
    box([0.03, 0.03, 0.008], {
      color: GOLD,
      position: [0, sealY - sealR - 0.05, T / 2 + 0.008],
      rotation: [0, 0, Math.PI / 4],
      castShadow: false,
    }),
  );

  const root = group("witch_letter", parts);
  root.position.y = H / 2;
  return root;
}
