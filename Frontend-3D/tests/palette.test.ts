import { expect, test } from "vitest";
import { Color } from "three";

import { PALETTE, jitterShade } from "../src/Game3D/Visual/palette";

/**
 * 分块抖动的**取值范围**。
 *
 * 2026-08-22 的回归：`jitterShade` 里 `((x*A) ^ (y*B)) % 1000` 会算出负数
 * （`^` 走 ToInt32 可负，`%` 又保留被除数的符号），抖动量最多到声明值的
 * 三倍且只往暗的一边偏。金币罐 l3 有两只罐的罐身因此被压成 #020100，
 * 看着像模型破了个洞。
 *
 * 判据只有一条、但要覆盖会出事的输入：负数、小数、大到让乘法溢出 int32 的整数。
 */

/** 亮度（HSL 的 L） */
function lightnessOf(c: Color): number {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.l;
}

test("抖动幅度不超过声明的 amount——负数、小数、大整数都不例外", () => {
  const base = PALETTE.woodMid;
  const amount = 0.05;
  const baseL = lightnessOf(new Color(base));

  const inputs: Array<[number, number]> = [];
  // 金币罐 l3 那三只罐的实际偏移（小数，含负数）——原报错现场
  for (const [x, z] of [[-0.85, -0.5], [0.85, -0.5], [0, 0.85]]) {
    inputs.push([x, z], [x + 1, z]);
  }
  // 墙格/地板格：整数，且大到让 x * 73856093 溢出 int32
  for (let x = -40; x <= 60; x += 7) {
    for (let y = 0; y < 5; y += 1) inputs.push([x, y]);
  }

  for (const [x, y] of inputs) {
    const got = lightnessOf(jitterShade(base, x, y, amount));
    expect(
      Math.abs(got - baseL),
      `jitterShade(${base}, ${x}, ${y}, ${amount}) 亮度 ${got.toFixed(3)}，基色 ${baseL.toFixed(3)}`,
    ).toBeLessThanOrEqual(amount + 1e-9);
  }
});

test("同一个格子永远同一个颜色——重新加载场景不会闪", () => {
  const a = jitterShade(PALETTE.wall, 7, 3, 0.04).getHexString();
  const b = jitterShade(PALETTE.wall, 7, 3, 0.04).getHexString();
  expect(a).toBe(b);
  // 相邻格要真的不同，不然抖了等于没抖
  expect(jitterShade(PALETTE.wall, 8, 3, 0.04).getHexString()).not.toBe(a);
});
