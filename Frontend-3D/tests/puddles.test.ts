import { beforeEach, expect, test } from "vitest";
import { Locomotion } from "core";
import { Scene } from "three";

import { updateGraphicsSettings } from "../src/Game3D/Engine/graphicsSettings";
import { puddleTuning } from "../src/Game3D/Visual/rainTuning";
import { PuddleField } from "../src/Game3D/World/PuddleField";

/** 雨天积水（2026-09-18）：湿度慢慢积、慢慢干；波纹的环形缓冲；脚步只在动的时候发 */

const AREA = { minX: -10, maxX: 10, minZ: -10, maxZ: 10, y: 0 };

// 画质里默认是关的（Reflector 费性能）；用例要看它工作，先开
beforeEach(() => {
  updateGraphicsSettings({ puddles: true });
});

test("puddles_画质里关了就不画", () => {
  updateGraphicsSettings({ puddles: false });
  const scene = new Scene();
  const field = new PuddleField(scene, AREA);
  field.setRain(1);
  for (let i = 0; i < 60 * 40; i += 1) field.update(1 / 60, { x: 0, z: 0 });
  expect(scene.getObjectByName("puddles")!.visible).toBe(false);
  updateGraphicsSettings({ puddles: true });
  field.update(1 / 60, { x: 0, z: 0 });
  expect(scene.getObjectByName("puddles")!.visible).toBe(true);
  field.dispose();
});

test("puddles_下雨积_雨停干_没湿不渲倒影", () => {
  const scene = new Scene();
  const field = new PuddleField(scene, AREA);
  const mesh = scene.getObjectByName("puddles")!;
  expect(mesh.visible).toBe(false);
  field.setRain(1);
  for (let i = 0; i < 60 * puddleTuning.fillSeconds; i += 1) field.update(1 / 60, { x: 0, z: 0 });
  expect(field.wetness).toBeCloseTo(1, 1);
  expect(mesh.visible).toBe(true);
  field.setRain(0);
  for (let i = 0; i < 60 * puddleTuning.drySeconds + 60; i += 1) field.update(1 / 60, { x: 0, z: 0 });
  expect(field.wetness).toBe(0);
  expect(mesh.visible).toBe(false);
  field.dispose();
});

test("puddles_不积水的格_写进屏蔽贴图_区域外忽略", () => {
  const field = new PuddleField(new Scene(), AREA);
  field.setBlockedCells([{ x: -9.5, z: -9.5 }, { x: 0.5, z: 0.5 }, { x: 50, z: 50 }]);
  expect(field.blockedCount).toBe(2);
  field.setBlockedCells([]);
  expect(field.blockedCount).toBe(0);
  field.dispose();
});

test("puddles_脚步波纹_动才发_区域外不发_环形缓冲不越界", () => {
  const scene = new Scene();
  const field = new PuddleField(scene, AREA);
  const material = (scene.getObjectByName("puddles") as import("three").Mesh).material as import("three").ShaderMaterial;
  const ripples = material.uniforms.uRipples.value as Array<{ z: number; w: number }>;
  const born = () => ripples.filter((r) => r.z >= 0).length;
  field.setRain(1);
  for (let i = 0; i < 60 * 3; i += 1) field.update(1 / 60, { x: 0, z: 0 });
  // 站着不动：只有雨点波纹
  const rainOnly = born();
  for (let i = 0; i < 60; i += 1) field.update(1 / 60, { x: 0, z: 0, player: { x: 1, z: 1, locomotion: Locomotion.Idle } });
  const withFoot = born();
  for (let i = 0; i < 60; i += 1) field.update(1 / 60, { x: 0, z: 0, player: { x: 1, z: 1, locomotion: Locomotion.Walk } });
  const foot = ripples.filter((r) => r.w === 0.9).length;
  expect(foot).toBeGreaterThanOrEqual(3);
  expect(withFoot).toBeGreaterThanOrEqual(rainOnly);
  // 区域外走不发脚步
  const before = ripples.filter((r) => r.w === 0.9).length;
  field.setRain(0);
  for (let i = 0; i < 60; i += 1) field.update(1 / 60, { x: 0, z: 0, player: { x: 50, z: 50, locomotion: Locomotion.Walk } });
  expect(ripples.filter((r) => r.w === 0.9).length).toBe(before);
  // 缓冲 48 个，塞 200 个不越界
  for (let i = 0; i < 200; i += 1) field.ripple(0, 0, 0.3);
  expect(ripples.length).toBe(48);
  field.dispose();
});
