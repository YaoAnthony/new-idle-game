import assert from "node:assert/strict";
import { test } from "node:test";

import { approachAngle, headYawToward, wrapAngle } from "../src/logic/attention.js";

/**
 * 注视的几何（居民系统 21）：转身走最短的一边、不一帧到位；头相对身体扭多少、夹在限角内。
 */

test("attention_wrapAngle_折回半圈以内", () => {
  assert.equal(wrapAngle(0), 0);
  assert.ok(Math.abs(wrapAngle(Math.PI * 2) - 0) < 1e-12);
  assert.ok(Math.abs(wrapAngle(Math.PI * 1.5) - -Math.PI * 0.5) < 1e-12);
  assert.ok(Math.abs(wrapAngle(-Math.PI * 1.5) - Math.PI * 0.5) < 1e-12);
  // 正好 π 落在 (−π, π] 的右端
  assert.equal(wrapAngle(Math.PI), Math.PI);
});

test("attention_approachAngle_走最短的那一边_逐帧逼近不一帧到位", () => {
  // 从 −170° 转到 +170°：最短是往负方向走 20°，不是往正方向绕 340°
  const from = -Math.PI * (170 / 180);
  const to = Math.PI * (170 / 180);
  const next = approachAngle(from, to, 10, 1 / 60);
  assert.ok(next < from, "该往负方向转");
  assert.ok(Math.abs(wrapAngle(to - next)) < Math.abs(wrapAngle(to - from)), "差距该变小");

  // 一帧收掉 rate·dt 的比例：10 × 1/60 ≈ 1/6
  const step = approachAngle(0, 1, 10, 1 / 60);
  assert.ok(Math.abs(step - 1 / 6) < 1e-9);
  // 帧率极低（rate·dt ≥ 1）一帧到位，不会转过头
  assert.equal(approachAngle(0, 1, 10, 1), 1);
});

test("attention_headYawToward_相对身体的角度_夹在限角内_同一点不扭", () => {
  // 身体朝 +z，目标在正右前方（+x）：头该往 +x 扭 45°
  assert.ok(Math.abs(headYawToward(0, 0, 0, 1, 1, 0.9) - Math.PI / 4) < 1e-12);
  // 身体已经朝着目标：不扭
  assert.ok(Math.abs(headYawToward(Math.PI / 4, 0, 0, 1, 1, 0.9)) < 1e-12);
  // 目标在正后方：夹到限角（不会扭 180°）
  assert.equal(headYawToward(0, 0, 0, 0, -1, 0.9), 0.9);
  // 目标在左后方：夹到 −限角
  assert.equal(headYawToward(0, 0, 0, -1, -1, 0.9), -0.9);
  // 目标就在脚下
  assert.equal(headYawToward(1.2, 3, 4, 3, 4, 0.9), 0);
});
